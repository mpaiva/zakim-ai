import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { useAudioStore } from './stores/audioStore'
import { useScribeStore } from './stores/scribeStore'
import type { TranscriptionSegment, WhisperWordChunk } from '../shared/types'

export let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let mediaStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let systemDataCleanup: (() => void) | null = null
let recordedChunks: Blob[] = []

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const SILENCE_RMS_THRESHOLD = 0.0005

function computeRms(audio: Float32Array): number {
  let sum = 0
  for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i]
  return Math.sqrt(sum / audio.length)
}

function isHallucination(text: string): boolean {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (sentences.length < 3) return false
  const counts = new Map<string, number>()
  for (const s of sentences) counts.set(s, (counts.get(s) ?? 0) + 1)
  return [...counts.values()].some((c) => c >= 3)
}

async function decodeAudioBlob(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new OfflineAudioContext(1, 1, 16000)
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
  const source = offlineCtx.createBufferSource()
  source.buffer = decoded
  source.connect(offlineCtx.destination)
  source.start()
  const rendered = await offlineCtx.startRendering()
  return rendered.getChannelData(0)
}

function makeSegment(words: WhisperWordChunk[]): TranscriptionSegment {
  return {
    id: makeId(),
    text: words.map((w) => w.text).join('').trim(),
    speaker: null,
    startTime: words[0].timestamp[0],
    endTime: words[words.length - 1].timestamp[1],
  }
}

function splitIntoSegments(chunks: WhisperWordChunk[], stickySpeaker: string | null): TranscriptionSegment[] {
  if (chunks.length === 0) return []
  const segments: TranscriptionSegment[] = []
  let currentWords = [chunks[0]]

  for (let i = 1; i < chunks.length; i++) {
    const gap = chunks[i].timestamp[0] - chunks[i - 1].timestamp[1]
    if (gap >= 1.0) {
      segments.push(makeSegment(currentWords))
      currentWords = [chunks[i]]
    } else {
      currentWords.push(chunks[i])
    }
  }
  segments.push(makeSegment(currentWords))

  if (stickySpeaker) {
    for (const seg of segments) seg.speaker = stickySpeaker
  }

  return segments
}

export async function transcribe(audio: Float32Array) {
  if (!transcriber) {
    console.warn('[audioCapture] transcribe called but transcriber is null')
    return
  }

  const { addTranscription, setTranscribing, bufferDuration } = useAudioStore.getState()
  const { apiKeySet, addMessages, setProcessing } = useScribeStore.getState()

  const rms = computeRms(audio)
  useAudioStore.getState().setLastRms(rms)
  if (rms < SILENCE_RMS_THRESHOLD) {
    console.log(`[audioCapture] Skipping silent buffer (RMS=${rms.toFixed(4)})`)
    return
  }

  console.log(`[audioCapture] Transcribing ${audio.length} samples (${(audio.length / 16000).toFixed(1)}s, RMS=${rms.toFixed(4)})`)
  setTranscribing(true)
  try {
    let result: any
    let hasTimestamps = false
    try {
      result = await transcriber(audio, { language: 'pt', task: 'translate', return_timestamps: 'word' })
      hasTimestamps = true
    } catch {
      try {
        result = await transcriber(audio, { language: 'pt', task: 'translate', return_timestamps: true })
        hasTimestamps = true
      } catch {
        console.warn('[audioCapture] Timestamps not supported, transcribing without')
        result = await transcriber(audio, { language: 'pt', task: 'translate' })
      }
    }

    const singleResult = Array.isArray(result) ? result[0] : result
    const text = singleResult?.text || ''
    console.log(`[audioCapture] Whisper result (timestamps=${hasTimestamps}): "${text}"`)

    if (text && text.trim()) {
      const trimmed = text.trim()

      if (isHallucination(trimmed)) {
        console.log('[audioCapture] Whisper hallucination detected, discarding result')
        return
      }

      const chunks: WhisperWordChunk[] = (singleResult?.chunks || []).map((c: any) => ({
        text: c.text || '',
        timestamp: c.timestamp as [number, number],
      }))

      const currentSticky = useAudioStore.getState().stickySpeaker
      const segments: TranscriptionSegment[] =
        hasTimestamps && chunks.length > 0
          ? splitIntoSegments(chunks, currentSticky)
          : [{ id: makeId(), text: trimmed, speaker: currentSticky, startTime: 0, endTime: 0 }]

      addTranscription({
        id: makeId(),
        timestamp: Date.now(),
        text: trimmed,
        duration: bufferDuration,
        segments,
      })

      const allAssigned = segments.every((s) => s.speaker !== null)
      if (allAssigned && apiKeySet) {
        setTranscribing(false)
        setProcessing(true)
        const speakerTexts = segments.map((s) => ({ speaker: s.speaker!, text: s.text }))
        try {
          const msgs = await window.api.scribe.processSpeakers(speakerTexts)
          console.log(`[audioCapture] processSpeakers returned ${msgs.length} scribe messages`)
          addMessages(msgs)
        } catch (err) {
          console.warn('[audioCapture] processSpeakers failed, falling back:', err)
          try {
            addMessages(await window.api.scribe.process(trimmed))
          } catch (err2) {
            console.error('[audioCapture] Scribe processing failed:', err2)
          }
        } finally {
          setProcessing(false)
        }
        return
      }
    } else {
      console.log('[audioCapture] Whisper returned empty/silent text, skipping')
    }
  } catch (err) {
    console.error('[audioCapture] Transcription failed:', err)
  } finally {
    setTranscribing(false)
  }
}

function flushBuffer() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    console.log('[audioCapture] flushBuffer: recorder not active')
    return
  }

  mediaRecorder.stop()

  mediaRecorder.onstop = async () => {
    const chunks = recordedChunks
    recordedChunks = []
    useAudioStore.getState().setLastFlushTime(Date.now())

    if (chunks.length === 0) {
      console.log('[audioCapture] flushBuffer: no recorded chunks')
    } else {
      const blob = new Blob(chunks, { type: mediaRecorder!.mimeType })
      console.log(`[audioCapture] Buffer flushed: ${blob.size} bytes, transcriber=${!!transcriber}`)
      if (transcriber) {
        try {
          transcribe(await decodeAudioBlob(blob))
        } catch (err) {
          console.error('[audioCapture] Audio decode failed:', err)
        }
      }
    }

    if (mediaStream && mediaStream.active && mediaRecorder) {
      try {
        mediaRecorder.start()
      } catch (err) {
        console.error('[audioCapture] Failed to restart recorder:', err)
      }
    }
  }
}

export async function startCapture() {
  const { selectedSourceId, bufferDuration, setStatus, setLastFlushTime, setWhisperStatus } = useAudioStore.getState()
  if (!selectedSourceId) return
  if (!transcriber) {
    console.warn('[audioCapture] startCapture called but transcriber is null — resetting whisper status')
    setWhisperStatus('unloaded')
    return
  }

  try {
    if (selectedSourceId === '__system__') {
      systemDataCleanup = window.api.audio.onSystemData((samples) => {
        useAudioStore.getState().setLastFlushTime(Date.now())
        console.log(`[audioCapture] System audio: ${samples.length} samples (${(samples.length / 16000).toFixed(1)}s)`)
        if (!transcriber) {
          console.warn('[audioCapture] System audio received but transcriber is null — reload model in Settings')
          return
        }
        transcribe(samples)
      })
      await window.api.audio.systemStart(bufferDuration)
      setLastFlushTime(Date.now())
      setStatus('capturing')
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: selectedSourceId } },
    })
    mediaStream = stream
    recordedChunks = []
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data) }
    recorder.start()
    mediaRecorder = recorder
    console.log(`[audioCapture] MediaRecorder started, mimeType=${recorder.mimeType}`)
    setLastFlushTime(Date.now())
    flushTimer = setInterval(() => flushBuffer(), bufferDuration * 1000)
    setStatus('capturing')
  } catch (err) {
    const msg = (err as Error).message || ''
    console.error('[audioCapture] Audio capture failed:', err)
    setStatus('error')
    useAudioStore.getState().setCaptureError(msg)
    if (msg.toLowerCase().includes('denied')) {
      window.api.shell.openExternal(
        'x-apple.systempreferences:com.apple.systempreferences.PrivacyPreferencesExtension?ScreenCapture'
      )
    }
  }
}

export function stopCapture() {
  if (systemDataCleanup) {
    systemDataCleanup()
    systemDataCleanup = null
    window.api.audio.systemStop()
  }
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  mediaRecorder = null
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null
  useAudioStore.getState().setStatus('inactive')
}

export async function loadWhisperModel(
  model: string,
  onProgress: (info: { status: string; progress?: number; file?: string }) => void,
): Promise<void> {
  transcriber = (await (pipeline as any)(
    'automatic-speech-recognition',
    `onnx-community/whisper-${model}`,
    { dtype: 'q8', device: 'wasm', progress_callback: onProgress },
  )) as AutomaticSpeechRecognitionPipeline
}

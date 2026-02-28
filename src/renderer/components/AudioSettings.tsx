import { useEffect, useState } from 'react'
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { useAudioStore } from '../stores/audioStore'
import { useScribeStore } from '../stores/scribeStore'
import type { AudioSource, TranscriptionSegment, WhisperWordChunk } from '../../shared/types'

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let mediaStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let systemDataCleanup: (() => void) | null = null
let recordedChunks: Blob[] = []

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** Decode a Blob of recorded audio into a 16 kHz mono Float32Array for Whisper */
async function decodeAudioBlob(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new OfflineAudioContext(1, 1, 16000)
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)

  // Resample to 16 kHz mono via OfflineAudioContext
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

  // Apply sticky speaker to all segments if set
  if (stickySpeaker) {
    for (const seg of segments) {
      seg.speaker = stickySpeaker
    }
  }

  return segments
}

async function transcribe(audio: Float32Array) {
  if (!transcriber) {
    console.warn('[AudioSettings] transcribe called but transcriber is null')
    return
  }

  const { addTranscription, setTranscribing, bufferDuration } = useAudioStore.getState()
  const { apiKeySet, addMessages, setProcessing } = useScribeStore.getState()

  console.log(`[AudioSettings] Transcribing ${audio.length} samples (${(audio.length / 16000).toFixed(1)}s of audio)`)
  setTranscribing(true)
  try {
    let result: any
    let hasTimestamps = false
    try {
      result = await transcriber(audio, {
        language: 'pt',
        task: 'translate',
        return_timestamps: 'word',
      })
      hasTimestamps = true
    } catch {
      try {
        result = await transcriber(audio, {
          language: 'pt',
          task: 'translate',
          return_timestamps: true,
        })
        hasTimestamps = true
      } catch {
        console.warn('[AudioSettings] Timestamps not supported by this model, transcribing without')
        result = await transcriber(audio, {
          language: 'pt',
          task: 'translate',
        })
      }
    }

    const singleResult = Array.isArray(result) ? result[0] : result
    const text = singleResult?.text || ''
    console.log(`[AudioSettings] Whisper result (timestamps=${hasTimestamps}): "${text}"`)
    if (text && text.trim()) {
      const trimmed = text.trim()

      // Build segments from word timestamps
      const chunks: WhisperWordChunk[] = (singleResult?.chunks || []).map((c: any) => ({
        text: c.text || '',
        timestamp: c.timestamp as [number, number],
      }))

      const currentSticky = useAudioStore.getState().stickySpeaker
      let segments: TranscriptionSegment[]
      if (hasTimestamps && chunks.length > 0) {
        segments = splitIntoSegments(chunks, currentSticky)
      } else {
        // No timestamps — single segment with full text
        segments = [{
          id: makeId(),
          text: trimmed,
          speaker: currentSticky,
          startTime: 0,
          endTime: 0,
        }]
      }

      addTranscription({
        id: makeId(),
        timestamp: Date.now(),
        text: trimmed,
        duration: bufferDuration,
        segments,
      })

      // If all segments have speakers (via sticky), auto-send to Claude
      const allAssigned = segments.every((s) => s.speaker !== null)
      if (allAssigned && apiKeySet) {
        setTranscribing(false)
        setProcessing(true)
        const speakerTexts = segments.map((s) => ({
          speaker: s.speaker!,
          text: s.text,
        }))
        try {
          const msgs = await window.api.scribe.processSpeakers(speakerTexts)
          console.log(`[AudioSettings] processSpeakers returned ${msgs.length} scribe messages`)
          addMessages(msgs)
        } catch (err) {
          console.warn('[AudioSettings] processSpeakers failed, falling back:', err)
          try {
            const msgs = await window.api.scribe.process(trimmed)
            addMessages(msgs)
          } catch (err2) {
            console.error('[AudioSettings] Scribe processing failed:', err2)
          }
        } finally {
          setProcessing(false)
        }
        return
      }
    } else {
      console.log('[AudioSettings] Whisper returned empty/silent text, skipping')
    }
  } catch (err) {
    console.error('[AudioSettings] Transcription failed:', err)
  } finally {
    setTranscribing(false)
  }
}

function flushBuffer() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    console.log('[AudioSettings] flushBuffer: recorder not active')
    return
  }

  mediaRecorder.stop()

  mediaRecorder.onstop = async () => {
    const chunks = recordedChunks
    recordedChunks = []
    useAudioStore.getState().setLastFlushTime(Date.now())

    if (chunks.length === 0) {
      console.log('[AudioSettings] flushBuffer: no recorded chunks')
    } else {
      const blob = new Blob(chunks, { type: mediaRecorder!.mimeType })
      console.log(`[AudioSettings] Buffer flushed: ${blob.size} bytes, transcriber=${!!transcriber}`)

      if (transcriber) {
        try {
          const audio = await decodeAudioBlob(blob)
          console.log(`[AudioSettings] Decoded to ${audio.length} samples (${(audio.length / 16000).toFixed(1)}s @ 16kHz)`)
          transcribe(audio)
        } catch (err) {
          console.error('[AudioSettings] Audio decode failed:', err)
        }
      }
    }

    if (mediaStream && mediaStream.active && mediaRecorder) {
      try {
        mediaRecorder.start()
        console.log('[AudioSettings] MediaRecorder restarted')
      } catch (err) {
        console.error('[AudioSettings] Failed to restart recorder:', err)
      }
    }
  }
}

export async function startCapture() {
  const { selectedSourceId, bufferDuration, setStatus, setLastFlushTime } = useAudioStore.getState()
  if (!selectedSourceId) return

  try {
    if (selectedSourceId === '__system__') {
      systemDataCleanup = window.api.audio.onSystemData((samples) => {
        console.log(`[AudioSettings] System audio: ${samples.length} samples (${(samples.length / 16000).toFixed(1)}s)`)
        if (transcriber) {
          transcribe(samples)
        }
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
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data)
      }
    }
    recorder.start()
    mediaRecorder = recorder
    console.log(`[AudioSettings] MediaRecorder started, mimeType=${recorder.mimeType}`)

    setLastFlushTime(Date.now())
    flushTimer = setInterval(() => flushBuffer(), bufferDuration * 1000)
    setStatus('capturing')
  } catch (err) {
    console.error('Audio capture failed:', err)
    setStatus('error')
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
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  mediaRecorder = null
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null
  useAudioStore.getState().setStatus('inactive')
}

export default function AudioSettings() {
  const {
    status, sources, selectedSourceId, whisperStatus, whisperProgress, whisperMessage,
    bufferDuration, whisperModel, systemAudioAvailable,
    setSources, setSelectedSourceId,
    setWhisperStatus, setWhisperProgress, setWhisperMessage,
    setBufferDuration, setWhisperModel,
    setSystemAudioAvailable,
  } = useAudioStore()
  const { apiKeySet, hfTokenSet } = useScribeStore()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [hfTokenInput, setHfTokenInput] = useState('')

  async function loadModel() {
    if (whisperStatus === 'loading') return
    setWhisperStatus('loading')
    setWhisperProgress(0)
    setWhisperMessage('Initializing...')

    try {
      transcriber = await (pipeline as any)(
        'automatic-speech-recognition',
        `onnx-community/whisper-${whisperModel}`,
        {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: (info: { status: string; progress?: number; file?: string }) => {
            switch (info.status) {
              case 'initiate':
                setWhisperMessage(`Downloading ${info.file}...`)
                break
              case 'download':
                setWhisperMessage(`Downloading ${info.file}...`)
                break
              case 'progress':
                if (info.progress !== undefined) setWhisperProgress(info.progress)
                setWhisperMessage(`Downloading ${info.file}...`)
                break
              case 'done':
                setWhisperProgress(100)
                setWhisperMessage(`Downloaded ${info.file}`)
                break
              case 'ready':
                setWhisperMessage('Pipeline ready')
                break
            }
          },
        },
      ) as AutomaticSpeechRecognitionPipeline

      setWhisperStatus('ready')
      setWhisperMessage('Model loaded')
    } catch (err) {
      console.error('Whisper load failed:', err)
      setWhisperStatus('error')
      setWhisperMessage((err as Error).message)
    }
  }

  async function refreshSources() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs: AudioSource[] = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          id: d.deviceId,
          name: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        }))

      if (systemAudioAvailable) {
        audioInputs.unshift({ id: '__system__', name: 'System Audio (macOS)' })
      }
      setSources(audioInputs)
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
    }
  }

  useEffect(() => {
    window.api.audio.systemStatus().then(({ available }) => {
      setSystemAudioAvailable(available)
    })
  }, [])

  useEffect(() => {
    refreshSources()
  }, [systemAudioAvailable])

  async function handleSetApiKey() {
    if (!apiKeyInput.trim()) return
    await window.api.scribe.configure(apiKeyInput.trim())
    await window.api.settings.setApiKey(apiKeyInput.trim())
    useScribeStore.getState().setApiKeySet(true)
    setApiKeyInput('')
  }

  async function handleSetHfToken() {
    if (!hfTokenInput.trim()) return
    await window.api.settings.setHfToken(hfTokenInput.trim())
    useScribeStore.getState().setHfTokenSet(true)
    setHfTokenInput('')
  }

  const capturing = status === 'capturing'

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="text-sm font-medium text-gray-300">Audio Settings</div>

      {/* Whisper model controls */}
      <div className="flex items-center gap-2">
        <select
          value={whisperModel}
          onChange={(e) => setWhisperModel(e.target.value as 'tiny' | 'base' | 'small')}
          disabled={whisperStatus === 'loading' || capturing}
          className="px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded disabled:opacity-50"
        >
          <option value="tiny">Whisper Tiny (fastest)</option>
          <option value="base">Whisper Base (balanced)</option>
          <option value="small">Whisper Small (best)</option>
        </select>

        <button
          onClick={loadModel}
          disabled={whisperStatus === 'loading'}
          className="px-3 py-1 text-sm rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
        >
          {whisperStatus === 'loading'
            ? `${Math.round(whisperProgress)}% — ${whisperMessage || 'Loading...'}`
            : whisperStatus === 'ready'
              ? 'Model Ready'
              : whisperStatus === 'error'
                ? 'Error — Retry'
                : 'Load Model'}
        </button>
      </div>

      {/* Status message */}
      {whisperStatus === 'loading' && whisperMessage && (
        <div className="text-xs text-gray-400 truncate">{whisperMessage}</div>
      )}
      {whisperStatus === 'error' && whisperMessage && (
        <div className="text-xs text-red-400 truncate">{whisperMessage}</div>
      )}

      {/* Source selection */}
      <div className="flex items-center gap-2">
        <select
          value={selectedSourceId || ''}
          onChange={(e) => setSelectedSourceId(e.target.value || null)}
          disabled={capturing}
          className="flex-1 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded disabled:opacity-50"
        >
          <option value="">Select audio source...</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button
          onClick={refreshSources}
          disabled={capturing}
          className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
          title="Refresh sources"
        >
          Refresh
        </button>
      </div>

      {/* Buffer duration */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <label>Buffer:</label>
        <input
          type="range"
          min={10}
          max={60}
          step={5}
          value={bufferDuration}
          onChange={(e) => setBufferDuration(Number(e.target.value))}
          disabled={capturing}
          className="flex-1"
        />
        <span className="w-8 text-right">{bufferDuration}s</span>
      </div>

      {/* API Key */}
      {!apiKeySet && (
        <div className="flex gap-1">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Claude API key"
            className="flex-1 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded"
          />
          <button
            onClick={handleSetApiKey}
            className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 rounded"
          >
            Set
          </button>
        </div>
      )}

      {/* HuggingFace Token */}
      {!hfTokenSet && (
        <div className="flex gap-1">
          <input
            type="password"
            value={hfTokenInput}
            onChange={(e) => setHfTokenInput(e.target.value)}
            placeholder="HuggingFace token (speaker diarization)"
            className="flex-1 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded"
          />
          <button
            onClick={handleSetHfToken}
            className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-700 rounded"
          >
            Set
          </button>
        </div>
      )}
    </div>
  )
}

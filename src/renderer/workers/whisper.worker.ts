import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import type { WhisperWorkerRequest, WhisperWorkerResponse } from '../../shared/types'

let transcriber: AutomaticSpeechRecognitionPipeline | null = null

function post(msg: WhisperWorkerResponse) {
  self.postMessage(msg)
}

async function loadModel(model: string) {
  try {
    post({ type: 'progress', message: `Loading Whisper model: ${model}...`, progress: 0 })

    transcriber = (await pipeline as any)('automatic-speech-recognition', `onnx-community/whisper-${model}`, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (info: { status: string; progress?: number; file?: string }) => {
        switch (info.status) {
          case 'initiate':
            post({ type: 'progress', progress: 0, message: `Downloading ${info.file}...` })
            break
          case 'progress':
            post({ type: 'progress', progress: info.progress ?? 0, message: `Downloading ${info.file}...` })
            break
          case 'done':
            post({ type: 'progress', progress: 100, message: `Downloaded ${info.file}` })
            break
          case 'ready':
            post({ type: 'progress', progress: 100, message: 'Initializing pipeline...' })
            break
        }
      },
    }) as AutomaticSpeechRecognitionPipeline

    post({ type: 'ready', message: `Whisper ${model} model loaded` })
  } catch (err) {
    post({ type: 'error', message: `Failed to load model: ${(err as Error).message}` })
  }
}

async function transcribe(audio: Float32Array) {
  if (!transcriber) {
    post({ type: 'error', message: 'Model not loaded' })
    return
  }

  try {
    const result = await transcriber(audio, {
      language: 'pt',
      task: 'translate',
    })

    const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text
    post({ type: 'result', text: text.trim() })
  } catch (err) {
    post({ type: 'error', message: `Transcription failed: ${(err as Error).message}` })
  }
}

self.onmessage = (event: MessageEvent<WhisperWorkerRequest>) => {
  const { type, model, audio } = event.data

  switch (type) {
    case 'load':
      loadModel(model || 'base')
      break
    case 'transcribe':
      if (audio) transcribe(audio)
      break
  }
}

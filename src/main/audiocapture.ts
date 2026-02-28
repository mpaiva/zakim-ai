import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/types'

let audioTee: any = null
let accumulatedBuffer: Buffer = Buffer.alloc(0)
let flushTimer: ReturnType<typeof setInterval> | null = null
let targetWindow: BrowserWindow | null = null
let running = false

function flushToRenderer() {
  if (accumulatedBuffer.length === 0 || !targetWindow) return

  const sampleCount = accumulatedBuffer.length / 2
  const float32 = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = accumulatedBuffer.readInt16LE(i * 2) / 32768
  }

  console.log(`[AudioCapture] Flushing ${sampleCount} samples (${(sampleCount / 16000).toFixed(1)}s)`)
  targetWindow.webContents.send(IPC.AUDIO_SYSTEM_DATA, Array.from(float32))
  accumulatedBuffer = Buffer.alloc(0)
}

export function setupAudioCapture(win: BrowserWindow) {
  targetWindow = win

  ipcMain.handle(IPC.AUDIO_SYSTEM_STATUS, async () => {
    try {
      await import('audiotee')
      return { available: true, running }
    } catch {
      return { available: false, running: false }
    }
  })

  ipcMain.handle(IPC.AUDIO_SYSTEM_START, async (_event, bufferDuration: number) => {
    if (running) return

    let AudioTee: any
    try {
      const mod = await import('audiotee')
      AudioTee = mod.AudioTee
    } catch (err) {
      console.error('[AudioCapture] audiotee not available:', err)
      throw new Error('audiotee not available on this platform')
    }

    accumulatedBuffer = Buffer.alloc(0)

    audioTee = new AudioTee({
      sampleRate: 16000,
      chunkDurationMs: 200,
    })

    audioTee.on('data', ({ data }: { data: Buffer }) => {
      accumulatedBuffer = Buffer.concat([accumulatedBuffer, data])
    })

    audioTee.on('start', () => {
      console.log('[AudioCapture] Core Audio Tap stream started')
    })

    audioTee.on('error', (err: Error) => {
      console.error('[AudioCapture] error:', err.message)
    })

    audioTee.on('stop', () => {
      console.log('[AudioCapture] Core Audio Tap stream stopped')
    })

    await audioTee.start()
    running = true

    flushTimer = setInterval(flushToRenderer, bufferDuration * 1000)
  })

  ipcMain.handle(IPC.AUDIO_SYSTEM_STOP, async () => {
    if (flushTimer) {
      clearInterval(flushTimer)
      flushTimer = null
    }

    // Flush any remaining audio
    flushToRenderer()

    if (audioTee) {
      await audioTee.stop()
      audioTee = null
    }
    running = false
    accumulatedBuffer = Buffer.alloc(0)
  })
}

export function stopAudioCapture() {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (audioTee) {
    audioTee.stop().catch(() => {})
    audioTee = null
  }
  running = false
  accumulatedBuffer = Buffer.alloc(0)
}

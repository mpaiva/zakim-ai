import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { createInterface } from 'readline'
import { app } from 'electron'

let proc: ChildProcess | null = null
let rl: ReturnType<typeof createInterface> | null = null

interface SidecarRequest {
  cmd: string
  [key: string]: unknown
}

interface SidecarResponse {
  ok: boolean
  [key: string]: unknown
}

type PendingResolve = {
  resolve: (val: SidecarResponse) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const queue: PendingResolve[] = []
const REQUEST_TIMEOUT = 60_000

function sendRequest(req: SidecarRequest): Promise<SidecarResponse> {
  return new Promise((resolve, reject) => {
    if (!proc || !proc.stdin || proc.killed) {
      reject(new Error('Sidecar not running'))
      return
    }

    const timer = setTimeout(() => {
      const pending = queue.shift()
      if (pending) {
        pending.reject(new Error(`Sidecar request timed out after ${REQUEST_TIMEOUT}ms`))
      }
    }, REQUEST_TIMEOUT)

    queue.push({ resolve, reject, timer })

    proc.stdin.write(JSON.stringify(req) + '\n')
  })
}

function handleLine(line: string) {
  const pending = queue.shift()
  if (!pending) return

  clearTimeout(pending.timer)
  try {
    const resp = JSON.parse(line) as SidecarResponse
    pending.resolve(resp)
  } catch {
    pending.reject(new Error(`Invalid JSON from sidecar: ${line}`))
  }
}

export function setupSidecar(): void {
  if (proc) return

  // In dev, app.getAppPath() is the project root; in production it's the asar
  const scriptPath = app.isPackaged
    ? join(process.resourcesPath, 'diarize.py')
    : join(app.getAppPath(), 'src/main/diarize.py')
  try {
    proc = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    console.warn('[sidecar] Failed to spawn python3 — diarization unavailable')
    proc = null
    return
  }

  proc.on('error', (err) => {
    console.warn('[sidecar] Process error:', err.message)
    proc = null
    rl = null
    // Reject all pending
    while (queue.length) {
      const p = queue.shift()!
      clearTimeout(p.timer)
      p.reject(new Error('Sidecar process died'))
    }
  })

  proc.on('exit', (code) => {
    console.log(`[sidecar] Exited with code ${code}`)
    proc = null
    rl = null
    while (queue.length) {
      const p = queue.shift()!
      clearTimeout(p.timer)
      p.reject(new Error('Sidecar process exited'))
    }
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    console.warn('[sidecar stderr]', chunk.toString().trim())
  })

  rl = createInterface({ input: proc.stdout! })
  rl.on('line', handleLine)

  console.log('[sidecar] Python diarization sidecar spawned')
}

export function killSidecar(): void {
  if (proc) {
    proc.kill()
    proc = null
    rl = null
  }
}

export function isAlive(): boolean {
  return proc !== null && !proc.killed
}

export async function ping(): Promise<boolean> {
  if (!isAlive()) return false
  try {
    const resp = await sendRequest({ cmd: 'ping' })
    return resp.ok === true
  } catch {
    return false
  }
}

export async function initPipeline(hfToken: string): Promise<SidecarResponse> {
  return sendRequest({ cmd: 'init', hf_token: hfToken })
}

export interface DiarizeSegment {
  start: number
  end: number
  speaker: string
}

export async function diarize(wavPath: string): Promise<DiarizeSegment[]> {
  const resp = await sendRequest({ cmd: 'diarize', wav_path: wavPath })
  if (!resp.ok) {
    throw new Error((resp.error as string) || 'Diarization failed')
  }
  return resp.segments as DiarizeSegment[]
}

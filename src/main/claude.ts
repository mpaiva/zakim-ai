import { app, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { IPC, type ScribeMessage, type SpeakerAttributedText, type WhisperTimestampedResult } from '../shared/types'
import { isAlive, initPipeline, diarize } from './sidecar'
import { writeWav, alignSpeakers, cleanupWav } from './wavutil'

function settingsPath(file: string): string {
  return path.join(app.getPath('userData'), file)
}

let anthropic: Anthropic | null = null
let rollingContext = ''
let pipelineReady = false

const SCRIBE_SYSTEM_PROMPT = `You are a live transcription summarizer. You receive raw transcription text from a single speaker's audio feed and must produce a concise plain-language summary of what they are saying.

Rules:
1. Summarize the transcribed speech in plain, concise language
2. Each output line must be under 300 characters
3. Do not attribute speech to a speaker — there is only one
4. Do not use any W3C formatting (no TOPIC:, ACTION:, RESOLUTION: markers)
5. Omit filler words, false starts, and repetition
6. If the transcription is silence, noise, or unintelligible, return nothing

Previous context for continuity:
{{CONTEXT}}

Respond ONLY with the summary lines, one per line. No preamble or explanation.`

const SCRIBE_MULTI_SPEAKER_PROMPT = `You are a live transcription summarizer for a multi-speaker meeting. You receive speaker-attributed transcription text and must produce a concise summary preserving who said what.

Rules:
1. Summarize each speaker's contributions in plain, concise language
2. Each output line must be under 300 characters
3. Preserve speaker attribution — prefix each line with the speaker's name as provided (e.g. "marcos: ...")
4. If multiple speakers say similar things, consolidate but keep attribution for the main point
5. Do not use any W3C formatting (no TOPIC:, ACTION:, RESOLUTION: markers)
6. Omit filler words, false starts, and repetition
7. If the transcription is silence, noise, or unintelligible, return nothing

Previous context for continuity:
{{CONTEXT}}

Respond ONLY with the summary lines, one per line. No preamble or explanation.`

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function classifyLine(_line: string): ScribeMessage['type'] {
  return 'statement'
}

let encryptedApiKey: Buffer | null = null
let encryptedHfToken: Buffer | null = null

async function tryInitPipeline(hfToken: string): Promise<void> {
  if (!isAlive()) {
    pipelineReady = false
    return
  }
  try {
    const resp = await initPipeline(hfToken)
    pipelineReady = resp.ok === true
    if (!resp.ok) {
      console.warn('[claude] Pipeline init failed:', resp.error)
    } else {
      console.log('[claude] Pyannote pipeline initialized')
    }
  } catch (err) {
    pipelineReady = false
    console.warn('[claude] Pipeline init error:', err)
  }
}

function loadPersistedKeys(): void {
  try {
    const keyPath = settingsPath('apiKey.enc')
    if (fs.existsSync(keyPath) && safeStorage.isEncryptionAvailable()) {
      encryptedApiKey = fs.readFileSync(keyPath)
      const key = safeStorage.decryptString(encryptedApiKey)
      anthropic = new Anthropic({ apiKey: key })
    }
  } catch {}
  try {
    const tokenPath = settingsPath('hfToken.enc')
    if (fs.existsSync(tokenPath) && safeStorage.isEncryptionAvailable()) {
      encryptedHfToken = fs.readFileSync(tokenPath)
      const token = safeStorage.decryptString(encryptedHfToken)
      tryInitPipeline(token)
    }
  } catch {}
}

export function setupClaude() {
  loadPersistedKeys()

  // ── API Key storage ──
  ipcMain.handle(IPC.SETTINGS_SET_API_KEY, async (_event, key: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      encryptedApiKey = safeStorage.encryptString(key)
      try { fs.writeFileSync(settingsPath('apiKey.enc'), encryptedApiKey) } catch {}
    }
    anthropic = new Anthropic({ apiKey: key })
  })

  ipcMain.handle(IPC.SETTINGS_GET_API_KEY, async () => {
    if (encryptedApiKey && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encryptedApiKey)
    }
    return null
  })

  // ── HF Token storage ──
  ipcMain.handle(IPC.SETTINGS_SET_HF_TOKEN, async (_event, token: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      encryptedHfToken = safeStorage.encryptString(token)
      try { fs.writeFileSync(settingsPath('hfToken.enc'), encryptedHfToken) } catch {}
    }
    await tryInitPipeline(token)
  })

  ipcMain.handle(IPC.SETTINGS_GET_HF_TOKEN, async () => {
    if (encryptedHfToken && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encryptedHfToken)
    }
    return null
  })

  ipcMain.handle(IPC.SCRIBE_CONFIGURE, async (_event, apiKey: string) => {
    anthropic = new Anthropic({ apiKey })
    rollingContext = ''
  })

  // ── Single-speaker processing (existing, unchanged) ──
  ipcMain.handle(IPC.SCRIBE_PROCESS, async (_event, text: string): Promise<ScribeMessage[]> => {
    if (!anthropic) {
      throw new Error('Claude API not configured — set your API key first')
    }

    const systemPrompt = SCRIBE_SYSTEM_PROMPT.replace(
      '{{CONTEXT}}',
      rollingContext || '(Meeting just started, no prior context)'
    )

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Summarize the following transcription:\n\n${text}`,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') return []

    const lines = content.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    rollingContext += '\n' + lines.join('\n')
    if (rollingContext.length > 2000) {
      rollingContext = rollingContext.slice(-2000)
    }

    return lines.map((line) => ({
      id: makeId(),
      timestamp: Date.now(),
      text: line,
      type: classifyLine(line),
      status: 'pending' as const,
    }))
  })

  // ── Multi-speaker processing (audio + whisper result → diarize → Claude) ──
  ipcMain.handle(
    IPC.SCRIBE_PROCESS_AUDIO,
    async (_event, audioArray: number[], whisperResult: WhisperTimestampedResult): Promise<ScribeMessage[]> => {
      if (!anthropic) {
        throw new Error('Claude API not configured — set your API key first')
      }

      const audio = new Float32Array(audioArray)

      // Try diarization if pipeline is ready
      if (pipelineReady && isAlive() && whisperResult.chunks.length > 0) {
        let wavPath: string | null = null
        try {
          wavPath = await writeWav(audio, 16000)
          console.log(`[claude] Diarizing ${wavPath} ...`)
          const segments = await diarize(wavPath)
          console.log(`[claude] Got ${segments.length} diarization segments`)

          const speakerLines = alignSpeakers(whisperResult.chunks, segments)
          const speakerText = speakerLines.map((l) => `${l.speaker}: ${l.text}`).join('\n')

          console.log('[claude] Speaker-attributed text:', speakerText)

          // Use multi-speaker prompt
          const systemPrompt = SCRIBE_MULTI_SPEAKER_PROMPT.replace(
            '{{CONTEXT}}',
            rollingContext || '(Meeting just started, no prior context)',
          )

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: `Summarize the following multi-speaker transcription:\n\n${speakerText}`,
              },
            ],
          })

          const content = response.content[0]
          if (content.type !== 'text') return []

          const lines = content.text
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0)

          rollingContext += '\n' + lines.join('\n')
          if (rollingContext.length > 2000) {
            rollingContext = rollingContext.slice(-2000)
          }

          return lines.map((line) => ({
            id: makeId(),
            timestamp: Date.now(),
            text: line,
            type: classifyLine(line),
            status: 'pending' as const,
          }))
        } catch (err) {
          console.warn('[claude] Diarization failed, falling back to plain text:', err)
          // Fall through to single-speaker below
        } finally {
          if (wavPath) cleanupWav(wavPath)
        }
      }

      // Fallback: use plain text with single-speaker prompt
      const text = whisperResult.text
      if (!text || !text.trim()) return []

      const systemPrompt = SCRIBE_SYSTEM_PROMPT.replace(
        '{{CONTEXT}}',
        rollingContext || '(Meeting just started, no prior context)',
      )

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Summarize the following transcription:\n\n${text}`,
          },
        ],
      })

      const content = response.content[0]
      if (content.type !== 'text') return []

      const lines = content.text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      rollingContext += '\n' + lines.join('\n')
      if (rollingContext.length > 2000) {
        rollingContext = rollingContext.slice(-2000)
      }

      return lines.map((line) => ({
        id: makeId(),
        timestamp: Date.now(),
        text: line,
        type: classifyLine(line),
        status: 'pending' as const,
      }))
    },
  )

  // ── Speaker-attributed processing (manual speaker assignment from UI) ──
  ipcMain.handle(
    IPC.SCRIBE_PROCESS_SPEAKERS,
    async (_event, segments: SpeakerAttributedText[]): Promise<ScribeMessage[]> => {
      if (!anthropic) {
        throw new Error('Claude API not configured — set your API key first')
      }

      const speakerText = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')

      const systemPrompt = SCRIBE_MULTI_SPEAKER_PROMPT.replace(
        '{{CONTEXT}}',
        rollingContext || '(Meeting just started, no prior context)',
      )

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Summarize the following multi-speaker transcription:\n\n${speakerText}`,
          },
        ],
      })

      const content = response.content[0]
      if (content.type !== 'text') return []

      const lines = content.text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      rollingContext += '\n' + lines.join('\n')
      if (rollingContext.length > 2000) {
        rollingContext = rollingContext.slice(-2000)
      }

      return lines.map((line) => ({
        id: makeId(),
        timestamp: Date.now(),
        text: line,
        type: classifyLine(line),
        status: 'pending' as const,
      }))
    },
  )
}

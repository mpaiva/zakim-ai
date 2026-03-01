// ── IRC Types ──

export interface IrcConnectionOptions {
  host: string
  port: number
  nick: string
  tls: boolean
}

export interface IrcMessage {
  id: string
  timestamp: number
  nick: string
  channel: string
  text: string
  type: 'message' | 'action' | 'join' | 'part' | 'quit' | 'notice' | 'system'
}

export interface IrcChannelUser {
  nick: string
  modes: string[]
}

export type IrcConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// ── Audio Types ──

export interface AudioSource {
  id: string
  name: string
  thumbnailDataUrl?: string
}

export type AudioCaptureStatus = 'inactive' | 'capturing' | 'error'

export interface TranscriptionSegment {
  id: string
  text: string
  speaker: string | null     // null = unassigned
  startTime: number          // seconds within buffer
  endTime: number
}

export interface TranscriptionResult {
  id: string
  timestamp: number
  text: string
  duration: number
  segments: TranscriptionSegment[]
}

export interface SpeakerAttributedText {
  speaker: string
  text: string
}

// ── Scribe Types ──

export interface ScribeMessage {
  id: string
  timestamp: number
  text: string
  type: 'statement' | 'topic' | 'action' | 'resolution' | 'raw'
  status: 'pending' | 'approved' | 'sent' | 'discarded'
  editedText?: string
}

export type ScribeMode = 'review' | 'auto'

export interface QueueEntry {
  nick: string
  comment?: string
  timestamp: number
}

export interface ScribeConfig {
  apiKey: string
  whisperModel: 'tiny' | 'base' | 'small'
  audioBufferDuration: number
  autoSendDelay: number
}

// ── IPC Channel Names ──

export const IPC = {
  // IRC
  IRC_CONNECT: 'irc:connect',
  IRC_DISCONNECT: 'irc:disconnect',
  IRC_JOIN: 'irc:join',
  IRC_PART: 'irc:part',
  IRC_SEND: 'irc:send',
  IRC_ON_MESSAGE: 'irc:on-message',
  IRC_ON_STATUS: 'irc:on-status',
  IRC_ON_USERS: 'irc:on-users',
  IRC_ON_TOPIC: 'irc:on-topic',

  // Claude scribe
  SCRIBE_PROCESS: 'scribe:process',
  SCRIBE_PROCESS_AUDIO: 'scribe:process-audio',
  SCRIBE_PROCESS_SPEAKERS: 'scribe:process-speakers',
  SCRIBE_CONFIGURE: 'scribe:configure',

  // Audio capture (Core Audio Taps via audiotee)
  AUDIO_SYSTEM_START: 'audio:system-start',
  AUDIO_SYSTEM_STOP: 'audio:system-stop',
  AUDIO_SYSTEM_STATUS: 'audio:system-status',
  AUDIO_SYSTEM_DATA: 'audio:system-data',

  // Settings
  SETTINGS_GET_API_KEY: 'settings:get-api-key',
  SETTINGS_SET_API_KEY: 'settings:set-api-key',
  SETTINGS_GET_HF_TOKEN: 'settings:get-hf-token',
  SETTINGS_SET_HF_TOKEN: 'settings:set-hf-token',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
} as const

// ── Whisper Word-Level Types ──

export interface WhisperWordChunk {
  text: string
  timestamp: [number, number] // [start_seconds, end_seconds]
}

export interface WhisperTimestampedResult {
  text: string
  chunks: WhisperWordChunk[]
}

// ── Whisper Worker Messages ──

export interface WhisperWorkerRequest {
  type: 'load' | 'transcribe'
  model?: string
  audio?: Float32Array
}

export interface WhisperWorkerResponse {
  type: 'ready' | 'progress' | 'result' | 'error'
  message?: string
  text?: string
  progress?: number
}

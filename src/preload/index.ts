import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IrcConnectionOptions, type IrcMessage, type ScribeMessage, type SpeakerAttributedText, type WhisperTimestampedResult } from '../shared/types'

const api = {
  // ── IRC ──
  irc: {
    connect: (opts: IrcConnectionOptions) => ipcRenderer.invoke(IPC.IRC_CONNECT, opts),
    disconnect: () => ipcRenderer.invoke(IPC.IRC_DISCONNECT),
    join: (channel: string) => ipcRenderer.invoke(IPC.IRC_JOIN, channel),
    part: (channel: string) => ipcRenderer.invoke(IPC.IRC_PART, channel),
    send: (channel: string, text: string) => ipcRenderer.invoke(IPC.IRC_SEND, channel, text),

    onMessage: (cb: (msg: IrcMessage) => void) => {
      const listener = (_: Electron.IpcRendererEvent, msg: IrcMessage) => cb(msg)
      ipcRenderer.on(IPC.IRC_ON_MESSAGE, listener)
      return () => ipcRenderer.removeListener(IPC.IRC_ON_MESSAGE, listener)
    },
    onStatus: (cb: (status: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, status: string) => cb(status)
      ipcRenderer.on(IPC.IRC_ON_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC.IRC_ON_STATUS, listener)
    },
    onUsers: (cb: (users: { nick: string; modes: string[] }[]) => void) => {
      const listener = (_: Electron.IpcRendererEvent, users: { nick: string; modes: string[] }[]) => cb(users)
      ipcRenderer.on(IPC.IRC_ON_USERS, listener)
      return () => ipcRenderer.removeListener(IPC.IRC_ON_USERS, listener)
    },
    onTopic: (cb: (topic: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, topic: string) => cb(topic)
      ipcRenderer.on(IPC.IRC_ON_TOPIC, listener)
      return () => ipcRenderer.removeListener(IPC.IRC_ON_TOPIC, listener)
    },
  },

  // ── Scribe ──
  scribe: {
    process: (text: string): Promise<ScribeMessage[]> =>
      ipcRenderer.invoke(IPC.SCRIBE_PROCESS, text),
    processAudio: (audioBuffer: Float32Array, whisperResult: WhisperTimestampedResult): Promise<ScribeMessage[]> =>
      ipcRenderer.invoke(IPC.SCRIBE_PROCESS_AUDIO, Array.from(audioBuffer), whisperResult),
    processSpeakers: (segments: SpeakerAttributedText[]): Promise<ScribeMessage[]> =>
      ipcRenderer.invoke(IPC.SCRIBE_PROCESS_SPEAKERS, segments),
    configure: (apiKey: string) =>
      ipcRenderer.invoke(IPC.SCRIBE_CONFIGURE, apiKey),
  },

  // ── Audio Capture (Core Audio Taps) ──
  audio: {
    systemStart: (bufferDuration: number): Promise<void> =>
      ipcRenderer.invoke(IPC.AUDIO_SYSTEM_START, bufferDuration),
    systemStop: (): Promise<void> =>
      ipcRenderer.invoke(IPC.AUDIO_SYSTEM_STOP),
    systemStatus: (): Promise<{ available: boolean; running: boolean }> =>
      ipcRenderer.invoke(IPC.AUDIO_SYSTEM_STATUS),
    onSystemData: (cb: (samples: Float32Array) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: number[]) => cb(new Float32Array(data))
      ipcRenderer.on(IPC.AUDIO_SYSTEM_DATA, listener)
      return () => ipcRenderer.removeListener(IPC.AUDIO_SYSTEM_DATA, listener)
    },
  },

  // ── Shell ──
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url),
  },

  // ── Settings ──
  settings: {
    getApiKey: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_API_KEY),
    setApiKey: (key: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET_API_KEY, key),
    getHfToken: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_HF_TOKEN),
    setHfToken: (token: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET_HF_TOKEN, token),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

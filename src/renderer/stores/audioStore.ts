import { create } from 'zustand'
import type { AudioCaptureStatus, AudioSource, TranscriptionResult } from '../../shared/types'

interface AudioState {
  status: AudioCaptureStatus
  sources: AudioSource[]
  selectedSourceId: string | null
  whisperStatus: 'unloaded' | 'loading' | 'ready' | 'error'
  whisperProgress: number
  whisperMessage: string
  transcriptions: TranscriptionResult[]
  bufferDuration: number
  whisperModel: 'tiny' | 'base' | 'small'
  transcribing: boolean
  lastFlushTime: number
  lastRms: number
  captureError: string | null
  systemAudioAvailable: boolean
  stickySpeaker: string | null
  customSpeakers: string[]

  setStatus: (status: AudioCaptureStatus) => void
  setSources: (sources: AudioSource[]) => void
  setSelectedSourceId: (id: string | null) => void
  setWhisperStatus: (status: AudioState['whisperStatus']) => void
  setWhisperProgress: (progress: number) => void
  setWhisperMessage: (message: string) => void
  addTranscription: (result: TranscriptionResult) => void
  setBufferDuration: (duration: number) => void
  setWhisperModel: (model: AudioState['whisperModel']) => void
  setTranscribing: (v: boolean) => void
  setLastFlushTime: (t: number) => void
  setLastRms: (rms: number) => void
  setCaptureError: (msg: string | null) => void
  setSystemAudioAvailable: (v: boolean) => void
  clearTranscriptions: () => void
  setStickySpeaker: (name: string | null) => void
  addCustomSpeaker: (nick: string) => void
  assignSpeaker: (transcriptionId: string, segmentId: string, speaker: string) => void
}

export const useAudioStore = create<AudioState>((set) => ({
  status: 'inactive',
  sources: [],
  selectedSourceId: null,
  whisperStatus: 'unloaded',
  whisperProgress: 0,
  whisperMessage: '',
  transcriptions: [],
  bufferDuration: 30,
  whisperModel: 'base',
  transcribing: false,
  lastFlushTime: 0,
  lastRms: -1,
  captureError: null,
  systemAudioAvailable: false,
  stickySpeaker: null,
  customSpeakers: JSON.parse(localStorage.getItem('zakim_custom_speakers') || '[]') as string[],

  setStatus: (status) => set({ status }),
  setSources: (sources) => set({ sources }),
  setSelectedSourceId: (id) => set({ selectedSourceId: id }),
  setWhisperStatus: (status) => set({ whisperStatus: status }),
  setWhisperProgress: (progress) => set({ whisperProgress: progress }),
  setWhisperMessage: (message) => set({ whisperMessage: message }),
  addTranscription: (result) =>
    set((state) => ({ transcriptions: [...state.transcriptions, result] })),
  setBufferDuration: (duration) => set({ bufferDuration: duration }),
  setWhisperModel: (model) => set({ whisperModel: model }),
  setTranscribing: (v) => set({ transcribing: v }),
  setLastFlushTime: (t) => set({ lastFlushTime: t }),
  setLastRms: (rms) => set({ lastRms: rms }),
  setCaptureError: (msg) => set({ captureError: msg }),
  setSystemAudioAvailable: (v) => set({ systemAudioAvailable: v }),
  clearTranscriptions: () => set({ transcriptions: [] }),
  setStickySpeaker: (name) => set({ stickySpeaker: name }),
  addCustomSpeaker: (nick) => set((state) => {
    if (state.customSpeakers.includes(nick)) return state
    const updated = [...state.customSpeakers, nick]
    localStorage.setItem('zakim_custom_speakers', JSON.stringify(updated))
    return { customSpeakers: updated }
  }),
  assignSpeaker: (transcriptionId, segmentId, speaker) =>
    set((state) => {
      const sticky = state.stickySpeaker
      return {
        transcriptions: state.transcriptions.map((t) => {
          if (t.id !== transcriptionId) return t
          let found = false
          const segments = t.segments.map((s) => {
            if (s.id === segmentId) {
              found = true
              return { ...s, speaker }
            }
            // If sticky mode, fill subsequent null segments
            if (found && sticky && s.speaker === null) {
              return { ...s, speaker: sticky }
            }
            return s
          })
          return { ...t, segments }
        }),
      }
    }),
}))

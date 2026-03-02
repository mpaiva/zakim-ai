import { create } from 'zustand'
import type { ScribeMessage, ScribeMode, QueueEntry } from '../../shared/types'

interface ScribeState {
  messages: ScribeMessage[]
  mode: ScribeMode
  autoSendDelay: number
  apiKeySet: boolean
  hfTokenSet: boolean
  queue: QueueEntry[]
  processing: boolean

  setMode: (mode: ScribeMode) => void
  setAutoSendDelay: (delay: number) => void
  setApiKeySet: (set: boolean) => void
  setHfTokenSet: (set: boolean) => void
  addMessages: (msgs: ScribeMessage[]) => void
  updateMessage: (id: string, updates: Partial<ScribeMessage>) => void
  approveMessage: (id: string) => void
  discardMessage: (id: string) => void
  markSent: (id: string) => void
  approveAll: () => void
  clearMessages: () => void
  setProcessing: (v: boolean) => void
  addToQueue: (entry: QueueEntry) => void
  removeFromQueue: (nick: string) => void
  clearQueue: () => void
}

export const useScribeStore = create<ScribeState>((set) => ({
  messages: [],
  mode: 'review',
  autoSendDelay: 5,
  apiKeySet: false,
  hfTokenSet: false,
  queue: [],
  processing: false,

  setMode: (mode) => set({ mode }),
  setAutoSendDelay: (delay) => set({ autoSendDelay: delay }),
  setApiKeySet: (v) => set({ apiKeySet: v }),
  setHfTokenSet: (v) => set({ hfTokenSet: v }),

  addMessages: (msgs) =>
    set((state) => {
      const existingTexts = new Set(state.messages.map((m) => m.text))
      const deduped = msgs.filter((m) => !existingTexts.has(m.text))
      if (deduped.length === 0) return state
      return { messages: [...state.messages, ...deduped] }
    }),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),

  approveMessage: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, status: 'approved' as const } : m
      ),
    })),

  discardMessage: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, status: 'discarded' as const } : m
      ),
    })),

  markSent: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, status: 'sent' as const } : m
      ),
    })),

  approveAll: () =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.status === 'pending' ? { ...m, status: 'approved' as const } : m
      ),
    })),

  setProcessing: (v) => set({ processing: v }),

  clearMessages: () => set({ messages: [] }),

  addToQueue: (entry) =>
    set((state) => {
      if (state.queue.some((e) => e.nick === entry.nick)) return state
      return { queue: [...state.queue, entry] }
    }),

  removeFromQueue: (nick) =>
    set((state) => ({
      queue: state.queue.filter((e) => e.nick !== nick),
    })),

  clearQueue: () => set({ queue: [] }),
}))

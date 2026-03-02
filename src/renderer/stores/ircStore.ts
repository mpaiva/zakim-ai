import { create } from 'zustand'
import type { IrcConnectionStatus, IrcMessage, IrcChannelUser } from '../../shared/types'

interface IrcState {
  status: IrcConnectionStatus
  nick: string
  channel: string
  host: string
  port: number
  tls: boolean
  messages: IrcMessage[]
  users: IrcChannelUser[]
  topic: string

  highlightedIrcText: string | null

  setNick: (nick: string) => void
  setChannel: (channel: string) => void
  setHost: (host: string) => void
  setPort: (port: number) => void
  setTls: (tls: boolean) => void
  setStatus: (status: IrcConnectionStatus) => void
  addMessage: (msg: IrcMessage) => void
  setUsers: (users: IrcChannelUser[]) => void
  setTopic: (topic: string) => void
  clearMessages: () => void
  setHighlightedIrcText: (text: string | null) => void
}

export const useIrcStore = create<IrcState>((set) => ({
  status: 'disconnected',
  nick: 'zakim-ai',
  channel: '#apa',
  host: 'irc.w3.org',
  port: 6667,
  tls: false,
  messages: [],
  users: [],
  topic: '',
  highlightedIrcText: null,

  setNick: (nick) => set({ nick }),
  setChannel: (channel) => set({ channel }),
  setHost: (host) => set({ host }),
  setPort: (port) => set({ port }),
  setTls: (tls) => set({ tls }),
  setStatus: (status) => set({ status }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setUsers: (users) => set({ users }),
  setTopic: (topic) => set({ topic }),
  clearMessages: () => set({ messages: [] }),
  setHighlightedIrcText: (text) => set({ highlightedIrcText: text }),
}))

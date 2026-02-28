import { useEffect, useRef } from 'react'
import { useScribeStore } from '../stores/scribeStore'
import { useIrcStore } from '../stores/ircStore'

const BOT_NICKS = new Set(['Zakim', 'RRSAgent', 'trackbot'])
const Q_PLUS_RE = /^q\+(?:\s+(.+))?$/i
const Q_MINUS_RE = /^q-$/i

export function useAutoScribe() {
  const mode = useScribeStore((s) => s.mode)
  const ircStatus = useIrcStore((s) => s.status)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const prevModeRef = useRef(mode)

  // Cancel all pending send timers
  function cancelTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  // a) Self-assign as scriber when switching to auto mode
  useEffect(() => {
    if (mode === 'auto' && prevModeRef.current !== 'auto') {
      const { channel } = useIrcStore.getState()
      const { nick } = useIrcStore.getState()
      if (ircStatus === 'connected' && channel) {
        window.api.irc.send(channel, `scribenick: ${nick}`)
      }
    }
    if (mode !== 'auto' && prevModeRef.current === 'auto') {
      cancelTimers()
    }
    prevModeRef.current = mode
  }, [mode, ircStatus])

  // b) Monitor IRC for q+/q- messages
  useEffect(() => {
    if (mode !== 'auto') return

    const unsub = useIrcStore.subscribe((state, prevState) => {
      if (state.messages.length <= prevState.messages.length) return

      const newMessages = state.messages.slice(prevState.messages.length)
      const ownNick = useIrcStore.getState().nick
      const channel = useIrcStore.getState().channel

      for (const msg of newMessages) {
        if (msg.type !== 'message') continue
        if (msg.nick === ownNick) continue
        if (BOT_NICKS.has(msg.nick)) continue
        if (channel && msg.channel !== channel) continue

        const qPlusMatch = msg.text.match(Q_PLUS_RE)
        if (qPlusMatch) {
          useScribeStore.getState().addToQueue({
            nick: msg.nick,
            comment: qPlusMatch[1]?.trim() || undefined,
            timestamp: msg.timestamp,
          })
          if (useIrcStore.getState().status === 'connected' && channel) {
            window.api.irc.send(channel, `ack ${msg.nick}`)
          }
          continue
        }

        if (Q_MINUS_RE.test(msg.text)) {
          useScribeStore.getState().removeFromQueue(msg.nick)
          continue
        }
      }
    })

    return unsub
  }, [mode])

  // c) Auto-send scribe messages
  useEffect(() => {
    if (mode !== 'auto') return

    const unsub = useScribeStore.subscribe((state, prevState) => {
      if (useScribeStore.getState().mode !== 'auto') return
      if (useIrcStore.getState().status !== 'connected') return

      const channel = useIrcStore.getState().channel
      if (!channel) return

      // Find newly added pending messages
      const prevIds = new Set(prevState.messages.map((m) => m.id))
      const newPending = state.messages.filter(
        (m) => m.status === 'pending' && !prevIds.has(m.id)
      )

      if (newPending.length === 0) return

      // Approve them immediately
      const store = useScribeStore.getState()
      for (const msg of newPending) {
        store.approveMessage(msg.id)
      }

      // Schedule sends staggered by 500ms after autoSendDelay
      const delayMs = store.autoSendDelay * 1000
      for (let i = 0; i < newPending.length; i++) {
        const msg = newPending[i]
        const timer = setTimeout(async () => {
          const currentState = useScribeStore.getState()
          if (currentState.mode !== 'auto') return
          if (useIrcStore.getState().status !== 'connected') return

          const current = currentState.messages.find((m) => m.id === msg.id)
          if (!current || current.status !== 'approved') return

          const text = current.editedText || current.text
          await window.api.irc.send(channel, text)
          useScribeStore.getState().markSent(msg.id)
        }, delayMs + i * 500)

        timersRef.current.push(timer)
      }
    })

    return () => {
      unsub()
      cancelTimers()
    }
  }, [mode])
}

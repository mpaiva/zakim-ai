import { useEffect, useRef, useState } from 'react'
import { useIrcStore } from '../stores/ircStore'
import type { IrcMessage } from '../../shared/types'

function MessageLine({ msg }: { msg: IrcMessage }) {
  const ref = useRef<HTMLDivElement>(null)
  const highlighted = useIrcStore((s) => s.highlightedIrcText !== null && s.highlightedIrcText === msg.text)

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlighted])

  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const highlightCls = highlighted ? 'bg-amber-50 dark:bg-amber-900/20 rounded' : ''

  const isBot = ['Zakim', 'RRSAgent', 'trackbot'].includes(msg.nick)

  const nickColor = isBot
    ? 'text-amber-500 dark:text-amber-400'
    : msg.type === 'system'
      ? 'text-slate-400 dark:text-gray-500'
      : 'text-cyan-600 dark:text-cyan-400'

  if (msg.type === 'join' || msg.type === 'part' || msg.type === 'quit') {
    return (
      <div ref={ref} className={`text-xs text-slate-500 dark:text-gray-400 py-0.5 leading-relaxed ${highlightCls}`}>
        <span className="text-slate-500 dark:text-gray-400 tabular-nums">{time}</span>
        {' — '}
        {msg.text}
      </div>
    )
  }

  if (msg.type === 'system') {
    return (
      <div ref={ref} className={`text-xs text-slate-500 dark:text-gray-400 py-0.5 italic leading-relaxed ${highlightCls}`}>
        <span className="text-slate-500 dark:text-gray-400 tabular-nums not-italic">{time}</span>
        {' '}
        {msg.text}
      </div>
    )
  }

  if (msg.type === 'action') {
    return (
      <div ref={ref} className={`text-sm py-0.5 leading-relaxed ${highlightCls}`}>
        <span className="text-slate-500 dark:text-gray-400 text-xs tabular-nums">{time}</span>
        {' '}
        <span className="text-purple-600 dark:text-purple-400 italic">* {msg.nick} {msg.text}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className={`text-sm py-0.5 leading-relaxed ${highlightCls}`}>
      <span className="text-slate-300 dark:text-gray-700 text-xs tabular-nums">{time}</span>
      {' '}
      <span className={`font-medium ${nickColor}`}>&lt;{msg.nick}&gt;</span>
      {' '}
      <span className="text-slate-800 dark:text-gray-200">{msg.text}</span>
    </div>
  )
}

export default function ChatPanel() {
  const { messages, users, topic, channel, status } = useIrcStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!input.trim() || !channel || status !== 'connected') return
    await window.api.irc.send(channel, input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Topic bar */}
      {topic && (
        <div className="px-3 py-1.5 text-xs text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 truncate font-mono">
          <span className="text-slate-500 dark:text-gray-400">topic:</span> {topic}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 font-mono"
          role="log"
          aria-label="IRC messages"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="text-slate-500 dark:text-gray-400 text-sm italic">
              {status === 'connected'
                ? 'Join a channel to start chatting'
                : 'Connect to an IRC server to begin'}
            </div>
          )}
          {messages.map((msg) => (
            <MessageLine key={msg.id} msg={msg} />
          ))}
        </div>

        {/* User list */}
        {users.length > 0 && (
          <div
            className="w-36 border-l border-slate-200 dark:border-gray-700 p-2 overflow-y-auto bg-slate-50 dark:bg-gray-800"
            aria-label="IRC users"
          >
            <div className="text-xs text-slate-500 dark:text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
              Users ({users.length})
            </div>
            {users.map((u) => (
              <div key={u.nick} className="text-xs text-slate-700 dark:text-gray-300 py-0.5 truncate font-mono">
                <span className="text-amber-500 dark:text-amber-400">
                  {u.modes.includes('o') ? '@' : u.modes.includes('v') ? '+' : ''}
                </span>
                {u.nick}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex border-t border-slate-200 dark:border-gray-700"
        aria-label="Send message"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={status === 'connected' ? 'Type a message…' : 'Not connected'}
          disabled={status !== 'connected'}
          aria-label="Message input"
          className="flex-1 px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-600 border-none outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status !== 'connected' || !input.trim()}
          aria-label="Send message"
          className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}

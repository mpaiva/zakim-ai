import { useEffect, useRef, useState } from 'react'
import { useIrcStore } from '../stores/ircStore'
import type { IrcMessage } from '../../shared/types'

function MessageLine({ msg }: { msg: IrcMessage }) {
  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const isBot = ['Zakim', 'RRSAgent', 'trackbot'].includes(msg.nick)

  const nickColor = isBot
    ? 'text-yellow-400'
    : msg.type === 'system'
      ? 'text-gray-500'
      : 'text-cyan-400'

  if (msg.type === 'join' || msg.type === 'part' || msg.type === 'quit') {
    return (
      <div className="text-xs text-gray-500 py-0.5">
        <span className="text-gray-600">{time}</span>{' '}
        {msg.text}
      </div>
    )
  }

  if (msg.type === 'system') {
    return (
      <div className="text-xs text-gray-400 py-0.5 italic">
        <span className="text-gray-600">{time}</span>{' '}
        {msg.text}
      </div>
    )
  }

  if (msg.type === 'action') {
    return (
      <div className="text-sm py-0.5">
        <span className="text-gray-600 text-xs">{time}</span>{' '}
        <span className="text-purple-400 italic">* {msg.nick} {msg.text}</span>
      </div>
    )
  }

  return (
    <div className="text-sm py-0.5">
      <span className="text-gray-600 text-xs">{time}</span>{' '}
      <span className={`font-medium ${nickColor}`}>&lt;{msg.nick}&gt;</span>{' '}
      <span className="text-gray-200">{msg.text}</span>
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !channel || status !== 'connected') return
    await window.api.irc.send(channel, input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Topic bar */}
      {topic && (
        <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 border-b border-gray-700 truncate">
          Topic: {topic}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono">
          {messages.length === 0 && (
            <div className="text-gray-500 text-sm italic">
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
          <div className="w-40 border-l border-gray-700 p-2 overflow-y-auto">
            <div className="text-xs text-gray-500 mb-1">
              Users ({users.length})
            </div>
            {users.map((u) => (
              <div key={u.nick} className="text-sm text-gray-300 py-0.5 truncate">
                {u.modes.includes('o') ? '@' : u.modes.includes('v') ? '+' : ''}{u.nick}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex border-t border-gray-700">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={status === 'connected' ? 'Type a message...' : 'Not connected'}
          disabled={status !== 'connected'}
          className="flex-1 px-3 py-2 text-sm bg-gray-900 border-none outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status !== 'connected' || !input.trim()}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

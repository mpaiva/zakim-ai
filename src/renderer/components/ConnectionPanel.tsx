import { useIrcStore } from '../stores/ircStore'

export default function ConnectionPanel({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean
  onToggleTheme: () => void
}) {
  const {
    status, nick, channel, host, port, tls,
    setNick, setChannel, setHost, setPort, setTls,
  } = useIrcStore()

  const connected = status === 'connected'
  const connecting = status === 'connecting'

  async function handleConnect() {
    if (connected) {
      await window.api.irc.disconnect()
    } else {
      await window.api.irc.connect({ host, port, nick, tls })
    }
  }

  async function handleJoin() {
    if (connected && channel) {
      await window.api.irc.join(channel)
    }
  }

  const statusColor = {
    disconnected: 'bg-slate-400 dark:bg-gray-500',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  }[status]

  const inputCls = 'px-2 py-1 text-sm font-mono bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-600 disabled:opacity-50 transition-colors'

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
      {/* Status dot */}
      <div
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor} transition-colors`}
        title={`IRC: ${status}`}
        role="status"
        aria-label={`IRC status: ${status}`}
      />

      {/* Server */}
      <input
        type="text"
        value={host}
        onChange={(e) => setHost(e.target.value)}
        disabled={connected || connecting}
        placeholder="Host"
        aria-label="IRC server hostname"
        className={`w-36 ${inputCls}`}
      />

      {/* Port */}
      <input
        type="number"
        value={port}
        onChange={(e) => setPort(Number(e.target.value))}
        disabled={connected || connecting}
        aria-label="IRC server port"
        className={`w-16 ${inputCls}`}
      />

      {/* TLS */}
      <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={tls}
          onChange={(e) => {
            setTls(e.target.checked)
            if (e.target.checked && port === 6667) setPort(6697)
            if (!e.target.checked && port === 6697) setPort(6667)
          }}
          disabled={connected || connecting}
          className="accent-amber-500"
          aria-label="Use TLS encryption"
        />
        TLS
      </label>

      {/* Nickname */}
      <input
        type="text"
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        disabled={connected || connecting}
        placeholder="Nickname"
        aria-label="IRC nickname"
        className={`w-28 ${inputCls}`}
      />

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        aria-label={connected ? 'Disconnect from IRC' : 'Connect to IRC'}
        className={`px-3 py-1 text-sm rounded font-medium transition-colors disabled:opacity-50 ${
          connected
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold'
        }`}
      >
        {connecting ? 'Connecting…' : connected ? 'Disconnect' : 'Connect'}
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-slate-200 dark:bg-gray-700 mx-0.5" />

      {/* Channel */}
      <input
        type="text"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        placeholder="#channel"
        aria-label="IRC channel to join"
        className={`w-24 ${inputCls}`}
        disabled={!connected}
      />
      <button
        onClick={handleJoin}
        disabled={!connected || !channel}
        aria-label="Join IRC channel"
        className="px-3 py-1 text-sm rounded font-medium bg-green-700 hover:bg-green-800 text-white disabled:opacity-50 transition-colors"
      >
        Join
      </button>

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Light mode' : 'Dark mode'}
        className="ml-auto px-2 py-1 text-xs rounded font-medium bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-300 transition-colors shrink-0"
      >
        {isDark ? '☀ Light' : '☾ Dark'}
      </button>
    </div>
  )
}

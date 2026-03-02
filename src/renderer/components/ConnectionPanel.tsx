import { useIrcStore } from '../stores/ircStore'
import TlsInfoPopover from './TlsInfoPopover'
import { W3C_CHANNELS } from '../data/w3cChannels'

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
      if (channel) await window.api.irc.join(channel)
    }
  }

  const statusColor = {
    disconnected: 'bg-slate-400 dark:bg-gray-500',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  }[status]

  const inputCls = '[field-sizing:content] min-w-10 px-2 py-1 text-sm font-mono bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-600 disabled:opacity-50 transition-colors'
  const groupCls = 'flex items-center gap-1.5 bg-slate-100 dark:bg-gray-800 rounded-lg px-2 py-1'

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
      {/* Status dot */}
      <div
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor} transition-colors`}
        title={`IRC: ${status}`}
        role="status"
        aria-label={`IRC status: ${status}`}
      />

      {/* Server group: host, port, TLS, nick */}
      <div role="group" aria-label="Server settings" className={groupCls}>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          disabled={connected || connecting}
          placeholder="Host"
          aria-label="IRC server hostname"
          className={inputCls}
        />

        <input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          disabled={connected || connecting}
          aria-label="IRC server port"
          className={inputCls}
        />

        {/* Custom TLS toggle */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={tls}
            onClick={() => {
              const next = !tls
              setTls(next)
              if (next && port === 6667) setPort(6697)
              if (!next && port === 6697) setPort(6667)
            }}
            disabled={connected || connecting}
            aria-label="TLS encryption"
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-amber-500 ${
              tls ? 'bg-amber-500' : 'bg-slate-300 dark:bg-gray-600'
            }`}
          >
            <span className={`absolute inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
              tls ? 'translate-x-3.5' : 'translate-x-0.5'
            }`} />
          </button>
          <span className="text-xs text-slate-600 dark:text-gray-400 select-none">TLS</span>
          <TlsInfoPopover placement="bottom" />
        </div>

        <input
          type="text"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          disabled={connected || connecting}
          placeholder="Nickname"
          aria-label="IRC nickname"
          className={inputCls}
        />
      </div>

      {/* Channel group: channel, connect, join */}
      <div role="group" aria-label="Channel" className={groupCls}>
        <input
          type="text"
          value={channel}
          onChange={(e) => {
            const v = e.target.value
            setChannel(v && !v.startsWith('#') ? '#' + v : v)
          }}
          placeholder="#channel"
          aria-label="IRC channel to join"
          list="w3c-channels-bar"
          className={inputCls}
        />
        <datalist id="w3c-channels-bar">
          {W3C_CHANNELS.map(({ channel: ch, label }) => (
            <option key={ch} value={ch}>{label}</option>
          ))}
        </datalist>
        <button
          onClick={handleConnect}
          disabled={connecting}
          aria-label={connected ? 'Disconnect from IRC' : 'Connect to IRC and join channel'}
          className={`px-3 py-1 text-sm rounded font-medium transition-colors disabled:opacity-50 ${
            connected
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold'
          }`}
        >
          {connecting ? 'Connecting…' : connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

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

import { useIrcStore } from '../stores/ircStore'

export default function ConnectionPanel() {
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
    disconnected: 'bg-gray-500',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  }[status]

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-800 border-b border-gray-700">
      {/* Status dot */}
      <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} title={status} />

      {/* Server */}
      <input
        type="text"
        value={host}
        onChange={(e) => setHost(e.target.value)}
        disabled={connected || connecting}
        placeholder="Host"
        className="w-36 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded disabled:opacity-50"
      />

      {/* Port */}
      <input
        type="number"
        value={port}
        onChange={(e) => setPort(Number(e.target.value))}
        disabled={connected || connecting}
        className="w-16 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded disabled:opacity-50"
      />

      {/* TLS */}
      <label className="flex items-center gap-1 text-sm text-gray-400">
        <input
          type="checkbox"
          checked={tls}
          onChange={(e) => {
            setTls(e.target.checked)
            if (e.target.checked && port === 6667) setPort(6697)
            if (!e.target.checked && port === 6697) setPort(6667)
          }}
          disabled={connected || connecting}
          className="accent-blue-500"
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
        className="w-28 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded disabled:opacity-50"
      />

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        className={`px-3 py-1 text-sm rounded font-medium ${
          connected
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-blue-600 hover:bg-blue-700'
        } disabled:opacity-50`}
      >
        {connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect'}
      </button>

      {/* Channel */}
      <div className="w-px h-6 bg-gray-600 mx-1" />
      <input
        type="text"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        placeholder="#channel"
        className="w-24 px-2 py-1 text-sm bg-gray-900 border border-gray-600 rounded disabled:opacity-50"
        disabled={!connected}
      />
      <button
        onClick={handleJoin}
        disabled={!connected || !channel}
        className="px-3 py-1 text-sm rounded font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50"
      >
        Join
      </button>
    </div>
  )
}

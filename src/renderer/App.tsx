import { useEffect } from 'react'
import ConnectionPanel from './components/ConnectionPanel'
import ChatPanel from './components/ChatPanel'
import AudioSidebar from './components/AudioSidebar'
import MeetingActions from './components/MeetingActions'
import { useIrcStore } from './stores/ircStore'
import { useAudioStore } from './stores/audioStore'
import { useScribeStore } from './stores/scribeStore'
import { useAutoScribe } from './hooks/useAutoScribe'
import type { IrcConnectionStatus } from '../shared/types'

export default function App() {
  const ircStatus = useIrcStore((s) => s.status)
  const audioStatus = useAudioStore((s) => s.status)
  const whisperStatus = useAudioStore((s) => s.whisperStatus)
  const scribeMode = useScribeStore((s) => s.mode)
  const apiKeySet = useScribeStore((s) => s.apiKeySet)
  const scribeProcessing = useScribeStore((s) => s.processing)
  const transcribing = useAudioStore((s) => s.transcribing)

  useAutoScribe()

  // Wire up IPC listeners
  useEffect(() => {
    const unsubs = [
      window.api.irc.onMessage((msg) => useIrcStore.getState().addMessage(msg)),
      window.api.irc.onStatus((status) =>
        useIrcStore.getState().setStatus(status as IrcConnectionStatus)
      ),
      window.api.irc.onUsers((users) => useIrcStore.getState().setUsers(users)),
      window.api.irc.onTopic((topic) => useIrcStore.getState().setTopic(topic)),
    ]

    // Try to restore API key
    window.api.settings.getApiKey().then((key) => {
      if (key) {
        window.api.scribe.configure(key)
        useScribeStore.getState().setApiKeySet(true)
      }
    })

    // Try to restore HF token
    window.api.settings.getHfToken().then((token) => {
      if (token) {
        useScribeStore.getState().setHfTokenSet(true)
      }
    })

    return () => unsubs.forEach((fn) => fn())
  }, [])

  const statusDot = (color: string) =>
    `inline-block w-2 h-2 rounded-full ${color}`

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Connection bar */}
      <ConnectionPanel />

      {/* Main content: three-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Chat */}
        <div className="flex-1 flex flex-col border-r border-gray-700 min-w-0">
          <ChatPanel />
        </div>

        {/* Right sidebar: unified Audio + Scribe */}
        <div className="w-80 flex flex-col min-w-0">
          <AudioSidebar />
        </div>
      </div>

      {/* Meeting actions */}
      <MeetingActions />

      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1.5 text-xs text-gray-500 bg-gray-800 border-t border-gray-700">
        <span className="flex items-center gap-1.5">
          <span className={statusDot(
            ircStatus === 'connected' ? 'bg-green-500' :
            ircStatus === 'connecting' ? 'bg-yellow-500' :
            ircStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
          )} />
          IRC: {ircStatus}
        </span>

        <span className="flex items-center gap-1.5">
          <span className={statusDot(
            audioStatus === 'capturing' ? 'bg-green-500' :
            audioStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
          )} />
          Audio: {audioStatus}
        </span>

        <span className="flex items-center gap-1.5">
          <span className={statusDot(
            whisperStatus === 'ready' ? 'bg-green-500' :
            whisperStatus === 'loading' ? 'bg-yellow-500' :
            whisperStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
          )} />
          Whisper: {whisperStatus}
        </span>

        <span className="flex items-center gap-1.5">
          <span className={statusDot(scribeMode === 'auto' ? 'bg-orange-500' : 'bg-blue-500')} />
          Scribe: {scribeMode}
        </span>

        <span className="flex items-center gap-1.5">
          <span className={statusDot(
            scribeProcessing ? 'bg-purple-500' :
            transcribing ? 'bg-yellow-500' :
            apiKeySet ? 'bg-green-500' : 'bg-gray-500'
          )} />
          Claude: {scribeProcessing ? 'processing' : transcribing ? 'transcribing' : apiKeySet ? 'ready' : 'no key'}
        </span>

        <span className="ml-auto text-gray-600">Zakim AI v0.1.0</span>
      </div>
    </div>
  )
}

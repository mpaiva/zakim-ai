import { useEffect, useRef, useState } from 'react'
import ConnectionPanel from './components/ConnectionPanel'
import ChatPanel from './components/ChatPanel'
import AudioSidebar from './components/AudioSidebar'
import MeetingActions from './components/MeetingActions'
import { useIrcStore } from './stores/ircStore'
import { useAudioStore } from './stores/audioStore'
import { useScribeStore } from './stores/scribeStore'
import { useAutoScribe } from './hooks/useAutoScribe'
import type { IrcConnectionStatus } from '../shared/types'

const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 640

export default function App() {
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const dragging = useRef(false)

  // Theme toggle — dark by default
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light')

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  function onDragStart(e: React.PointerEvent) {
    e.preventDefault()
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const containerRight = (e.currentTarget as HTMLElement).getBoundingClientRect().right
    const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, containerRight - e.clientX))
    setSidebarWidth(newWidth)
  }

  function onDragEnd() {
    dragging.current = false
  }

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

  function StatusDot({ color }: { color: string }) {
    return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-gray-100 font-sans antialiased select-none">
      {/* Connection bar */}
      <ConnectionPanel isDark={isDark} onToggleTheme={() => setIsDark((v) => !v)} />

      {/* Main content: three-panel layout */}
      <div
        className="flex flex-1 min-h-0 bg-white dark:bg-gray-900"
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        {/* Left: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatPanel />
        </div>

        {/* Drag handle */}
        <div
          onPointerDown={onDragStart}
          className="w-1 cursor-col-resize bg-slate-200 dark:bg-gray-700 hover:bg-amber-400 dark:hover:bg-amber-500 active:bg-amber-400 transition-colors shrink-0 touch-none"
          title="Drag to resize"
          role="separator"
          aria-orientation="vertical"
        />

        {/* Right sidebar: unified Audio + Scribe */}
        <div
          className="flex flex-col min-w-0 shrink-0 border-l border-slate-200 dark:border-gray-700"
          style={{ width: sidebarWidth }}
        >
          <AudioSidebar />
        </div>
      </div>

      {/* Meeting actions */}
      <MeetingActions />

      {/* Status bar */}
      <div
        role="status"
        aria-label="Application status"
        className="flex items-center gap-0 px-3 py-1.5 text-[11px] bg-white dark:bg-gray-900 border-t border-slate-200 dark:border-gray-700 font-mono"
      >
        {/* IRC */}
        <div
          className="flex items-center gap-1.5 pr-3"
          title={`IRC: ${ircStatus}`}
        >
          <StatusDot color={
            ircStatus === 'connected' ? 'bg-green-500' :
            ircStatus === 'connecting' ? 'bg-yellow-500' :
            ircStatus === 'error' ? 'bg-red-500' : 'bg-slate-300 dark:bg-gray-600'
          } />
          <span className="text-slate-500 dark:text-gray-400">IRC</span>
          {ircStatus !== 'disconnected' && (
            <span className="text-slate-700 dark:text-gray-300">{ircStatus}</span>
          )}
        </div>

        <span aria-hidden="true" className="text-slate-200 dark:text-gray-800 pr-3">|</span>

        {/* Audio */}
        <div
          className="flex items-center gap-1.5 pr-3"
          title={`Audio: ${audioStatus}`}
        >
          <StatusDot color={
            audioStatus === 'capturing' ? 'bg-green-500' :
            audioStatus === 'error' ? 'bg-red-500' : 'bg-slate-300 dark:bg-gray-600'
          } />
          <span className="text-slate-500 dark:text-gray-400">Audio</span>
          {(audioStatus === 'capturing' || audioStatus === 'error') && (
            <span className="text-slate-700 dark:text-gray-300">{audioStatus}</span>
          )}
        </div>

        <span aria-hidden="true" className="text-slate-200 dark:text-gray-800 pr-3">|</span>

        {/* Whisper */}
        <div
          className="flex items-center gap-1.5 pr-3"
          title={`Whisper: ${whisperStatus}`}
        >
          <StatusDot color={
            whisperStatus === 'ready' ? 'bg-green-500' :
            whisperStatus === 'loading' ? 'bg-yellow-500' :
            whisperStatus === 'error' ? 'bg-red-500' : 'bg-slate-300 dark:bg-gray-600'
          } />
          <span className="text-slate-500 dark:text-gray-400">Whisper</span>
          {(whisperStatus === 'loading' || whisperStatus === 'ready' || whisperStatus === 'error') && (
            <span className={whisperStatus === 'error' ? 'text-red-500' : 'text-slate-700 dark:text-gray-300'}>
              {whisperStatus}
            </span>
          )}
        </div>

        <span aria-hidden="true" className="text-slate-200 dark:text-gray-800 pr-3">|</span>

        {/* Scribe — always show mode since it's a user-controlled setting */}
        <div
          className="flex items-center gap-1.5 pr-3"
          title={`Scribe mode: ${scribeMode}`}
        >
          <StatusDot color={scribeMode === 'auto' ? 'bg-amber-500' : 'bg-blue-500'} />
          <span className="text-slate-500 dark:text-gray-400">Scribe</span>
          <span className={scribeMode === 'auto' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}>
            {scribeMode}
          </span>
        </div>

        <span aria-hidden="true" className="text-slate-200 dark:text-gray-800 pr-3">|</span>

        {/* Claude */}
        <div
          className="flex items-center gap-1.5"
          title={`Claude: ${scribeProcessing ? 'processing' : transcribing ? 'transcribing' : apiKeySet ? 'ready' : 'no key'}`}
        >
          <StatusDot color={
            scribeProcessing ? 'bg-purple-500' :
            transcribing ? 'bg-yellow-500' :
            apiKeySet ? 'bg-green-500' : 'bg-slate-300 dark:bg-gray-600'
          } />
          <span className="text-slate-500 dark:text-gray-400">Claude</span>
          {(scribeProcessing || transcribing || !apiKeySet) && (
            <span className={!apiKeySet ? 'text-slate-400 dark:text-gray-500' : 'text-slate-700 dark:text-gray-300'}>
              {scribeProcessing ? 'processing' : transcribing ? 'transcribing' : 'no key'}
            </span>
          )}
        </div>

        <span className="ml-auto text-slate-400 dark:text-gray-600">v0.1.0</span>
      </div>
    </div>
  )
}

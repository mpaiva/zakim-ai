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
      <ConnectionPanel />

      {/* Main content: three-panel layout */}
      <div
        className="flex flex-1 min-h-0"
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
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs bg-white dark:bg-gray-900 border-t border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400">
        <StatusDot color={
          ircStatus === 'connected' ? 'bg-green-500' :
          ircStatus === 'connecting' ? 'bg-yellow-500' :
          ircStatus === 'error' ? 'bg-red-500' : 'bg-slate-400 dark:bg-gray-600'
        } />
        <span className="font-mono">IRC: {ircStatus}</span>

        <span className="text-slate-300 dark:text-gray-700" aria-hidden="true">·</span>

        <StatusDot color={
          audioStatus === 'capturing' ? 'bg-green-500' :
          audioStatus === 'error' ? 'bg-red-500' : 'bg-slate-400 dark:bg-gray-600'
        } />
        <span className="font-mono">Audio: {audioStatus}</span>

        <span className="text-slate-300 dark:text-gray-700" aria-hidden="true">·</span>

        <StatusDot color={
          whisperStatus === 'ready' ? 'bg-green-500' :
          whisperStatus === 'loading' ? 'bg-yellow-500' :
          whisperStatus === 'error' ? 'bg-red-500' : 'bg-slate-400 dark:bg-gray-600'
        } />
        <span className="font-mono">Whisper: {whisperStatus}</span>

        <span className="text-slate-300 dark:text-gray-700" aria-hidden="true">·</span>

        <StatusDot color={scribeMode === 'auto' ? 'bg-amber-500' : 'bg-blue-500'} />
        <span className="font-mono">Scribe: {scribeMode}</span>

        <span className="text-slate-300 dark:text-gray-700" aria-hidden="true">·</span>

        <StatusDot color={
          scribeProcessing ? 'bg-purple-500' :
          transcribing ? 'bg-yellow-500' :
          apiKeySet ? 'bg-green-500' : 'bg-slate-400 dark:bg-gray-600'
        } />
        <span className="font-mono">
          Claude: {scribeProcessing ? 'processing' : transcribing ? 'transcribing' : apiKeySet ? 'ready' : 'no key'}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <span className="text-slate-500 dark:text-gray-400">Zakim AI v0.1.0</span>
          <button
            onClick={() => setIsDark((v) => !v)}
            className="px-2 py-0.5 rounded text-xs bg-slate-200 hover:bg-slate-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-300 transition-colors"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? '☀ Light' : '☾ Dark'}
          </button>
        </span>
      </div>
    </div>
  )
}

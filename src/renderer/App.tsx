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
  const [statusExpanded, setStatusExpanded] = useState(false)
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
        className="flex items-center gap-2 px-3 py-1 text-xs bg-white dark:bg-gray-900 border-t border-slate-200 dark:border-gray-700"
      >
        <button
          onClick={() => setStatusExpanded((v) => !v)}
          aria-expanded={statusExpanded}
          aria-label="Toggle status details"
          className="text-slate-400 dark:text-gray-600 hover:text-slate-600 dark:hover:text-gray-400 transition-colors shrink-0 text-[10px] leading-none"
        >
          {statusExpanded ? '▾' : '▸'}
        </button>

        {/* Always-visible dots */}
        <div className="flex items-center gap-1" aria-hidden="true">
          <StatusDot color={
            ircStatus === 'connected' ? 'bg-green-500' :
            ircStatus === 'connecting' ? 'bg-yellow-500' :
            ircStatus === 'error' ? 'bg-red-500' : 'bg-slate-400 dark:bg-gray-600'
          } />
          <StatusDot color={
            audioStatus === 'capturing' ? 'bg-green-500' :
            audioStatus === 'error' ? 'bg-red-500' : 'bg-slate-400 dark:bg-gray-600'
          } />
          <StatusDot color={
            whisperStatus === 'ready' ? 'bg-green-500' :
            whisperStatus === 'loading' ? 'bg-yellow-500' :
            whisperStatus === 'error' ? 'bg-red-500' : 'bg-slate-400 dark:bg-gray-600'
          } />
          <StatusDot color={scribeMode === 'auto' ? 'bg-amber-500' : 'bg-blue-500'} />
          <StatusDot color={
            scribeProcessing ? 'bg-purple-500' :
            transcribing ? 'bg-yellow-500' :
            apiKeySet ? 'bg-green-500' : 'bg-slate-400 dark:bg-gray-600'
          } />
        </div>

        {/* Expanded labels */}
        {statusExpanded && (
          <div className="flex items-center gap-2 text-slate-600 dark:text-gray-400 font-mono">
            <span aria-hidden="true" className="text-slate-300 dark:text-gray-700">·</span>
            <span>IRC: {ircStatus}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-gray-700">·</span>
            <span>Audio: {audioStatus}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-gray-700">·</span>
            <span>Whisper: {whisperStatus}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-gray-700">·</span>
            <span>Scribe: {scribeMode}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-gray-700">·</span>
            <span>Claude: {scribeProcessing ? 'processing' : transcribing ? 'transcribing' : apiKeySet ? 'ready' : 'no key'}</span>
          </div>
        )}

        <span className="ml-auto text-slate-500 dark:text-gray-400 font-mono">Zakim AI v0.1.0</span>
      </div>
    </div>
  )
}

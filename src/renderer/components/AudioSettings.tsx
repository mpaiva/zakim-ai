import { useEffect, useState } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useScribeStore } from '../stores/scribeStore'
import { loadWhisperModel } from '../audioCapture'
import type { AudioSource } from '../../shared/types'

const inputCls = 'px-2 py-1 text-sm bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-slate-900 dark:text-gray-100 disabled:opacity-50 transition-colors'

export default function AudioSettings() {
  const {
    status, sources, selectedSourceId, whisperStatus, whisperProgress, whisperMessage,
    bufferDuration, whisperModel, systemAudioAvailable, captureError,
    setSources, setSelectedSourceId,
    setWhisperStatus, setWhisperProgress, setWhisperMessage,
    setBufferDuration, setWhisperModel,
    setSystemAudioAvailable, setCaptureError,
  } = useAudioStore()
  const { apiKeySet, hfTokenSet } = useScribeStore()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [hfTokenInput, setHfTokenInput] = useState('')

  async function loadModel() {
    if (whisperStatus === 'loading') return
    setWhisperStatus('loading')
    setWhisperProgress(0)
    setWhisperMessage('Initializing...')

    try {
      await loadWhisperModel(whisperModel, (info) => {
        switch (info.status) {
          case 'initiate':
          case 'download':
            setWhisperMessage(`Downloading ${info.file}...`)
            break
          case 'progress':
            if (info.progress !== undefined) setWhisperProgress(info.progress)
            setWhisperMessage(`Downloading ${info.file}...`)
            break
          case 'done':
            setWhisperProgress(100)
            setWhisperMessage(`Downloaded ${info.file}`)
            break
          case 'ready':
            setWhisperMessage('Pipeline ready')
            break
        }
      })
      setWhisperStatus('ready')
      setWhisperMessage('Model loaded')
    } catch (err) {
      console.error('Whisper load failed:', err)
      setWhisperStatus('error')
      setWhisperMessage((err as Error).message)
    }
  }

  async function refreshSources() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs: AudioSource[] = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          id: d.deviceId,
          name: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        }))
      if (systemAudioAvailable) {
        audioInputs.unshift({ id: '__system__', name: 'System Audio (macOS)' })
      }
      setSources(audioInputs)
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
    }
  }

  useEffect(() => {
    window.api.audio.systemStatus().then(({ available }) => setSystemAudioAvailable(available))
  }, [])

  useEffect(() => {
    refreshSources()
  }, [systemAudioAvailable])

  async function handleSetApiKey() {
    if (!apiKeyInput.trim()) return
    await window.api.scribe.configure(apiKeyInput.trim())
    await window.api.settings.setApiKey(apiKeyInput.trim())
    useScribeStore.getState().setApiKeySet(true)
    setApiKeyInput('')
  }

  async function handleSetHfToken() {
    if (!hfTokenInput.trim()) return
    await window.api.settings.setHfToken(hfTokenInput.trim())
    useScribeStore.getState().setHfTokenSet(true)
    setHfTokenInput('')
  }

  const capturing = status === 'capturing'

  return (
    <div className="p-3 flex flex-col gap-3 bg-slate-50 dark:bg-gray-800/50 border-b border-slate-200 dark:border-gray-700">
      <div className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Audio Settings</div>

      {/* Whisper model controls */}
      <div className="flex items-center gap-2">
        <select
          value={whisperModel}
          onChange={(e) => setWhisperModel(e.target.value as 'tiny' | 'base' | 'small')}
          disabled={whisperStatus === 'loading' || capturing}
          aria-label="Whisper model size"
          className={`flex-1 ${inputCls}`}
        >
          <option value="tiny">Whisper Tiny (fastest)</option>
          <option value="base">Whisper Base (balanced)</option>
          <option value="small">Whisper Small (best)</option>
        </select>

        {whisperStatus === 'ready' ? (
          <span
            role="status"
            aria-label="Whisper model is loaded"
            className="px-3 py-1 text-sm rounded font-medium bg-green-700/20 dark:bg-green-700/30 text-green-700 dark:text-green-400 border border-green-600/30 dark:border-green-600/40 whitespace-nowrap"
          >
            Model Ready
          </span>
        ) : (
          <button
            onClick={loadModel}
            disabled={whisperStatus === 'loading'}
            aria-label={whisperStatus === 'error' ? 'Retry loading Whisper model' : 'Load Whisper model'}
            className="px-3 py-1 text-sm rounded font-medium bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {whisperStatus === 'loading'
              ? `${Math.round(whisperProgress)}%`
              : whisperStatus === 'error'
                ? 'Error — Retry'
                : 'Load Model'}
          </button>
        )}
      </div>

      {/* Status message */}
      {whisperStatus === 'loading' && whisperMessage && (
        <div className="text-xs text-slate-500 dark:text-gray-400 truncate">{whisperMessage}</div>
      )}
      {whisperStatus === 'error' && whisperMessage && (
        <div className="text-xs text-red-600 dark:text-red-400 truncate">{whisperMessage}</div>
      )}

      {/* Source selection */}
      <div className="flex items-center gap-2">
        <select
          value={selectedSourceId || ''}
          onChange={(e) => setSelectedSourceId(e.target.value || null)}
          disabled={capturing}
          aria-label="Audio source"
          className={`flex-1 ${inputCls}`}
        >
          <option value="">Select audio source…</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button
          onClick={refreshSources}
          disabled={capturing}
          aria-label="Refresh audio sources"
          className="px-2 py-1 text-xs text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* macOS screen recording permission */}
      {systemAudioAvailable && (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => window.api.shell.openExternal('x-apple.systempreferences:com.apple.systempreferences.PrivacyPreferencesExtension?ScreenCapture')}
            className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-left transition-colors"
            aria-label="Open Screen and System Audio Recording permissions in System Settings"
          >
            Open Screen &amp; System Audio Recording permissions ↗
          </button>
          {captureError?.toLowerCase().includes('denied') && (
            <div
              className="text-xs bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded p-2 space-y-1.5"
              role="alert"
            >
              <p className="text-red-700 dark:text-red-300 font-medium">Permission denied</p>
              <p className="text-red-600 dark:text-red-400 leading-relaxed">
                In System Settings, click <strong className="text-red-700 dark:text-red-300">+</strong> under <em>System Audio Recording Only</em> and add:
              </p>
              <button
                onClick={() => navigator.clipboard.writeText('node_modules/electron/dist/Electron.app')}
                aria-label="Copy Electron app path to clipboard"
                className="font-mono text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-950/60 rounded px-1.5 py-0.5 hover:bg-red-200 dark:hover:bg-red-950 w-full text-left truncate transition-colors"
                title="Click to copy path"
              >
                node_modules/electron/dist/Electron.app
              </button>
              <p className="text-red-500 dark:text-red-500">Use <strong>⇧⌘G</strong> in the file picker to paste the full path.</p>
              <button
                onClick={() => setCaptureError(null)}
                aria-label="Dismiss permission error"
                className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-xs transition-colors"
              >
                dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Buffer duration */}
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-400">
        <label htmlFor="buffer-range" className="text-xs">Buffer:</label>
        <input
          id="buffer-range"
          type="range"
          min={10}
          max={60}
          step={5}
          value={bufferDuration}
          onChange={(e) => setBufferDuration(Number(e.target.value))}
          disabled={capturing}
          aria-label={`Buffer duration: ${bufferDuration} seconds`}
          className="flex-1 accent-amber-500"
        />
        <span className="w-8 text-right text-xs font-mono">{bufferDuration}s</span>
      </div>

      {/* API Key */}
      {!apiKeySet && (
        <div className="flex gap-1">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Claude API key"
            aria-label="Claude API key"
            className={`flex-1 ${inputCls}`}
          />
          <button
            onClick={handleSetApiKey}
            aria-label="Save Claude API key"
            className="px-3 py-1 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
          >
            Set
          </button>
        </div>
      )}
      {apiKeySet && (
        <div className="text-xs text-green-600 dark:text-green-400">Claude API key configured</div>
      )}

      {/* HuggingFace Token */}
      {!hfTokenSet && (
        <div className="flex gap-1">
          <input
            type="password"
            value={hfTokenInput}
            onChange={(e) => setHfTokenInput(e.target.value)}
            placeholder="HuggingFace token (speaker diarization)"
            aria-label="HuggingFace token for speaker diarization"
            className={`flex-1 ${inputCls}`}
          />
          <button
            onClick={handleSetHfToken}
            aria-label="Save HuggingFace token"
            className="px-3 py-1 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-gray-900 rounded transition-colors"
          >
            Set
          </button>
        </div>
      )}
      {hfTokenSet && (
        <div className="text-xs text-green-600 dark:text-green-400">HuggingFace token configured</div>
      )}
    </div>
  )
}

import { Fragment, useState } from 'react'

import { useAudioStore } from '../stores/audioStore'
import { useScribeStore } from '../stores/scribeStore'
import { useIrcStore } from '../stores/ircStore'
import { loadWhisperModel } from '../audioCapture'
import TlsInfoPopover from './TlsInfoPopover'
import { W3C_CHANNELS } from '../data/w3cChannels'

interface Props {
  onComplete: () => void
}


type WizardStep = 0 | 1 | 2 | 3 | 4 | 5

const STEP_LABELS = ['Claude API', 'HF Token', 'Whisper', 'IRC']

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-start px-8 pt-6 pb-2">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const isActive = step === n
        const isDone = step > n
        return (
          <Fragment key={n}>
            {i > 0 && (
              <div
                className={`flex-1 h-px mt-3.5 mx-1 ${isDone ? 'bg-amber-400' : 'bg-slate-200 dark:bg-gray-700'}`}
              />
            )}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive || isDone
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-200 dark:bg-gray-700 text-slate-400 dark:text-gray-500'
                }`}
              >
                {n}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isActive || isDone
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-400 dark:text-gray-500'
                }`}
              >
                {label}
              </span>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}


export default function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<WizardStep>(0)

  // Step 1 — Claude API Key
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [apiKeyError, setApiKeyError] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  // Step 2 — HuggingFace Token
  const [hfTokenInput, setHfTokenInput] = useState('')
  const [hfTokenSaved, setHfTokenSaved] = useState(false)

  // Step 3 — Whisper
  const [selectedModel, setSelectedModel] = useState<'tiny' | 'base' | 'small'>('base')
  const whisperStatus = useAudioStore((s) => s.whisperStatus)
  const whisperProgress = useAudioStore((s) => s.whisperProgress)
  const whisperMessage = useAudioStore((s) => s.whisperMessage)

  // Step 4 — IRC
  const ircStatus = useIrcStore((s) => s.status)
  const [ircHost, setIrcHost] = useState('irc.w3.org')
  const [ircPort, setIrcPort] = useState(6667)
  const [ircNick, setIrcNick] = useState('zakim-ai')
  const [ircChannelInput, setIrcChannelInput] = useState('#apa')
  const [ircTls, setIrcTls] = useState(false)
  const [ircConnecting, setIrcConnecting] = useState(false)

  // Derived
  const hfTokenSet = useScribeStore((s) => s.hfTokenSet)

  const inputCls =
    'w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors'

  function next() {
    setStep((s) => (s < 5 ? ((s + 1) as WizardStep) : s))
  }
  function prev() {
    setStep((s) => (s > 0 ? ((s - 1) as WizardStep) : s))
  }

  async function handleSetApiKey() {
    if (!apiKeyInput.trim() || savingKey) return
    setSavingKey(true)
    setApiKeyError('')
    try {
      await window.api.scribe.configure(apiKeyInput.trim())
      await window.api.settings.setApiKey(apiKeyInput.trim())
      useScribeStore.getState().setApiKeySet(true)
      setApiKeySaved(true)
      setApiKeyInput('')
    } catch (err) {
      setApiKeyError((err as Error).message || 'Failed to save key')
    } finally {
      setSavingKey(false)
    }
  }

  async function handleSetHfToken() {
    if (!hfTokenInput.trim()) return
    await window.api.settings.setHfToken(hfTokenInput.trim())
    useScribeStore.getState().setHfTokenSet(true)
    setHfTokenSaved(true)
    setHfTokenInput('')
  }

  async function handleLoadWhisper() {
    if (whisperStatus === 'loading') return
    const store = useAudioStore.getState()
    store.setWhisperModel(selectedModel)
    store.setWhisperStatus('loading')
    store.setWhisperProgress(0)
    store.setWhisperMessage('Initializing...')
    try {
      await loadWhisperModel(selectedModel, (info) => {
        switch (info.status) {
          case 'initiate':
          case 'download':
            store.setWhisperMessage(`Downloading ${info.file ?? ''}...`)
            break
          case 'progress':
            if (info.progress !== undefined) store.setWhisperProgress(info.progress)
            store.setWhisperMessage(`Downloading ${info.file ?? ''}...`)
            break
          case 'done':
            store.setWhisperProgress(100)
            store.setWhisperMessage(`Downloaded ${info.file ?? ''}`)
            break
          case 'ready':
            store.setWhisperMessage('Pipeline ready')
            break
        }
      })
      store.setWhisperStatus('ready')
      store.setWhisperMessage('Model loaded')
    } catch (err) {
      store.setWhisperStatus('error')
      store.setWhisperMessage((err as Error).message)
    }
  }

  async function handleIrcConnect() {
    const store = useIrcStore.getState()
    store.setNick(ircNick)
    store.setChannel(ircChannelInput)
    store.setHost(ircHost)
    store.setPort(ircPort)
    store.setTls(ircTls)
    setIrcConnecting(true)
    try {
      await window.api.irc.connect({ host: ircHost, port: ircPort, nick: ircNick, tls: ircTls })
      await window.api.irc.join(ircChannelInput)
    } catch (err) {
      console.error('[wizard] IRC connect failed:', err)
    } finally {
      setIrcConnecting(false)
    }
  }

  function renderStep() {
    switch (step) {
      case 0: return renderWelcome()
      case 1: return renderApiKey()
      case 2: return renderHfToken()
      case 3: return renderWhisper()
      case 4: return renderIrc()
      case 5: return renderDone()
    }
  }

  function renderWelcome() {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-amber-500 rounded-2xl flex items-center justify-center">
          <span className="text-3xl font-black text-white">Z</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100 mb-1">Zakim AI</h1>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
          AI-powered meeting scribe for W3C IRC channels
        </p>
        <div className="space-y-2 mb-8 text-left">
          {[
            { icon: '🎙', label: 'Audio Transcription', desc: 'Whisper captures speech in real time' },
            { icon: '🤖', label: 'AI Formatting', desc: 'Claude structures it into clean meeting notes' },
            { icon: '💬', label: 'IRC Integration', desc: 'Posts directly to your W3C channel' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-gray-800 rounded-lg">
              <span className="text-xl shrink-0">{icon}</span>
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-gray-100">{label}</div>
                <div className="text-xs text-slate-500 dark:text-gray-400">{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={next}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold rounded-lg transition-colors text-sm"
        >
          Get Started →
        </button>
      </div>
    )
  }

  function renderApiKey() {
    return (
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-1">Connect Claude AI</h2>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-5">
          Zakim AI uses Claude to turn raw transcriptions into structured meeting notes. Your key is
          encrypted and stored locally — you won't need to re-enter it.
        </p>
        {apiKeySaved ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400 mb-4">
            <span>✓</span> Key saved
          </div>
        ) : (
          <div className="flex gap-2 mb-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetApiKey()}
              placeholder="sk-ant-..."
              aria-label="Claude API key"
              className={inputCls}
            />
            <button
              onClick={handleSetApiKey}
              disabled={!apiKeyInput.trim() || savingKey}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors shrink-0"
            >
              {savingKey ? '…' : 'Set Key'}
            </button>
          </div>
        )}
        {apiKeyError && <p className="text-xs text-red-500 mb-2">{apiKeyError}</p>}
        <p className="text-xs text-slate-400 dark:text-gray-500">
          Get your key at{' '}
          <button
            type="button"
            className="underline hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            onClick={() => window.api.shell.openExternal('https://console.anthropic.com')}
          >
            console.anthropic.com
          </button>
        </p>
      </div>
    )
  }

  function renderHfToken() {
    return (
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-1">
          Enable Speaker Diarization
        </h2>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-2">
          A HuggingFace token lets Zakim AI identify who said what by automatically attributing
          speech to specific speakers.
        </p>
        <p className="text-xs text-slate-400 dark:text-gray-500 mb-5">
          This step is optional — you can assign speakers manually in the sidebar.
        </p>
        {hfTokenSaved ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400 mb-4">
            <span>✓</span> Token saved
          </div>
        ) : (
          <div className="flex gap-2 mb-4">
            <input
              type="password"
              value={hfTokenInput}
              onChange={(e) => setHfTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetHfToken()}
              placeholder="hf_..."
              aria-label="HuggingFace token"
              className={inputCls}
            />
            <button
              onClick={handleSetHfToken}
              disabled={!hfTokenInput.trim()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-gray-900 disabled:opacity-50 transition-colors shrink-0"
            >
              Set Token
            </button>
          </div>
        )}
        <button
          onClick={next}
          className="text-xs text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 underline transition-colors"
        >
          Skip for now →
        </button>
      </div>
    )
  }

  function renderWhisper() {
    const models = [
      { id: 'tiny' as const, label: 'Tiny', desc: 'Fastest, lowest accuracy. Good for quick tests.' },
      { id: 'base' as const, label: 'Base', desc: 'Balanced speed and accuracy.' },
      { id: 'small' as const, label: 'Small', desc: 'Best accuracy, slower to load.' },
    ]
    const loading = whisperStatus === 'loading'
    const ready = whisperStatus === 'ready'

    return (
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-1">
          Load Speech Recognition
        </h2>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
          Whisper runs locally in your browser — no audio is sent to a server.
        </p>
        <div className="space-y-2 mb-4">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => !loading && !ready && setSelectedModel(m.id)}
              disabled={loading || ready}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors disabled:cursor-default ${
                selectedModel === m.id
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-slate-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedModel === m.id
                      ? 'border-amber-500'
                      : 'border-slate-300 dark:border-gray-600'
                  }`}
                >
                  {selectedModel === m.id && (
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                      {m.label}
                    </span>
                    {m.id === 'base' && (
                      <span className="text-xs text-slate-400 dark:text-gray-500">(recommended)</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{m.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
        {ready ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400 mb-3">
            <span>✓</span> Model ready
          </div>
        ) : loading ? (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-500 dark:text-gray-400 mb-1">
              <span className="truncate mr-2">{whisperMessage}</span>
              <span className="shrink-0">{Math.round(whisperProgress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${whisperProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={handleLoadWhisper}
            className="w-full py-2 mb-3 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-gray-900 transition-colors"
          >
            Load Model
          </button>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ Audio capture requires a loaded model
          </p>
          {!ready && (
            <button
              onClick={next}
              className="text-xs text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 underline transition-colors"
            >
              Skip — load later
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderIrc() {
    const statusColors: Record<string, string> = {
      disconnected: 'bg-slate-400 dark:bg-gray-500',
      connecting: 'bg-yellow-500',
      connected: 'bg-green-500',
      error: 'bg-red-500',
    }
    const isConnected = ircStatus === 'connected'
    const fieldCls =
      'px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors w-full disabled:opacity-50'

    return (
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-1">Connect to IRC</h2>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
          Connect to a W3C IRC channel to post meeting notes.
        </p>
        <div className="space-y-3 mb-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Server</label>
              <input
                type="text"
                value={ircHost}
                onChange={(e) => setIrcHost(e.target.value)}
                disabled={isConnected || ircConnecting}
                placeholder="irc.w3.org"
                className={fieldCls}
              />
            </div>
            <div className="w-20">
              <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Port</label>
              <input
                type="number"
                value={ircPort}
                onChange={(e) => setIrcPort(Number(e.target.value))}
                disabled={isConnected || ircConnecting}
                className={fieldCls}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Nickname</label>
              <input
                type="text"
                value={ircNick}
                onChange={(e) => setIrcNick(e.target.value)}
                disabled={isConnected || ircConnecting}
                placeholder="zakim-ai"
                className={fieldCls}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Channel</label>
              <input
                type="text"
                value={ircChannelInput}
                onChange={(e) => {
                  const v = e.target.value
                  setIrcChannelInput(v && !v.startsWith('#') ? '#' + v : v)
                }}
                disabled={isConnected || ircConnecting}
                placeholder="#apa"
                list="w3c-channels"
                className={fieldCls}
              />
              <datalist id="w3c-channels">
                {W3C_CHANNELS.map(({ channel, label }) => (
                  <option key={channel} value={channel}>{label}</option>
                ))}
              </datalist>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={ircTls}
              onClick={() => {
                const next = !ircTls
                setIrcTls(next)
                if (next && ircPort === 6667) setIrcPort(6697)
                if (!next && ircPort === 6697) setIrcPort(6667)
              }}
              disabled={isConnected || ircConnecting}
              aria-label="TLS encryption"
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors disabled:opacity-50 ${
                ircTls ? 'bg-amber-500' : 'bg-slate-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                  ircTls ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-xs text-slate-600 dark:text-gray-400">TLS</span>
            <TlsInfoPopover />
          </div>
        </div>
        {/* Live status */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${statusColors[ircStatus] ?? 'bg-slate-400'}`} />
          <span className="text-sm text-slate-600 dark:text-gray-300 capitalize">{ircStatus}</span>
        </div>
        {isConnected ? (
          <button
            onClick={() => window.api.irc.disconnect()}
            className="w-full py-2 mb-3 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleIrcConnect}
            disabled={ircConnecting}
            className="w-full py-2 mb-3 text-sm font-semibold rounded-lg bg-green-700 hover:bg-green-800 text-white disabled:opacity-50 transition-colors"
          >
            {ircConnecting ? 'Connecting…' : 'Connect & Join'}
          </button>
        )}
        <button
          onClick={next}
          className="text-xs text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 underline transition-colors"
        >
          Skip — connect later
        </button>
      </div>
    )
  }

  function renderDone() {
    const whisperReady = whisperStatus === 'ready'
    const ircConnected = ircStatus === 'connected'
    const channel = useIrcStore.getState().channel
    const items = [
      { label: 'Claude API key', done: true },
      { label: 'HuggingFace token', done: hfTokenSet },
      { label: 'Whisper model loaded', done: whisperReady },
      { label: `IRC connected to ${channel || '#channel'}`, done: ircConnected },
    ]

    return (
      <div className="text-center">
        <div className="text-4xl mb-3">🎉</div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100 mb-2">You're all set!</h2>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">Here's what was configured:</p>
        <div className="text-left space-y-2.5 mb-6">
          {items.map(({ label, done }) => (
            <div key={label} className="flex items-center gap-3">
              <span
                className={`text-base font-bold shrink-0 ${done ? 'text-green-500' : 'text-slate-300 dark:text-gray-600'}`}
              >
                {done ? '✓' : '○'}
              </span>
              <span
                className={`text-sm ${done ? 'text-slate-900 dark:text-gray-100' : 'text-slate-400 dark:text-gray-500'}`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
        {(!hfTokenSet || !whisperReady || !ircConnected) && (
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
            Skipped steps can be configured in the Settings sidebar later.
          </p>
        )}
        <button
          onClick={onComplete}
          className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors text-sm"
        >
          Launch Zakim AI →
        </button>
      </div>
    )
  }

  function renderNav() {
    if (step === 0 || step === 5) return null
    const canNext = step !== 1 || apiKeySaved
    return (
      <div className="px-8 pb-6 flex justify-between items-center border-t border-slate-100 dark:border-gray-800 pt-4">
        <button
          onClick={prev}
          className="text-sm text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={next}
          disabled={!canNext}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {step === 4 ? 'Finish' : 'Next →'}
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 dark:bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {step > 0 && step < 5 && <ProgressBar step={step} />}
        <div className="px-8 py-6">{renderStep()}</div>
        {renderNav()}
      </div>
    </div>
  )
}

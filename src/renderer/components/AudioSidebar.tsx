import { useState, useMemo, useEffect } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useScribeStore } from '../stores/scribeStore'
import { useIrcStore } from '../stores/ircStore'
import AudioSettings from './AudioSettings'
import AudioLevelBars from './AudioLevelBars'
import { startCapture, stopCapture } from '../audioCapture'
import AutoScribeBanner from './AutoScribeBanner'
import ScribeMessageRow from './ScribeMessageRow'
import SpeakerSelect from './SpeakerSelect'
import type { ScribeMessage, TranscriptionResult } from '../../shared/types'

function ReadyChecklist({
  onStart,
  onOpenSettings,
}: {
  onStart: () => void
  onOpenSettings: () => void
}) {
  const sources = useAudioStore((s) => s.sources)
  const selectedSourceId = useAudioStore((s) => s.selectedSourceId)
  const setSelectedSourceId = useAudioStore((s) => s.setSelectedSourceId)
  const whisperStatus = useAudioStore((s) => s.whisperStatus)
  const whisperModel = useAudioStore((s) => s.whisperModel)
  const ircStatus = useIrcStore((s) => s.status)
  const ircChannel = useIrcStore((s) => s.channel)
  const ircNick = useIrcStore((s) => s.nick)

  const [confirming, setConfirming] = useState(false)

  const modelReady = whisperStatus === 'ready'
  const sourceSelected = !!selectedSourceId
  const canStart = modelReady && sourceSelected
  const ircConnected = ircStatus === 'connected' && !!ircChannel
  const modelLabel = { tiny: 'Tiny', base: 'Base', small: 'Small' }[whisperModel]

  function handleStartClick() {
    if (ircConnected) {
      setConfirming(true)
    } else {
      onStart()
    }
  }

  function handleAnnounceAndStart() {
    window.api.irc.send(ircChannel!, `scribenick: ${ircNick}`)
    setConfirming(false)
    onStart()
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden text-sm">
      {/* Rows */}
      <div className="divide-y divide-slate-100 dark:divide-gray-800">

        {/* Whisper model */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className={`shrink-0 w-4 text-center font-bold ${modelReady ? 'text-green-500' : 'text-slate-300 dark:text-gray-600'}`}>
            {modelReady ? '✓' : '○'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-gray-300">
              Whisper {modelLabel} — speech recognition
            </p>
            {!modelReady && (
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">Model not yet loaded</p>
            )}
          </div>
          {modelReady ? (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">Ready</span>
          ) : (
            <button
              onClick={onOpenSettings}
              className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors shrink-0"
            >
              Load in Settings →
            </button>
          )}
        </div>

        {/* Audio source */}
        <div className="flex items-start gap-3 px-4 py-3">
          <span className={`shrink-0 w-4 text-center font-bold mt-0.5 ${sourceSelected ? 'text-green-500' : 'text-slate-300 dark:text-gray-600'}`}>
            {sourceSelected ? '✓' : '○'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-gray-300 mb-1.5">Audio source</p>
            <select
              value={selectedSourceId || ''}
              onChange={(e) => setSelectedSourceId(e.target.value || null)}
              aria-label="Select audio source"
              className="w-full text-xs border border-slate-200 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Select audio source…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Start / Confirmation */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-gray-800/50 border-t border-slate-100 dark:border-gray-800">
        {confirming ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-gray-300 mb-0.5">
                Announce as scriber?
              </p>
              <p className="text-xs text-slate-400 dark:text-gray-500 font-mono">
                scribenick: {ircNick} → {ircChannel}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAnnounceAndStart}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-green-700 hover:bg-green-800 text-white transition-colors"
              >
                Announce & Start
              </button>
              <button
                onClick={() => { setConfirming(false); onStart() }}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
              >
                Just Start
              </button>
            </div>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
            >
              ← Back
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartClick}
            disabled={!canStart}
            aria-label={canStart ? 'Start audio capture' : 'Complete the steps above to start'}
            className="w-full py-2 text-sm font-semibold rounded-lg transition-colors bg-green-700 hover:bg-green-800 text-white disabled:opacity-40"
          >
            {canStart ? '⏺  Start Scribing' : 'Complete the steps above'}
          </button>
        )}
      </div>
    </div>
  )
}

type FeedItem =
  | { kind: 'transcription'; data: TranscriptionResult; sortTime: number }
  | { kind: 'scribe'; data: ScribeMessage; sortTime: number }

const btnXs = 'px-2 py-1 text-xs rounded font-medium transition-colors disabled:opacity-40'

export default function AudioSidebar() {
  // Open settings by default until the Whisper model is loaded; auto-close once ready
  const [showSettings, setShowSettings] = useState(
    () => useAudioStore.getState().whisperStatus !== 'ready'
  )

  // Audio store
  const status = useAudioStore((s) => s.status)
  const selectedSourceId = useAudioStore((s) => s.selectedSourceId)
  const whisperStatus = useAudioStore((s) => s.whisperStatus)
  const transcriptions = useAudioStore((s) => s.transcriptions)
  const stickySpeaker = useAudioStore((s) => s.stickySpeaker)
  const assignSpeaker = useAudioStore((s) => s.assignSpeaker)
  const setStickySpeaker = useAudioStore((s) => s.setStickySpeaker)

  // Scribe store
  const messages = useScribeStore((s) => s.messages)
  const mode = useScribeStore((s) => s.mode)
  const apiKeySet = useScribeStore((s) => s.apiKeySet)
  const queue = useScribeStore((s) => s.queue)
  const { setMode, approveMessage, discardMessage, updateMessage, markSent, approveAll, removeFromQueue, addMessages, setProcessing } = useScribeStore()

  // IRC store
  const { channel, status: ircStatus } = useIrcStore()

  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processedIds, setProcessedIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  // Auto-close settings once the Whisper model becomes ready
  useEffect(() => {
    if (whisperStatus === 'ready') setShowSettings(false)
  }, [whisperStatus])

  const capturing = status === 'capturing'
  const canStart = !!selectedSourceId && whisperStatus === 'ready'

  // Unified feed
  const feed = useMemo<FeedItem[]>(() => [
    ...transcriptions.map((t) => ({ kind: 'transcription' as const, data: t, sortTime: t.timestamp })),
    ...messages.map((m) => ({ kind: 'scribe' as const, data: m, sortTime: m.timestamp })),
  ].sort((a, b) => a.sortTime - b.sortTime), [transcriptions, messages])

  // Process transcription with speaker attribution
  async function processSpeakers(transcriptionId: string) {
    const t = useAudioStore.getState().transcriptions.find((tr) => tr.id === transcriptionId)
    if (!t) return
    const speakerTexts = t.segments
      .filter((s) => s.speaker !== null)
      .map((s) => ({ speaker: s.speaker!, text: s.text }))
    if (speakerTexts.length === 0) return

    setProcessingId(transcriptionId)
    setError(null)
    setProcessing(true)
    try {
      let msgs
      if (typeof window.api.scribe.processSpeakers === 'function') {
        msgs = await window.api.scribe.processSpeakers(speakerTexts)
      } else {
        const text = speakerTexts.map((s) => `${s.speaker}: ${s.text}`).join('\n')
        msgs = await window.api.scribe.process(text)
      }
      addMessages(msgs)
      setProcessedIds((prev) => new Set([...prev, transcriptionId]))
    } catch (err) {
      console.error('[AudioSidebar] processSpeakers failed:', err)
      try {
        const text = speakerTexts.map((s) => `${s.speaker}: ${s.text}`).join('\n')
        const msgs = await window.api.scribe.process(text)
        addMessages(msgs)
        setProcessedIds((prev) => new Set([...prev, transcriptionId]))
      } catch (err2) {
        setError((err2 as Error).message || 'Processing failed')
      }
    } finally {
      setProcessing(false)
      setProcessingId(null)
    }
  }

  async function sendToIrc(msg: ScribeMessage) {
    if (ircStatus !== 'connected' || !channel) return
    const text = msg.editedText || msg.text
    await window.api.irc.send(channel, text)
    markSent(msg.id)
  }

  async function sendAllApproved() {
    const approved = messages.filter((m) => m.status === 'approved')
    for (const msg of approved) {
      await sendToIrc(msg)
    }
  }

  const pendingCount = messages.filter((m) => m.status === 'pending').length
  const approvedCount = messages.filter((m) => m.status === 'approved').length

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-gray-900">
      {/* Control bar */}
      <div className="p-2 border-b border-slate-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center gap-1.5">
          {/* Start / Stop */}
          {capturing ? (
            <button
              onClick={stopCapture}
              aria-label="Stop audio capture"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shrink-0"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
              Stop
            </button>
          ) : (
            <button
              onClick={startCapture}
              disabled={!canStart}
              aria-label={canStart ? 'Start audio capture' : 'Select a source and load the Whisper model first'}
              title={canStart ? undefined : 'Select a source and load the Whisper model first'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-semibold bg-green-700 hover:bg-green-800 text-white disabled:opacity-40 transition-colors shrink-0"
            >
              <span className="w-2 h-2 rounded-full bg-white/70 shrink-0" />
              Start
            </button>
          )}

          {/* Review / Auto toggle — joined pill */}
          <div
            className="flex rounded border border-slate-200 dark:border-gray-700 overflow-hidden shrink-0"
            role="radiogroup"
            aria-label="Scribe mode"
          >
            <button
              onClick={() => setMode('review')}
              role="radio"
              aria-checked={mode === 'review'}
              className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                mode === 'review'
                  ? 'bg-amber-500 text-gray-900'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
              }`}
            >
              Review
            </button>
            <button
              onClick={() => setMode('auto')}
              role="radio"
              aria-checked={mode === 'auto'}
              className={`px-2 py-0.5 text-xs font-medium border-l border-slate-200 dark:border-gray-700 transition-colors ${
                mode === 'auto'
                  ? 'bg-amber-500 text-gray-900'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
              }`}
            >
              Auto
            </button>
          </div>

          {/* Sticky speaker */}
          <SpeakerSelect
            value={stickySpeaker}
            onChange={(name) => setStickySpeaker(name)}
          />
          {stickySpeaker && (
            <button
              onClick={() => setStickySpeaker(null)}
              aria-label="Clear sticky speaker"
              title="Clear sticky speaker"
              className="text-slate-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 leading-none"
            >
              ✕
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            aria-label={showSettings ? 'Hide settings' : 'Show settings'}
            aria-pressed={showSettings}
            title={showSettings ? 'Hide settings' : 'Show settings'}
            className={`ml-auto px-1.5 py-0.5 text-sm rounded transition-colors ${
              showSettings
                ? 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-200'
                : 'text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-600 dark:hover:text-gray-300'
            }`}
          >
            ⚙
          </button>
        </div>

        {/* Auto-mode banner */}
        {mode === 'auto' && <AutoScribeBanner />}

        {/* Audio level bars — own row, shown while capturing */}
        <AudioLevelBars />

        {/* Batch controls */}
        {mode !== 'auto' && (pendingCount > 0 || approvedCount > 0) && (
          <div className="flex gap-1.5">
            {pendingCount > 0 && (
              <button
                onClick={approveAll}
                aria-label={`Approve all ${pendingCount} pending messages`}
                className={`${btnXs} bg-green-700 hover:bg-green-800 text-white`}
              >
                Approve All ({pendingCount})
              </button>
            )}
            {approvedCount > 0 && (
              <button
                onClick={sendAllApproved}
                disabled={ircStatus !== 'connected' || !channel}
                aria-label={`Send all ${approvedCount} approved messages to IRC`}
                className={`${btnXs} bg-blue-600 hover:bg-blue-700 text-white`}
              >
                Send All ({approvedCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mx-2 mt-2 px-2 py-1.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded"
          role="alert"
        >
          {error}
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="ml-2 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200"
          >
            dismiss
          </button>
        </div>
      )}

      {/* AudioSettings — always mounted, hidden when not active */}
      <div className={showSettings ? '' : 'hidden'}>
        <AudioSettings />
      </div>

      {/* Unified feed */}
      {!showSettings && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
          {feed.length === 0 && !capturing && (
            <ReadyChecklist
              onStart={startCapture}
              onOpenSettings={() => setShowSettings(true)}
            />
          )}
          {feed.length === 0 && !capturing && !apiKeySet && (
            <p className="text-xs text-amber-600 dark:text-amber-400 px-1 mt-1">
              Also set your Claude API key in Settings to enable AI formatting.
            </p>
          )}

          {feed.map((item) => {
            if (item.kind === 'transcription') {
              const t = item.data
              if (processedIds.has(t.id)) return null
              const allAssigned = t.segments.length > 0 && t.segments.every((s) => s.speaker !== null)
              const isProcessing = processingId === t.id
              return (
                <div key={t.id} className="bg-slate-50 dark:bg-gray-800 rounded p-2 space-y-1.5 border border-slate-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">
                      {new Date(t.timestamp).toLocaleTimeString()} — {t.duration}s
                    </span>
                    {apiKeySet && (
                      <button
                        onClick={() => processSpeakers(t.id)}
                        disabled={!allAssigned || isProcessing}
                        title={allAssigned ? 'Process with speaker attribution' : 'Assign all speakers first'}
                        aria-label={allAssigned ? 'Process transcription with speaker attribution' : 'Assign all speakers before processing'}
                        className={`${btnXs} bg-purple-600 hover:bg-purple-700 text-white`}
                      >
                        {isProcessing ? 'Processing…' : 'Process'}
                      </button>
                    )}
                  </div>

                  {t.segments.map((seg) => (
                    <div key={seg.id} className="flex items-start gap-1.5">
                      <SpeakerSelect
                        value={seg.speaker}
                        onChange={(speaker) => assignSpeaker(t.id, seg.id, speaker)}
                      />
                      <span className="text-xs text-slate-700 dark:text-gray-300 flex-1 leading-relaxed font-mono">
                        {seg.text}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }

            // Scribe message
            const msg = item.data
            return (
              <ScribeMessageRow
                key={msg.id}
                msg={msg}
                autoMode={mode === 'auto'}
                onApprove={() => approveMessage(msg.id)}
                onDiscard={() => discardMessage(msg.id)}
                onEdit={(text) => updateMessage(msg.id, { editedText: text })}
                onSend={() => sendToIrc(msg)}
              />
            )
          })}
        </div>
      )}

      {/* Speaker queue */}
      {queue.length > 0 && (
        <div className="px-2 py-2 border-t border-slate-200 dark:border-gray-700">
          <div className="text-xs text-slate-600 dark:text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
            Speaker Queue
          </div>
          <div className="space-y-1">
            {queue.map((entry) => (
              <div
                key={entry.nick}
                className="flex items-center justify-between text-sm bg-slate-50 dark:bg-gray-800 rounded px-2 py-1 border border-slate-200 dark:border-gray-700"
              >
                <span className="text-slate-800 dark:text-gray-200 font-mono text-xs">
                  {entry.nick}
                  {entry.comment && (
                    <span className="text-slate-500 dark:text-gray-400 ml-1.5 font-sans">— {entry.comment}</span>
                  )}
                </span>
                <button
                  onClick={() => removeFromQueue(entry.nick)}
                  aria-label={`Remove ${entry.nick} from queue`}
                  className="text-xs text-slate-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-2 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

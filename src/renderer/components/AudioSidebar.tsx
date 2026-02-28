import { useState, useMemo } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useScribeStore } from '../stores/scribeStore'
import { useIrcStore } from '../stores/ircStore'
import AudioSettings, { startCapture, stopCapture } from './AudioSettings'
import AutoScribeBanner from './AutoScribeBanner'
import ScribeMessageRow from './ScribeMessageRow'
import SpeakerSelect from './SpeakerSelect'
import type { ScribeMessage, TranscriptionResult } from '../../shared/types'

type FeedItem =
  | { kind: 'transcription'; data: TranscriptionResult; sortTime: number }
  | { kind: 'scribe'; data: ScribeMessage; sortTime: number }

export default function AudioSidebar() {
  const [showSettings, setShowSettings] = useState(false)

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
  const [error, setError] = useState<string | null>(null)

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
    } catch (err) {
      console.error('[AudioSidebar] processSpeakers failed:', err)
      try {
        const text = speakerTexts.map((s) => `${s.speaker}: ${s.text}`).join('\n')
        const msgs = await window.api.scribe.process(text)
        addMessages(msgs)
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
    <div className="flex flex-col h-full min-h-0">
      {/* Control bar */}
      <div className="p-2 border-b border-gray-700 space-y-2">
        <div className="flex items-center gap-1.5">
          {/* Start / Stop */}
          {capturing ? (
            <button
              onClick={stopCapture}
              className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 font-medium"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={startCapture}
              disabled={!canStart}
              className="px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 font-medium disabled:opacity-50"
            >
              Start
            </button>
          )}

          {/* Review / Auto toggle */}
          <div className="flex items-center gap-0.5 bg-gray-900 rounded p-0.5">
            <button
              onClick={() => setMode('review')}
              className={`px-2 py-0.5 text-xs rounded ${
                mode === 'review' ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
            >
              Review
            </button>
            <button
              onClick={() => setMode('auto')}
              className={`px-2 py-0.5 text-xs rounded ${
                mode === 'auto' ? 'bg-orange-600' : 'hover:bg-gray-700'
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
              className="text-xs text-gray-500 hover:text-gray-300"
              title="Clear sticky speaker"
            >
              Clear
            </button>
          )}

          {/* Settings gear */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`ml-auto px-1.5 py-0.5 text-xs rounded ${
              showSettings ? 'bg-gray-600' : 'hover:bg-gray-700'
            }`}
            title="Settings"
          >
            Settings
          </button>
        </div>

        {/* Auto-mode banner */}
        {mode === 'auto' && <AutoScribeBanner />}

        {/* Batch controls */}
        {mode !== 'auto' && (pendingCount > 0 || approvedCount > 0) && (
          <div className="flex gap-2">
            {pendingCount > 0 && (
              <button
                onClick={approveAll}
                className="px-2 py-1 text-xs bg-green-700 hover:bg-green-600 rounded"
              >
                Approve All ({pendingCount})
              </button>
            )}
            {approvedCount > 0 && (
              <button
                onClick={sendAllApproved}
                disabled={ircStatus !== 'connected' || !channel}
                className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded disabled:opacity-50"
              >
                Send All ({approvedCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-2 mt-2 px-2 py-1.5 text-xs text-red-300 bg-red-900/50 border border-red-700/50 rounded">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">dismiss</button>
        </div>
      )}

      {/* AudioSettings — always mounted to preserve useEffect hooks, hidden when not active */}
      <div className={showSettings ? '' : 'hidden'}>
        <AudioSettings />
      </div>

      {/* Unified feed */}
      {!showSettings && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
          {feed.length === 0 && (
            <div className="text-gray-500 text-sm italic">
              {apiKeySet
                ? 'Transcription and scribe messages will appear here'
                : 'Set your Claude API key in Settings to enable the AI scribe'}
            </div>
          )}

          {feed.map((item) => {
            if (item.kind === 'transcription') {
              const t = item.data
              const allAssigned = t.segments.length > 0 && t.segments.every((s) => s.speaker !== null)
              const isProcessing = processingId === t.id
              return (
                <div key={t.id} className="bg-gray-800 rounded p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {new Date(t.timestamp).toLocaleTimeString()} — {t.duration}s
                    </span>
                    {apiKeySet && (
                      <button
                        onClick={() => processSpeakers(t.id)}
                        disabled={!allAssigned || isProcessing}
                        className="px-2 py-0.5 text-xs bg-purple-700 hover:bg-purple-600 rounded disabled:opacity-50"
                        title={allAssigned ? 'Process with speaker attribution' : 'Assign all speakers first'}
                      >
                        {isProcessing ? 'Processing...' : 'Process'}
                      </button>
                    )}
                  </div>

                  {t.segments.map((seg) => (
                    <div key={seg.id} className="flex items-start gap-1.5">
                      <SpeakerSelect
                        value={seg.speaker}
                        onChange={(speaker) => assignSpeaker(t.id, seg.id, speaker)}
                      />
                      <span className="text-xs text-gray-300 flex-1 leading-relaxed">
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
        <div className="px-2 py-2 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-1.5">Speaker Queue</div>
          <div className="space-y-1">
            {queue.map((entry) => (
              <div key={entry.nick} className="flex items-center justify-between text-sm bg-gray-800 rounded px-2 py-1">
                <span className="text-gray-200">
                  {entry.nick}
                  {entry.comment && (
                    <span className="text-gray-500 ml-1.5">— {entry.comment}</span>
                  )}
                </span>
                <button
                  onClick={() => removeFromQueue(entry.nick)}
                  className="text-xs text-gray-500 hover:text-gray-300 ml-2"
                  title="Remove from queue"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

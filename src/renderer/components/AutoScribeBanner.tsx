import { useState, useEffect } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useScribeStore } from '../stores/scribeStore'

export default function AutoScribeBanner() {
  const { status: audioStatus, transcribing, bufferDuration, lastFlushTime, lastRms } = useAudioStore()
  const { processing } = useScribeStore()
  const [countdown, setCountdown] = useState(bufferDuration)

  // Countdown timer while capturing — driven by lastFlushTime from the store
  useEffect(() => {
    if (audioStatus !== 'capturing') return

    const compute = () => {
      const base = lastFlushTime || Date.now()
      const elapsed = Math.floor((Date.now() - base) / 1000)
      setCountdown(Math.max(0, bufferDuration - elapsed))
    }
    compute()

    const interval = setInterval(compute, 1000)
    return () => clearInterval(interval)
  }, [audioStatus, bufferDuration, lastFlushTime])

  let statusText: string
  let dotColor: string
  let containerCls: string

  if (transcribing) {
    statusText = 'Transcribing audio…'
    dotColor = 'bg-purple-500'
    containerCls = 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-300'
  } else if (processing) {
    statusText = 'Formatting with Claude…'
    dotColor = 'bg-blue-500'
    containerCls = 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300'
  } else if (audioStatus === 'capturing') {
    if (lastRms === 0) {
      statusText = `Silence — play audio to transcribe (${countdown}s)`
      dotColor = 'bg-slate-400 dark:bg-gray-500'
      containerCls = 'bg-slate-100 dark:bg-gray-800/60 border-slate-300 dark:border-gray-600/50 text-slate-500 dark:text-gray-400'
    } else {
      statusText = `Listening… (next flush in ${countdown}s)`
      dotColor = 'bg-amber-500'
      containerCls = 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300'
    }
  } else {
    statusText = 'Waiting for audio capture…'
    dotColor = 'bg-slate-400 dark:bg-gray-500'
    containerCls = 'bg-slate-100 dark:bg-gray-800/60 border-slate-300 dark:border-gray-600/50 text-slate-500 dark:text-gray-400'
  }

  return (
    <div
      className={`text-xs px-2 py-1.5 border rounded flex items-center gap-2 ${containerCls}`}
      role="status"
      aria-live="polite"
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} animate-pulse`} />
      {statusText}
    </div>
  )
}

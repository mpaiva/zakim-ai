import { useState, useEffect } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useScribeStore } from '../stores/scribeStore'

export default function AutoScribeBanner() {
  const { status: audioStatus, transcribing, bufferDuration, lastFlushTime } = useAudioStore()
  const { processing } = useScribeStore()
  const [countdown, setCountdown] = useState(bufferDuration)

  // Countdown timer while capturing — driven by lastFlushTime from the store
  useEffect(() => {
    if (audioStatus !== 'capturing') return

    // Immediately compute the current countdown
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

  if (transcribing) {
    statusText = 'Transcribing audio...'
    dotColor = 'bg-purple-400'
  } else if (processing) {
    statusText = 'Formatting with Claude...'
    dotColor = 'bg-blue-400'
  } else if (audioStatus === 'capturing') {
    statusText = `Listening... (next flush in ${countdown}s)`
    dotColor = 'bg-orange-400'
  } else {
    statusText = 'Waiting for audio capture...'
    dotColor = 'bg-gray-400'
  }

  return (
    <div className="text-xs px-2 py-1.5 bg-orange-900/50 border border-orange-700/50 rounded text-orange-200 flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
      {statusText}
    </div>
  )
}

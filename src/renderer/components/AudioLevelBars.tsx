import { useAudioStore } from '../stores/audioStore'

const DELAYS = ['0ms', '120ms', '60ms', '180ms', '30ms']

export default function AudioLevelBars() {
  const status = useAudioStore((s) => s.status)
  const transcribing = useAudioStore((s) => s.transcribing)
  const lastRms = useAudioStore((s) => s.lastRms)

  if (status !== 'capturing') return null

  const hasSignal = lastRms > 0
  // Green while listening, purple while transcribing
  const color = transcribing ? '#a855f7' : '#22c55e'
  // Scale: map RMS 0→0.1 to amplitude multiplier 0.3→1.0
  const scale = hasSignal ? Math.min(1, 0.3 + lastRms * 7) : 0.6

  const barH = Math.round(20 * scale)

  return (
    <>
      <style>{`
        @keyframes audio-bar {
          0%, 100% { transform: scaleY(0.15); }
          50%       { transform: scaleY(1); }
        }
      `}</style>
      <div
        className="flex items-center justify-center gap-px w-full py-1"
        title={hasSignal ? `RMS ${lastRms.toFixed(4)}` : 'Listening…'}
        role="img"
        aria-label={transcribing ? 'Transcribing audio' : hasSignal ? 'Audio signal detected' : 'Listening for audio'}
      >
        {DELAYS.map((delay, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: barH,
              backgroundColor: color,
              borderRadius: 2,
              transformOrigin: 'center',
              animation: `audio-bar ${0.9 + i * 0.1}s ease-in-out ${delay} infinite`,
              opacity: hasSignal ? 1 : 0.35,
            }}
          />
        ))}
      </div>
    </>
  )
}

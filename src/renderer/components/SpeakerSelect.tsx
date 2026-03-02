import { useState } from 'react'
import { useIrcStore } from '../stores/ircStore'
import { useAudioStore } from '../stores/audioStore'

interface SpeakerSelectProps {
  value: string | null
  onChange: (speaker: string) => void
  className?: string
}

const baseCls = 'px-1 py-0.5 text-xs font-mono bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-slate-800 dark:text-gray-200 transition-colors'

export default function SpeakerSelect({ value, onChange, className = 'w-24' }: SpeakerSelectProps) {
  const users = useIrcStore((s) => s.users)
  const customSpeakers = useAudioStore((s) => s.customSpeakers)
  const addCustomSpeaker = useAudioStore((s) => s.addCustomSpeaker)
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')

  if (customMode) {
    return (
      <input
        type="text"
        value={customName}
        onChange={(e) => setCustomName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && customName.trim()) {
            addCustomSpeaker(customName.trim())
            onChange(customName.trim())
            setCustomMode(false)
            setCustomName('')
          }
          if (e.key === 'Escape') {
            setCustomMode(false)
            setCustomName('')
          }
        }}
        onBlur={() => {
          if (customName.trim()) {
            addCustomSpeaker(customName.trim())
            onChange(customName.trim())
          }
          setCustomMode(false)
          setCustomName('')
        }}
        autoFocus
        placeholder="Name…"
        aria-label="Custom speaker name"
        className={`${baseCls} ${className} border-amber-400`}
      />
    )
  }

  const ircNicks = new Set(users.map((u) => u.nick))
  const savedSpeakers = customSpeakers.filter((n) => !ircNicks.has(n))
  const isCustomValue = value && !ircNicks.has(value) && !customSpeakers.includes(value)

  return (
    <select
      value={value || ''}
      onChange={(e) => {
        if (e.target.value === '__other__') {
          setCustomMode(true)
        } else if (e.target.value) {
          onChange(e.target.value)
        }
      }}
      aria-label="Select speaker"
      className={`${baseCls} ${className}`}
    >
      <option value="">Speaker…</option>
      {isCustomValue && (
        <option value={value}>{value}</option>
      )}
      {users.map((u) => (
        <option key={u.nick} value={u.nick}>
          {u.nick}
        </option>
      ))}
      {savedSpeakers.length > 0 && (
        <>
          {users.length > 0 && <option disabled>──</option>}
          {savedSpeakers.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </>
      )}
      <option value="__other__">Other…</option>
    </select>
  )
}

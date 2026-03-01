import { useState } from 'react'
import { useIrcStore } from '../stores/ircStore'

interface SpeakerSelectProps {
  value: string | null
  onChange: (speaker: string) => void
  className?: string
}

const baseCls = 'px-1 py-0.5 text-xs font-mono bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-slate-800 dark:text-gray-200 transition-colors'

export default function SpeakerSelect({ value, onChange, className = 'w-24' }: SpeakerSelectProps) {
  const users = useIrcStore((s) => s.users)
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

  const isCustomValue = value && !users.some((u) => u.nick === value)

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
      <option value="__other__">Other…</option>
    </select>
  )
}

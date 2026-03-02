import { useRef, useState } from 'react'
import { useIrcStore } from '../stores/ircStore'

const btnCls =
  'px-2 py-0.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-200 rounded disabled:opacity-40 transition-colors whitespace-nowrap shrink-0'

const labelCls =
  'text-[10px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wide shrink-0 select-none'

const dividerCls = 'w-px self-stretch bg-slate-200 dark:bg-gray-700 shrink-0 mx-0.5'

// Simple button — sends a fixed command
function Cmd({ label, cmd, title }: { label: string; cmd: string; title?: string }) {
  const { channel, status } = useIrcStore()
  const disabled = status !== 'connected' || !channel
  return (
    <button
      onClick={() => !disabled && window.api.irc.send(channel!, cmd)}
      disabled={disabled}
      title={title ?? cmd}
      aria-label={title ?? label}
      className={btnCls}
    >
      {label}
    </button>
  )
}

// Button that shows an inline input for parameterized commands
function CmdInput({
  label,
  prefix,
  placeholder,
  title,
}: {
  label: string
  prefix: string
  placeholder: string
  title?: string
}) {
  const { channel, status } = useIrcStore()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const disabled = status !== 'connected' || !channel

  function send() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    window.api.irc.send(channel!, `${prefix}${trimmed}`)
    setValue('')
    setOpen(false)
  }

  function toggle() {
    if (disabled) return
    setOpen((v) => {
      if (!v) setTimeout(() => inputRef.current?.focus(), 0)
      return !v
    })
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={toggle}
        disabled={disabled}
        title={title ?? prefix}
        aria-label={title ?? label}
        aria-expanded={open}
        className={btnCls}
      >
        {label}
      </button>
      {open && (
        <>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
              if (e.key === 'Escape') { setOpen(false); setValue('') }
            }}
            placeholder={placeholder}
            className="[field-sizing:content] min-w-20 px-2 py-0.5 text-xs bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            onClick={send}
            disabled={!value.trim()}
            className="px-2 py-0.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-gray-900 rounded disabled:opacity-40 transition-colors shrink-0"
          >
            Send
          </button>
        </>
      )}
    </div>
  )
}

export default function MeetingActions() {
  return (
    <div
      role="toolbar"
      aria-label="Meeting actions"
      className="flex items-center gap-1.5 px-3 py-1.5 border-t border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-x-auto"
    >
      {/* Meeting */}
      <span className={labelCls}>Meeting</span>
      <Cmd label="start" cmd="Zakim, start meeting" title="Start the meeting" />
      <Cmd label="end" cmd="Zakim, end meeting" title="End the meeting" />

      <div className={dividerCls} />

      {/* Attendance */}
      <span className={labelCls}>Attendance</span>
      <Cmd label="present+" cmd="present+" title="Mark yourself present" />
      <Cmd label="present-" cmd="present-" title="Mark yourself as departed" />
      <Cmd label="who's here?" cmd="Zakim, who's here?" title="List current attendees" />

      <div className={dividerCls} />

      {/* Queue */}
      <span className={labelCls}>Queue</span>
      <Cmd label="q+" cmd="q+" title="Add yourself to speaker queue" />
      <Cmd label="q-" cmd="q-" title="Remove yourself from speaker queue" />
      <Cmd label="q?" cmd="q?" title="Show speaker queue" />
      <CmdInput label="ack…" prefix="ack " placeholder="nick" title="Acknowledge a speaker by nick" />
      <Cmd label="ack next" cmd="ack next" title="Acknowledge next speaker in queue" />
      <Cmd label="close q" cmd="Zakim, close the queue" title="Prevent new additions to speaker queue" />
      <Cmd label="open q" cmd="Zakim, open the queue" title="Allow additions to speaker queue" />

      <div className={dividerCls} />

      {/* Agenda */}
      <span className={labelCls}>Agenda</span>
      <Cmd label="agenda?" cmd="agenda?" title="Show the agenda" />
      <CmdInput label="agenda+" prefix="agenda+ " placeholder="agenda item text" title="Add an agenda item" />
      <Cmd label="next agendum" cmd="next agendum" title="Move to next agenda item" />
      <Cmd label="close agendum" cmd="Zakim, close this agendum" title="Close the current agenda item" />
      <Cmd label="clear agenda" cmd="Zakim, clear the agenda" title="Remove all agenda items" />

      <div className={dividerCls} />

      {/* Scribe */}
      <span className={labelCls}>Scribe</span>
      <Cmd label="pick scribe" cmd="Zakim, pick a scribe" title="Randomly select a scribe from attendees" />
      <CmdInput label="scribenick" prefix="scribenick: " placeholder="nick" title="Set the scribe's IRC nick for RRSAgent" />

      <div className={dividerCls} />

      {/* Minutes */}
      <span className={labelCls}>Minutes</span>
      <Cmd label="generate" cmd="rrsagent, generate minutes" title="Ask RRSAgent to generate meeting minutes" />
      <Cmd label="logs public" cmd="rrsagent, make logs public" title="Make meeting logs publicly accessible" />
      <Cmd label="logs member" cmd="rrsagent, make logs member" title="Make meeting logs member-only" />
    </div>
  )
}

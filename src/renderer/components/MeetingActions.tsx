import { useIrcStore } from '../stores/ircStore'

function MeetingButton({ label, cmd, title }: { label: string; cmd: string; title?: string }) {
  const { channel, status } = useIrcStore()

  async function handleClick() {
    if (status !== 'connected' || !channel) return
    await window.api.irc.send(channel, cmd)
  }

  return (
    <button
      onClick={handleClick}
      disabled={status !== 'connected' || !channel}
      title={title || cmd}
      aria-label={title || label}
      className="px-2 py-1 text-xs font-medium bg-slate-200 hover:bg-slate-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-200 rounded disabled:opacity-40 transition-colors"
    >
      {label}
    </button>
  )
}

export default function MeetingActions() {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 border-t border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      aria-label="Meeting actions"
    >
      <span className="text-xs text-slate-600 dark:text-gray-400 font-medium uppercase tracking-wide mr-1">Meeting</span>
      <MeetingButton label="present+" cmd="present+" title="Mark yourself present" />
      <MeetingButton label="q+" cmd="q+" title="Add yourself to the speaker queue" />
      <MeetingButton label="q-" cmd="q-" title="Remove yourself from the speaker queue" />
      <MeetingButton label="ack" cmd="ack" title="Acknowledge the current speaker" />
      <MeetingButton label="Generate Minutes" cmd="rrsagent, generate minutes" title="Ask RRSAgent to generate meeting minutes" />
    </div>
  )
}

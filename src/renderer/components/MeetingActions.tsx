import { useIrcStore } from '../stores/ircStore'

function MeetingButton({ label, cmd }: { label: string; cmd: string }) {
  const { channel, status } = useIrcStore()

  async function handleClick() {
    if (status !== 'connected' || !channel) return
    await window.api.irc.send(channel, cmd)
  }

  return (
    <button
      onClick={handleClick}
      disabled={status !== 'connected' || !channel}
      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
    >
      {label}
    </button>
  )
}

export default function MeetingActions() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-700 bg-gray-800">
      <span className="text-xs text-gray-500">Meeting:</span>
      <MeetingButton label="present+" cmd="present+" />
      <MeetingButton label="q+" cmd="q+" />
      <MeetingButton label="q-" cmd="q-" />
      <MeetingButton label="ack" cmd="ack" />
      <MeetingButton label="Generate Minutes" cmd="rrsagent, generate minutes" />
    </div>
  )
}

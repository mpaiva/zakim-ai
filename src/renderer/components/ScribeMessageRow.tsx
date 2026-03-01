import { useState } from 'react'
import type { ScribeMessage } from '../../shared/types'

export default function ScribeMessageRow({
  msg,
  onApprove,
  onDiscard,
  onEdit,
  onSend,
  autoMode,
}: {
  msg: ScribeMessage
  onApprove: () => void
  onDiscard: () => void
  onEdit: (text: string) => void
  onSend: () => void
  autoMode: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(msg.editedText || msg.text)

  const typeAccent = {
    statement: 'border-l-blue-500',
    topic: 'border-l-amber-500',
    action: 'border-l-orange-500',
    resolution: 'border-l-green-500',
    raw: 'border-l-slate-400 dark:border-l-gray-500',
  }[msg.type]

  const statusBadge = {
    pending: 'bg-amber-100 dark:bg-yellow-900/60 text-amber-700 dark:text-yellow-300',
    approved: 'bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300',
    sent: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
    discarded: 'bg-slate-100 dark:bg-gray-700/60 text-slate-400 dark:text-gray-500 line-through',
  }[msg.status]

  const btnBase = 'px-2 py-0.5 text-xs rounded font-medium transition-colors'

  return (
    <div
      className={`border-l-2 ${typeAccent} bg-slate-50 dark:bg-gray-800 rounded-r p-2 ${msg.status === 'discarded' ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onEdit(editText)
                    setEditing(false)
                  }
                  if (e.key === 'Escape') setEditing(false)
                }}
                autoFocus
                aria-label="Edit message text"
                className="flex-1 px-2 py-0.5 text-sm bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 rounded text-slate-900 dark:text-gray-100"
              />
              <button
                onClick={() => { onEdit(editText); setEditing(false) }}
                aria-label="Save edit"
                className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}
              >
                Save
              </button>
            </div>
          ) : (
            <div
              className="text-sm text-slate-800 dark:text-gray-200 cursor-default"
              onDoubleClick={() => msg.status === 'pending' && setEditing(true)}
              title={msg.status === 'pending' ? 'Double-click to edit' : undefined}
            >
              {msg.editedText || msg.text}
            </div>
          )}
        </div>

        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusBadge} whitespace-nowrap`}>
          {msg.status}
        </span>

        {!autoMode && msg.status === 'pending' && (
          <div className="flex gap-1">
            <button
              onClick={onApprove}
              aria-label="Approve message"
              className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}
            >
              OK
            </button>
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit message"
              className={`${btnBase} bg-slate-200 hover:bg-slate-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-slate-700 dark:text-gray-200`}
            >
              Edit
            </button>
            <button
              onClick={onDiscard}
              aria-label="Discard message"
              className={`${btnBase} bg-red-600 hover:bg-red-700 text-white`}
            >
              ✕
            </button>
          </div>
        )}

        {!autoMode && msg.status === 'approved' && (
          <button
            onClick={onSend}
            aria-label="Send to IRC"
            className={`${btnBase} bg-blue-600 hover:bg-blue-700 text-white`}
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

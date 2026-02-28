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

  const typeColor = {
    statement: 'border-l-blue-500',
    topic: 'border-l-yellow-500',
    action: 'border-l-orange-500',
    resolution: 'border-l-green-500',
    raw: 'border-l-gray-500',
  }[msg.type]

  const statusBadge = {
    pending: 'bg-yellow-800 text-yellow-200',
    approved: 'bg-green-800 text-green-200',
    sent: 'bg-blue-800 text-blue-200',
    discarded: 'bg-gray-700 text-gray-400 line-through',
  }[msg.status]

  return (
    <div className={`border-l-2 ${typeColor} bg-gray-800 rounded-r p-2 ${msg.status === 'discarded' ? 'opacity-50' : ''}`}>
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
                className="flex-1 px-2 py-0.5 text-sm bg-gray-900 border border-gray-600 rounded"
              />
              <button
                onClick={() => { onEdit(editText); setEditing(false) }}
                className="px-2 py-0.5 text-xs bg-green-700 rounded"
              >
                Save
              </button>
            </div>
          ) : (
            <div
              className="text-sm text-gray-200 cursor-pointer"
              onDoubleClick={() => msg.status === 'pending' && setEditing(true)}
            >
              {msg.editedText || msg.text}
            </div>
          )}
        </div>

        <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadge} whitespace-nowrap`}>
          {msg.status}
        </span>

        {!autoMode && msg.status === 'pending' && (
          <div className="flex gap-1">
            <button
              onClick={onApprove}
              className="px-2 py-0.5 text-xs bg-green-700 hover:bg-green-600 rounded"
              title="Approve"
            >
              OK
            </button>
            <button
              onClick={() => setEditing(true)}
              className="px-2 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 rounded"
              title="Edit"
            >
              Edit
            </button>
            <button
              onClick={onDiscard}
              className="px-2 py-0.5 text-xs bg-red-800 hover:bg-red-700 rounded"
              title="Discard"
            >
              X
            </button>
          </div>
        )}

        {!autoMode && msg.status === 'approved' && (
          <button
            onClick={onSend}
            className="px-2 py-0.5 text-xs bg-blue-700 hover:bg-blue-600 rounded"
            title="Send to IRC"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

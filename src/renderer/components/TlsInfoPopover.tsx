import { useRef, useState } from 'react'

export default function TlsInfoPopover() {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="What is TLS?"
        className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors leading-none"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-56 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl z-10 pointer-events-none">
          <p className="font-semibold mb-1">Transport Layer Security</p>
          <p className="text-gray-300 leading-relaxed">
            Encrypts the connection to the IRC server so messages aren't sent in plaintext. Uses port{' '}
            <span className="font-mono text-amber-400">6697</span> instead of{' '}
            <span className="font-mono text-amber-400">6667</span>.
          </p>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900 dark:border-t-gray-800" />
        </div>
      )}
    </div>
  )
}

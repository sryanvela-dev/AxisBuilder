// A simple question box (Save changes? Replace the file?). One at a time; Esc picks the cancel button.

import { useEffect, useRef, type ReactNode } from 'react'

export interface DialogButton<T extends string = string> {
  id: T
  label: string
  primary?: boolean
}

export interface DialogRequest<T extends string = string> {
  title: string
  message: ReactNode
  buttons: DialogButton<T>[]
  /** Button chosen by Esc. */
  cancelId: T
}

export function DialogView({ request, onAnswer }: { request: DialogRequest; onAnswer: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLButtonElement>('button.btn-primary, button')?.focus()
    return () => previous?.focus?.()
  }, [request])
  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onAnswer(request.cancelId)
        }
        if (e.key === 'Tab') {
          // Keep focus inside the box.
          const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
          const next = e.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i + 1) % buttons.length
          buttons[next]?.focus()
          e.preventDefault()
        }
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={box}>
        <h2 id="dialog-title">{request.title}</h2>
        <div className="dialog-message">{request.message}</div>
        <div className="button-row dialog-buttons">
          {request.buttons.map((b) => (
            <button key={b.id} type="button" className={b.primary ? 'btn btn-primary' : 'btn'} onClick={() => onAnswer(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

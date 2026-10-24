import type { ReactNode } from 'react'

type StatusMessageProps = {
  title: string
  description: string
  action?: ReactNode
}

// Shared layout for the empty, no-results and error states.
export function StatusMessage({ title, description, action }: StatusMessageProps) {
  return (
    <div className="status-message">
      <span className="status-mark" aria-hidden="true">
        &gt;_
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

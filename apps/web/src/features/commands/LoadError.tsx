import { StatusMessage } from '../../components/ui/StatusMessage'

type LoadErrorProps = {
  error: Error
  retrying: boolean
  onRetry: () => void
}

export function LoadError({ error, retrying, onRetry }: LoadErrorProps) {
  return (
    <StatusMessage
      title="Couldn't load your commands"
      description={`Make sure the Dev Library API is running on port 3000. (${error.message})`}
      action={
        <button type="button" className="button button-secondary" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      }
    />
  )
}

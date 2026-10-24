import { StatusMessage } from '../../components/ui/StatusMessage'

type NoMatchesProps = {
  search: string
  onClear: () => void
}

export function NoMatches({ search, onClear }: NoMatchesProps) {
  const query = search.trim()

  return (
    <StatusMessage
      title="No matching commands"
      description={query ? `Nothing matches "${query}".` : 'No commands have this tag yet.'}
      action={
        <button type="button" className="button button-secondary" onClick={onClear}>
          Clear filters
        </button>
      }
    />
  )
}

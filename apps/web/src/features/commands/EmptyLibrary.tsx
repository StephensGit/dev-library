import { PlusIcon } from '../../components/ui/Icons'
import { StatusMessage } from '../../components/ui/StatusMessage'

type EmptyLibraryProps = {
  onAdd: () => void
}

export function EmptyLibrary({ onAdd }: EmptyLibraryProps) {
  return (
    <StatusMessage
      title="Your library is empty"
      description="Save a command you don't want to look up again."
      action={
        <button type="button" className="button button-primary" onClick={onAdd}>
          <PlusIcon size={15} />
          Add your first command
        </button>
      }
    />
  )
}

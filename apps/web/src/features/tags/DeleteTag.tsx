import type { Command, Tag } from '../../api/api';
import { useDeleteTag } from '../../api/mutations/tags';
import { Dialog } from '../../components/ui/Dialog';

type DeleteTagProps = {
  tag: Tag;
  // Undefined while commands are loading or failed, so no count is guessed.
  commands?: Command[];
  onClose: () => void;
  onDeleted: (tag: Tag) => void;
};

function usage(count: number | undefined) {
  if (count === undefined) {
    return 'It will be removed from any commands that use it.';
  }
  if (count === 0) {
    return 'No commands use it.';
  }
  return `It will be removed from ${count} ${count === 1 ? 'command' : 'commands'}.`;
}

export function DeleteTag({ tag, commands, onClose, onDeleted }: DeleteTagProps) {
  const deleteTag = useDeleteTag();
  const count = commands?.filter((command) => command.tags.some((commandTag) => commandTag.id === tag.id)).length;

  return (
    <Dialog onClose={onClose} labelledBy="delete-tag-title" className="confirm-dialog">
      <div className="confirm-body">
        <h2 id="delete-tag-title">Delete tag?</h2>
        <p>
          <strong>{tag.name}</strong> will be deleted. {usage(count)}
          {count !== 0 && ' The commands themselves are kept.'} This can't be undone.
        </p>
        {deleteTag.isError && (
          <p className="field-error" role="alert">
            {deleteTag.error.message}
          </p>
        )}
      </div>

      <div className="dialog-footer">
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={deleteTag.isPending}
            onClick={() => deleteTag.mutate(tag.id, { onSuccess: () => onDeleted(tag) })}
          >
            {deleteTag.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

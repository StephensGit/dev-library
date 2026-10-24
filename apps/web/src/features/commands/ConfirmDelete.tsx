import type { Command } from '../../api/api';
import { useDeleteCommand } from '../../api/mutations/commands';
import { Dialog } from '../../components/ui/Dialog';

type ConfirmDeleteProps = {
  command: Command;
  onClose: () => void;
};

export function ConfirmDelete({ command, onClose }: ConfirmDeleteProps) {
  const deleteCommand = useDeleteCommand();

  return (
    <Dialog onClose={onClose} labelledBy="confirm-delete-title" className="confirm-dialog">
      <div className="confirm-body">
        <h2 id="confirm-delete-title">Delete command?</h2>
        <p>
          <strong>{command.title}</strong> will be removed from your library. This can't be undone.
        </p>
        {deleteCommand.isError && <p className="field-error">{deleteCommand.error.message}</p>}
      </div>

      <div className="dialog-footer">
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={deleteCommand.isPending}
            onClick={() => deleteCommand.mutate(command.id, { onSuccess: onClose })}
          >
            {deleteCommand.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

import { useState, type FormEvent } from 'react';
import type { Tag } from '../../api/api';
import { useRenameTag } from '../../api/mutations/tags';
import { Dialog } from '../../components/ui/Dialog';

// Matches the API's limit on tag names.
const MAX_LENGTH = 50;

type RenameTagProps = {
  tag: Tag;
  onClose: () => void;
  onRenamed: (tag: Tag) => void;
};

export function RenameTag({ tag, onClose, onRenamed }: RenameTagProps) {
  const renameTag = useRenameTag();
  const [name, setName] = useState(tag.name);
  const trimmed = name.trim();
  const tooLong = trimmed.length > MAX_LENGTH;
  // Changing only the capitalisation counts as a change.
  const canSave = trimmed !== '' && !tooLong && trimmed !== tag.name && !renameTag.isPending;

  function save(event: FormEvent) {
    event.preventDefault();

    if (canSave) {
      renameTag.mutate({ id: tag.id, name: trimmed }, { onSuccess: onRenamed });
    }
  }

  return (
    <Dialog onClose={onClose} labelledBy="rename-tag-title" className="confirm-dialog">
      <form onSubmit={save}>
        <div className="dialog-header">
          <h2 id="rename-tag-title">Rename tag</h2>
          <button type="button" className="kbd kbd-button" onClick={onClose} aria-label="Close">
            esc
          </button>
        </div>

        <div className="dialog-body">
          <div className="field">
            <label className="field-label" htmlFor="tag-name-input">
              Name
            </label>
            <input
              id="tag-name-input"
              className="input"
              data-invalid={tooLong || renameTag.isError}
              aria-invalid={tooLong || renameTag.isError}
              aria-describedby={tooLong || renameTag.isError ? 'tag-name-error' : undefined}
              autoComplete="off"
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                renameTag.reset();
              }}
            />
            {(tooLong || renameTag.isError) && (
              <p id="tag-name-error" className="field-error" role="alert">
                {tooLong ? `Use ${MAX_LENGTH} characters or fewer` : renameTag.error?.message}
              </p>
            )}
          </div>
        </div>

        <div className="dialog-footer">
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={!canSave}>
              {renameTag.isPending ? 'Saving…' : 'Rename'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

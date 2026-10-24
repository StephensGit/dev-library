import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { Command } from '../../api/api';
import { commandSchema, type CommandFormValues } from './commandSchema';
import { useCreateCommand, useUpdateCommand } from '../../api/mutations/commands';
import { useTags } from '../../api/queries/command-tag';
import { Dialog } from '../../components/ui/Dialog';
import { TagPicker } from '../tags/TagPicker';

type CommandModalProps = {
  // Passing a command switches the modal into edit mode.
  command?: Command;
  onClose: () => void;
};

export function CommandModal({ command, onClose }: CommandModalProps) {
  const isEditing = command !== undefined;
  const { data: tags = [] } = useTags();
  const createCommand = useCreateCommand();
  const updateCommand = useUpdateCommand();
  const mutation = isEditing ? updateCommand : createCommand;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CommandFormValues>({
    resolver: zodResolver(commandSchema),
    mode: 'onTouched',
    defaultValues: {
      command: command?.command ?? '',
      title: command?.title ?? '',
      description: command?.description ?? '',
      tagIds: command?.tags.map((tag) => tag.id) ?? [],
    },
  });

  const save = handleSubmit((values) => {
    if (isEditing) {
      updateCommand.mutate({ id: command.id, payload: values }, { onSuccess: onClose });
    } else {
      createCommand.mutate(values, { onSuccess: onClose });
    }
  });

  return (
    <Dialog onClose={onClose} labelledBy="command-modal-title" className="command-modal">
      <form
        onSubmit={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save();
          }
        }}
      >
        <div className="dialog-header">
          <h2 id="command-modal-title">{isEditing ? 'Edit command' : 'New command'}</h2>
          <button type="button" className="kbd kbd-button" onClick={onClose} aria-label="Close">
            esc
          </button>
        </div>

        <div className="dialog-body">
          <div className="field">
            <label className="field-label" htmlFor="command-input">
              Command
            </label>
            <div className="terminal-input" data-invalid={Boolean(errors.command)}>
              <span className="prompt" aria-hidden="true">
                $
              </span>
              <textarea
                id="command-input"
                rows={2}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoFocus
                placeholder="docker compose logs -f api"
                {...register('command')}
              />
            </div>
            {errors.command && <p className="field-error">{errors.command.message}</p>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="title-input">
              Title
            </label>
            <input
              id="title-input"
              className="input"
              data-invalid={Boolean(errors.title)}
              placeholder="Tail API logs"
              {...register('title')}
            />
            {errors.title && <p className="field-error">{errors.title.message}</p>}
          </div>

          <div className="field">
            <div className="field-label-row">
              <label className="field-label" htmlFor="description-input">
                Description
              </label>
              <span className="field-hint">Optional</span>
            </div>
            <textarea
              id="description-input"
              className="input"
              rows={2}
              placeholder="When and why you'd reach for this"
              {...register('description')}
            />
          </div>

          <div className="field">
            <div className="field-label-row">
              <span className="field-label">Tags</span>
              <span className="field-hint">Optional · select any</span>
            </div>
            <Controller
              control={control}
              name="tagIds"
              render={({ field }) => <TagPicker tags={tags} selectedIds={field.value} onChange={field.onChange} />}
            />
          </div>
        </div>

        <div className="dialog-footer">
          {mutation.isError ? (
            <p className="field-error footer-error">{mutation.error.message}</p>
          ) : (
            <span className="shortcut-hint">
              <kbd className="kbd">⌘↵</kbd> to save
            </span>
          )}

          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={!isValid || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Save command'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

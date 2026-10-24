import type { RefObject } from 'react';
import type { Command, Tag } from '../../api/api';
import { TagBadge } from '../tags/TagBadge';
import { CommandRow } from './CommandRow';

type CommandListProps = {
  commands: Command[];
  total: number;
  filterTags: Tag[];
  selectedId: number | null;
  // Attached to the selected row's copy button so Enter can trigger it.
  selectedCopyRef: RefObject<HTMLButtonElement | null>;
  onRemoveTag: (tagId: number) => void;
  onEdit: (command: Command) => void;
  onDelete: (command: Command) => void;
};

function countLabel(shown: number, total: number, hasTagFilter: boolean) {
  // With tag filters the chips that follow say what's being counted.
  if (hasTagFilter) {
    return `${shown} of ${total}`;
  }

  const noun = total === 1 ? 'command' : 'commands';
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
}

export function CommandList({
  commands,
  total,
  filterTags,
  selectedId,
  selectedCopyRef,
  onRemoveTag,
  onEdit,
  onDelete,
}: CommandListProps) {
  return (
    <>
      <div className="list-header">
        <p className="list-count">{countLabel(commands.length, total, filterTags.length > 0)}</p>
        {filterTags.map((tag) => (
          <TagBadge key={tag.id} name={tag.name} onRemove={() => onRemoveTag(tag.id)} />
        ))}
        <p className="list-hints" aria-hidden="true">
          <kbd className="kbd">↑↓</kbd> select <kbd className="kbd">↵</kbd> copy
        </p>
      </div>
      <ul className="command-list">
        {commands.map((command) => (
          <CommandRow
            key={command.id}
            command={command}
            selected={command.id === selectedId}
            copyRef={command.id === selectedId ? selectedCopyRef : undefined}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </>
  );
}

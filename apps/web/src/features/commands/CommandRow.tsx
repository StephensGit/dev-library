import { useEffect, useRef, type RefObject } from 'react';
import type { Command } from '../../api/api';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { CopyButton } from '../../components/ui/CopyButton';
import { TagBadge } from '../tags/TagBadge';

type CommandRowProps = {
  command: Command;
  selected: boolean;
  copyRef?: RefObject<HTMLButtonElement | null>;
  onEdit: (command: Command) => void;
  onDelete: (command: Command) => void;
};

export function CommandRow({ command, selected, copyRef, onEdit, onDelete }: CommandRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);

  // Keep the keyboard-selected row on screen.
  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  return (
    <li ref={rowRef} className="command-row" aria-current={selected || undefined}>
      <div className="command-info">
        <div className="command-title-row">
          <h2 className="command-title">{command.title}</h2>
          <ActionMenu label={command.title} onEdit={() => onEdit(command)} onDelete={() => onDelete(command)} />
        </div>

        {command.description && <p className="command-description">{command.description}</p>}

        {command.tags.length > 0 && (
          <div className="tag-list">
            {command.tags.map((tag) => (
              <TagBadge key={tag.id} name={tag.name} />
            ))}
          </div>
        )}
      </div>

      <div className="terminal">
        <code className="terminal-text">
          <span className="prompt" aria-hidden="true">
            $
          </span>
          {command.command}
        </code>
        <CopyButton ref={copyRef} text={command.command} />
      </div>
    </li>
  );
}

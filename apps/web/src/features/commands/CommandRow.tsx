import type { Command } from '../../api/api';
import { ActionMenu } from './ActionMenu';
import { CopyButton } from '../../components/ui/CopyButton';
import { TagBadge } from '../tags/TagBadge';

type CommandRowProps = {
  command: Command;
  onEdit: (command: Command) => void;
  onDelete: (command: Command) => void;
};

export function CommandRow({ command, onEdit, onDelete }: CommandRowProps) {
  return (
    <li className="command-row">
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
        <CopyButton text={command.command} />
      </div>
    </li>
  );
}

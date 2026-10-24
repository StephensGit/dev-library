import type { Command } from '../../api/api';
import { CommandRow } from './CommandRow';

type CommandListProps = {
  commands: Command[];
  total: number;
  onEdit: (command: Command) => void;
  onDelete: (command: Command) => void;
};

export function CommandList({ commands, total, onEdit, onDelete }: CommandListProps) {
  const noun = total === 1 ? 'command' : 'commands';

  return (
    <>
      <p className="list-count">
        {commands.length === total ? `${total} ${noun}` : `${commands.length} of ${total} ${noun}`}
      </p>
      <ul className="command-list">
        {commands.map((command) => (
          <CommandRow key={command.id} command={command} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    </>
  );
}

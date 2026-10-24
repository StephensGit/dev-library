import { useEffect, useRef, useState } from 'react';
import type { Command } from './api/api';
import { CommandList } from './features/commands/CommandList';
import { CommandModal } from './features/commands/CommandModal';
import { ConfirmDelete } from './features/commands/ConfirmDelete';
import { Header } from './components/layout/Header';
import { EmptyLibrary } from './features/commands/EmptyLibrary';
import { LoadError } from './features/commands/LoadError';
import { LoadingRows } from './features/commands/LoadingRows';
import { NoMatches } from './features/commands/NoMatches';
import { Sidebar } from './components/layout/Sidebar';
import { useCommands, useTags } from './api/queries/command-tag';
import './App.css';

// null = closed, 'new' = add, an id = edit that command.
type ModalState = null | 'new' | number;

function matchesSearch(command: Command, search: string) {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [command.title, command.command, command.description ?? '', ...command.tags.map((tag) => tag.name)].some(
    (value) => value.toLowerCase().includes(query),
  );
}

function App() {
  const { isPending, error, data: commands = [], isFetching, refetch } = useCommands();
  const { data: tags = [] } = useTags();
  const [search, setSearch] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Look up by id so dialogs always see the latest data (and close if the command disappears).
  const editing = typeof modal === 'number' ? commands.find((command) => command.id === modal) : undefined;
  const deleting = commands.find((command) => command.id === deletingId);
  const modalOpen = modal === 'new' || editing !== undefined;

  // Ignore a selected tag that no longer exists.
  const activeTagId = tags.some((tag) => tag.id === selectedTagId) ? selectedTagId : null;

  const visibleCommands = commands.filter(
    (command) =>
      matchesSearch(command, search) && (activeTagId === null || command.tags.some((tag) => tag.id === activeTagId)),
  );

  // "/" focuses search and "N" opens the add modal, unless the user is typing or a dialog is open.
  const dialogOpen = modalOpen || deleting !== undefined;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isTyping = target.closest('input, textarea, select, [contenteditable="true"]');

      if (dialogOpen || isTyping || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setModal('new');
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialogOpen]);

  function clearFilters() {
    setSearch('');
    setSelectedTagId(null);
  }

  function renderContent() {
    if (isPending) return <LoadingRows />;
    // Only block the page when there's nothing cached; a failed background refetch keeps the list.
    if (error && commands.length === 0)
      return <LoadError error={error} retrying={isFetching} onRetry={() => refetch()} />;
    if (commands.length === 0) return <EmptyLibrary onAdd={() => setModal('new')} />;
    if (visibleCommands.length === 0) return <NoMatches search={search} onClear={clearFilters} />;

    return (
      <CommandList
        commands={visibleCommands}
        total={commands.length}
        onEdit={(command) => setModal(command.id)}
        onDelete={(command) => setDeletingId(command.id)}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar tags={tags} commands={commands} activeTagId={activeTagId} onSelectTag={setSelectedTagId} />

      <div className="main">
        <Header search={search} onSearchChange={setSearch} onAdd={() => setModal('new')} searchRef={searchRef} />
        <main className="content">{renderContent()}</main>
      </div>

      {modalOpen && (
        <CommandModal
          // A new key resets the form when switching between commands.
          key={editing?.id ?? 'new'}
          command={editing}
          onClose={() => setModal(null)}
        />
      )}

      {deleting && <ConfirmDelete command={deleting} onClose={() => setDeletingId(null)} />}
    </div>
  );
}

export default App;

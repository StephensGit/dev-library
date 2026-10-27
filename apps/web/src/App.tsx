import { useEffect, useMemo, useRef, useState } from 'react';
import type { Command, Tag } from './api/api';
import type { User } from './api/auth';
import { CommandList } from './features/commands/CommandList';
import { CommandModal } from './features/commands/CommandModal';
import { ConfirmDelete } from './features/commands/ConfirmDelete';
import { Header } from './components/layout/Header';
import { EmptyLibrary } from './features/commands/EmptyLibrary';
import { LoadError } from './features/commands/LoadError';
import { LoadingRows } from './features/commands/LoadingRows';
import { NoMatches } from './features/commands/NoMatches';
import { Sidebar } from './components/layout/Sidebar';
import { DeleteTag } from './features/tags/DeleteTag';
import { RenameTag } from './features/tags/RenameTag';
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

type AppProps = {
  user: User;
};

function App({ user }: AppProps) {
  const { isPending, error, data: commands = [], isFetching, refetch } = useCommands();
  const { data: tags = [] } = useTags();
  const [search, setSearch] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedCommandId, setSelectedCommandId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Kept as objects, not ids, so the dialog stays open until its request finishes and the lists refetch.
  const [renamingTag, setRenamingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [tagNotice, setTagNotice] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedCopyRef = useRef<HTMLButtonElement>(null);

  // Look up by id so dialogs always see the latest data (and close if the command disappears).
  const editing = typeof modal === 'number' ? commands.find((command) => command.id === modal) : undefined;
  const deleting = commands.find((command) => command.id === deletingId);
  const modalOpen = modal === 'new' || editing !== undefined;

  // Ignore selected tags that no longer exist.
  const activeTags = useMemo(() => tags.filter((tag) => selectedTagIds.includes(tag.id)), [tags, selectedTagIds]);

  // Memoised so the keyboard effect below only re-binds when the list actually changes.
  // A command matches if it has any of the checked tags.
  const visibleCommands = useMemo(
    () =>
      commands.filter(
        (command) =>
          matchesSearch(command, search) &&
          (activeTags.length === 0 || command.tags.some((tag) => activeTags.some((active) => active.id === tag.id))),
      ),
    [commands, search, activeTags],
  );

  // -1 when nothing is selected or the selected command is filtered out.
  const selectedIndex = visibleCommands.findIndex((command) => command.id === selectedCommandId);

  const dialogOpen = modalOpen || deleting !== undefined || renamingTag !== null || deletingTag !== null;

  // Clear the sidebar's success message after a few seconds.
  useEffect(() => {
    if (!tagNotice) {
      return;
    }

    const timeout = setTimeout(() => setTagNotice(''), 4000);
    return () => clearTimeout(timeout);
  }, [tagNotice]);

  // Shortcuts, unless a dialog is open:
  // "/" focuses search, "N" opens the add modal, ↑/↓ move the selection and Enter copies it.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (dialogOpen || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement;
      // The search box counts as "not typing" for ↑/↓/Enter, so you can search → pick → copy without the mouse.
      const inSearch = target === searchRef.current;
      const isTyping = target.closest('input:not([type="checkbox"]), textarea, select, [contenteditable="true"]');

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        // Arrows do nothing on buttons or checkboxes, so they move the list from there too (but not inside a menu).
        if ((isTyping && !inSearch) || target.closest('[role="menu"]') || visibleCommands.length === 0) {
          return;
        }

        event.preventDefault();
        const next =
          event.key === 'ArrowDown'
            ? Math.min(selectedIndex + 1, visibleCommands.length - 1)
            : Math.max(selectedIndex - 1, 0);
        setSelectedCommandId(visibleCommands[next].id);
        return;
      }

      if (event.key === 'Enter') {
        // Enter keeps its normal job on buttons, links and checkboxes.
        const isControl = target.closest('input, textarea, select, button, a, [contenteditable="true"]');

        if (selectedIndex !== -1 && (inSearch || !isControl)) {
          event.preventDefault();
          selectedCopyRef.current?.click();
        }
        return;
      }

      if (isTyping) {
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
  }, [dialogOpen, visibleCommands, selectedIndex]);

  function toggleTag(tagId: number) {
    setSelectedTagIds((ids) => (ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId]));
  }

  // The id doesn't change, so a renamed tag stays selected.
  function handleTagRenamed(tag: Tag) {
    setRenamingTag(null);
    setTagNotice(`Renamed tag to ${tag.name}`);
  }

  // Only called once the API has confirmed the delete.
  function handleTagDeleted(tag: Tag) {
    setSelectedTagIds((ids) => ids.filter((id) => id !== tag.id));
    setDeletingTag(null);
    setTagNotice(`Deleted tag ${tag.name}`);
  }

  function clearFilters() {
    setSearch('');
    setSelectedTagIds([]);
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
        filterTags={activeTags}
        selectedId={selectedCommandId}
        selectedCopyRef={selectedCopyRef}
        onRemoveTag={toggleTag}
        onEdit={(command) => setModal(command.id)}
        onDelete={(command) => setDeletingId(command.id)}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        user={user}
        tags={tags}
        commands={commands}
        selectedTagIds={activeTags.map((tag) => tag.id)}
        onToggleTag={toggleTag}
        onClearTags={() => setSelectedTagIds([])}
        onRenameTag={setRenamingTag}
        onDeleteTag={setDeletingTag}
        notice={tagNotice}
      />

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

      {renamingTag && <RenameTag tag={renamingTag} onClose={() => setRenamingTag(null)} onRenamed={handleTagRenamed} />}

      {deletingTag && (
        <DeleteTag
          tag={deletingTag}
          commands={isPending || error ? undefined : commands}
          onClose={() => setDeletingTag(null)}
          onDeleted={handleTagDeleted}
        />
      )}
    </div>
  );
}

export default App;

import type { Command, Tag } from '../../api/api';
import type { User } from '../../api/auth';
import { AccountFooter } from '../../features/auth/AccountFooter';
import { ActionMenu } from '../ui/ActionMenu';
import { tagColor } from '../../features/tags/tagColors';

type SidebarProps = {
  user: User;
  tags: Tag[];
  // Undefined while commands are loading or failed, so counts are hidden rather than shown as 0.
  commands?: Command[];
  selectedTagIds: number[];
  onToggleTag: (tagId: number) => void;
  onClearTags: () => void;
  onRenameTag: (tag: Tag) => void;
  onDeleteTag: (tag: Tag) => void;
  // Confirmation of the last rename or delete; announced to screen readers.
  notice: string;
};

export function Sidebar({
  user,
  tags,
  commands,
  selectedTagIds,
  onToggleTag,
  onClearTags,
  onRenameTag,
  onDeleteTag,
  notice,
}: SidebarProps) {
  const countFor = (tagId: number) =>
    commands?.filter((command) => command.tags.some((tag) => tag.id === tagId)).length;

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          &gt;_
        </span>
        Dev Library
      </div>

      <nav className="tag-nav" aria-label="Filter by tag">
        <button type="button" className="tag-nav-item" aria-pressed={selectedTagIds.length === 0} onClick={onClearTags}>
          <span className="tag-nav-name">All commands</span>
          <span className="tag-nav-count">{commands?.length}</span>
        </button>

        {tags.length > 0 && (
          <div className="tag-nav-heading">
            Tags
            {selectedTagIds.length > 0 && (
              <button type="button" className="tag-nav-clear" onClick={onClearTags}>
                Clear
              </button>
            )}
          </div>
        )}

        {tags.map((tag) => {
          const checked = selectedTagIds.includes(tag.id);

          // The menu sits beside the label, not inside it, so opening it doesn't toggle the filter.
          return (
            <div key={tag.id} className="tag-nav-item tag-nav-row" data-checked={checked}>
              <label className="tag-nav-label">
                <span className="tag-nav-name">
                  <input type="checkbox" className="checkbox" checked={checked} onChange={() => onToggleTag(tag.id)} />
                  <span className="tag-dot" style={{ background: tagColor(tag.name) }} />
                  {tag.name}
                </span>
                <span className="tag-nav-count">{countFor(tag.id)}</span>
              </label>
              <ActionMenu
                label={`tag ${tag.name}`}
                editLabel="Rename"
                onEdit={() => onRenameTag(tag)}
                onDelete={() => onDeleteTag(tag)}
              />
            </div>
          );
        })}
      </nav>

      <p className="tag-nav-status" role="status">
        {notice}
      </p>

      <AccountFooter user={user} />
    </aside>
  );
}

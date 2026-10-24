import type { Command, Tag } from '../../api/api'
import { tagColor } from '../../features/tags/tagColors'

type SidebarProps = {
  tags: Tag[]
  // Undefined while commands are loading or failed, so counts are hidden rather than shown as 0.
  commands?: Command[]
  activeTagId: number | null
  onSelectTag: (tagId: number | null) => void
}

export function Sidebar({ tags, commands, activeTagId, onSelectTag }: SidebarProps) {
  const countFor = (tagId: number) =>
    commands?.filter((command) => command.tags.some((tag) => tag.id === tagId)).length

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          &gt;_
        </span>
        Dev Library
      </div>

      <nav className="tag-nav" aria-label="Filter by tag">
        <button
          type="button"
          className="tag-nav-item"
          aria-pressed={activeTagId === null}
          onClick={() => onSelectTag(null)}
        >
          <span className="tag-nav-name">All commands</span>
          <span className="tag-nav-count">{commands?.length}</span>
        </button>

        {tags.length > 0 && <div className="tag-nav-heading">Tags</div>}

        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="tag-nav-item"
            aria-pressed={activeTagId === tag.id}
            // Clicking the active tag again clears the filter.
            onClick={() => onSelectTag(activeTagId === tag.id ? null : tag.id)}
          >
            <span className="tag-nav-name">
              <span className="tag-dot" style={{ background: tagColor(tag.name) }} />
              {tag.name}
            </span>
            <span className="tag-nav-count">{countFor(tag.id)}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

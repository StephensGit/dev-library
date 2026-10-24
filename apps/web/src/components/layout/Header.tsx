import type { RefObject } from 'react'
import { PlusIcon, SearchIcon } from '../ui/Icons'

type HeaderProps = {
  search: string
  onSearchChange: (search: string) => void
  onAdd: () => void
  searchRef: RefObject<HTMLInputElement | null>
}

export function Header({ search, onSearchChange, onAdd, searchRef }: HeaderProps) {
  return (
    <header className="header">
      <label className="search">
        <SearchIcon size={15} />
        <input
          ref={searchRef}
          type="search"
          value={search}
          placeholder="Search commands, descriptions, tags…"
          aria-label="Search commands"
          aria-keyshortcuts="/"
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onSearchChange('')
              event.currentTarget.blur()
            }
          }}
        />
        <kbd className="kbd" aria-hidden="true">
          /
        </kbd>
      </label>

      <button
        type="button"
        className="button button-primary add-button"
        aria-keyshortcuts="n"
        onClick={onAdd}
      >
        <PlusIcon size={15} />
        <span className="add-label">Add command</span>
        <kbd className="kbd kbd-on-mint" aria-hidden="true">
          N
        </kbd>
      </button>
    </header>
  )
}

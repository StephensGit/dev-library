import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { EditIcon, MoreIcon, TrashIcon } from './Icons';

type ActionMenuProps = {
  label: string;
  // Defaults to "Edit"; tags use "Rename".
  editLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
};

// Gap kept between the menu and the button / window edges, in px.
const GAP = 4;
const EDGE = 8;

export function ActionMenu({ label, editLabel = 'Edit', onEdit, onDelete }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu is position: fixed so scrolling containers (the sidebar, the mobile tag row) can't clip it.
  // Place it under the button, right-aligned, flipped above or nudged inwards if it would leave the window.
  useLayoutEffect(() => {
    const button = buttonRef.current?.getBoundingClientRect();
    const menu = menuRef.current;

    if (!open || !button || !menu) {
      return;
    }

    const below = button.bottom + GAP;
    const fitsBelow = below + menu.offsetHeight <= window.innerHeight - EDGE;
    const left = Math.min(Math.max(EDGE, button.right - menu.offsetWidth), window.innerWidth - menu.offsetWidth - EDGE);

    menu.style.top = `${fitsBelow ? below : button.top - GAP - menu.offsetHeight}px`;
    menu.style.left = `${left}px`;
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  // Close when clicking anywhere outside the menu, pressing Escape, or scrolling (which would detach it).
  useEffect(() => {
    if (!open) {
      return;
    }

    function close() {
      setOpen(false);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        close();
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // ↑/↓ move between items (wrapping), Home/End jump to the ends, Tab leaves the menu.
  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];

    if (next !== undefined) {
      event.preventDefault();
      items[next].focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  function choose(action: () => void) {
    // Return focus to the button first, so a dialog opened by the action restores focus there on close.
    buttonRef.current?.focus();
    setOpen(false);
    action();
  }

  return (
    <div className="action-menu" ref={containerRef} data-open={open}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreIcon size={15} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          aria-label={`Actions for ${label}`}
          onKeyDown={handleMenuKeyDown}
        >
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onEdit)}>
            <EditIcon size={13} />
            {editLabel}
          </button>
          <button type="button" role="menuitem" className="menu-item menu-item-danger" onClick={() => choose(onDelete)}>
            <TrashIcon size={13} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

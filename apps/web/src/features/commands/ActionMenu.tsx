import { useEffect, useRef, useState } from 'react';
import { EditIcon, MoreIcon, TrashIcon } from '../../components/ui/Icons';

type ActionMenuProps = {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
};

export function ActionMenu({ label, onEdit, onDelete }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking anywhere outside the menu or pressing Escape.
  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="action-menu" ref={menuRef} data-open={open}>
      <button
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
        <div className="menu" role="menu">
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onEdit)}>
            <EditIcon size={13} />
            Edit
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

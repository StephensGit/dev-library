import { useEffect, useRef, type ReactNode } from 'react';

type DialogProps = {
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
};

// Native <dialog> gives us the backdrop, focus trapping and Escape handling.
export function Dialog({ onClose, labelledBy, className, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`dialog ${className ?? ''}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        // Let React decide when the dialog unmounts.
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}

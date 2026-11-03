import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = '再想想',
  onConfirm,
  onClose,
  busy = false
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      } else if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        const focusable = dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
        ref={dialogRef}
      >
        <span className="confirm-dialog__icon" aria-hidden="true">
          <AlertTriangle size={19} />
        </span>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        <div className="confirm-dialog__actions">
          <Button
            disabled={busy}
            onClick={onClose}
            variant="ghost"
          >
            {cancelLabel}
          </Button>
          <Button
            disabled={busy}
            onClick={onConfirm}
            variant="danger"
          >
            {busy ? '正在处理…' : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

import { useCallback, useEffect, useRef } from 'react';
import type { JSX, ReactNode } from 'react';

export type ModalProps = {
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode | undefined;
  readonly wide?: boolean | undefined;
  readonly closeLabel?: string | undefined;
};

export function Modal(props: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [props],
  );

  useEffect(() => {
    if (!props.open) return;
    previouslyFocused.current = document.activeElement;
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), select, textarea',
    );
    target?.focus();
    return () => {
      const previous = previouslyFocused.current;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div className="solfa-modal-overlay" onPointerDown={props.onClose}>
      <div
        ref={panelRef}
        className="solfa-modal"
        data-wide={props.wide === true}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="solfa-modal-header">
          <h2>{props.title}</h2>
          <button
            type="button"
            className="solfa-modal-close"
            onClick={props.onClose}
            aria-label={props.closeLabel ?? 'Close'}
          >
            &times;
          </button>
        </header>
        <div className="solfa-modal-body">{props.children}</div>
        {props.footer ? <footer className="solfa-modal-footer">{props.footer}</footer> : null}
      </div>
    </div>
  );
}

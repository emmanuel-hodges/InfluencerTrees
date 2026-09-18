import type { ReactNode } from 'react';

export type NoticeKind = 'success' | 'error' | 'info';

export interface NoticeData {
  kind: NoticeKind;
  text: string;
}

interface Props {
  kind: NoticeKind;
  children: ReactNode;
  onDismiss?: () => void;
}

export function Notice({ kind, children, onDismiss }: Props) {
  return (
    <div className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div className="notice__text">{children}</div>
      {onDismiss ? (
        <button type="button" className="notice__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Reads a notice handed over through router state, ignoring anything else. */
export function noticeFromState(state: unknown): NoticeData | null {
  if (typeof state !== 'object' || state === null) return null;
  const n = (state as { notice?: unknown }).notice;
  if (typeof n !== 'object' || n === null) return null;
  const { kind, text } = n as { kind?: unknown; text?: unknown };
  if ((kind === 'success' || kind === 'error' || kind === 'info') && typeof text === 'string') return { kind, text };
  return null;
}

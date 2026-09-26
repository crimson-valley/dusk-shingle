import type { ReactNode } from 'react';

type Tone = 'neutral' | 'caution' | 'error' | 'quiet';

/** Inline status message. Errors are announced assertively, everything else politely. */
export function Notice({ tone = 'neutral', title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="notice" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="notice-body">
        {title && <p className="notice-title">{title}</p>}
        {children && <div className="notice-text">{children}</div>}
      </div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

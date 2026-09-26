import { useEffect, useRef, useState } from 'react';
import { parseCommentBody } from '../lib/spoilers';

/** Renders untrusted comment text as React text nodes only — never as HTML, never as links. */
export function CommentText({ body }: { body: string }) {
  return (
    <div className="comment-text">
      {parseCommentBody(body).map((para, i) => (
        <p key={i}>
          {para.map((seg, j) => (seg.kind === 'spoiler' ? <Spoiler key={j} text={seg.text} /> : <span key={j}>{seg.text}</span>))}
        </p>
      ))}
    </div>
  );
}

function Spoiler({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const revealed = useRef<HTMLElement>(null);
  // Keep keyboard focus on the revealed text instead of losing it to <body>.
  useEffect(() => { if (open) revealed.current?.focus(); }, [open]);
  if (open) return <mark ref={revealed} tabIndex={-1} className="spoiler is-open">{text}</mark>;
  return (
    <button type="button" className="spoiler" aria-label="Hidden spoiler. Activate to reveal." onClick={() => setOpen(true)}>
      <span aria-hidden="true">{'\u2007'.repeat(Math.min(24, Math.max(4, text.length)))}</span>
    </button>
  );
}

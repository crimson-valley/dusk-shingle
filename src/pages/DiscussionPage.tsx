import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { Chapter } from '../types';
import { Link } from '../components/Link';
import { Icon } from '../components/Icon';
import { Notice } from '../components/Notice';
import { CommentText } from '../components/CommentText';
import { PublicationFooter } from '../components/PublicationFooter';
import { useReader } from '../lib/reader';
import { api, ApiFailure } from '../lib/api';
import { chapterNumber, relativeTime } from '../lib/format';
import { isFolded, readThrough } from '../lib/spoilers';
import { getPublishedChapters } from '../content/chapters';
import { publishedChapterNumber } from '../content/catalog';

export type CommentView = {
  id: string;
  parentId: string | null;
  author: string | null;
  body: string;
  status: 'visible' | 'hidden' | 'removed' | 'deleted';
  revealsThrough: number;
  hasSpoiler: boolean;
  createdAt: string;
  editedAt: string | null;
  reactions: number;
  reacted: boolean;
  mine: boolean;
};

type Load = { state: 'loading' } | { state: 'ready'; comments: CommentView[] } | { state: 'error'; error: ApiFailure };

export function DiscussionPage({ chapter }: { chapter?: Chapter }) {
  if (!chapter) {
    return (
      <main id="main" className="standalone page">
        <p className="meta-label">Discussion</p>
        <h1 className="standalone-title">There is no discussion here.</h1>
        <p className="standalone-text">Discussions exist only for published chapters.</p>
        <Link className="btn btn-secondary" href="/discussions">All discussions</Link>
      </main>
    );
  }
  return <Discussion key={chapter.slug} chapter={chapter} />;
}

function Discussion({ chapter }: { chapter: Chapter }) {
  const { account, accountStatus, accountMessage, completedSlugs } = useReader();
  const through = readThrough(completedSlugs, publishedChapterNumber);
  const finished = through >= chapter.number;
  const gateKey = `dusk.gate.${chapter.slug}`;
  const [gateOpen, setGateOpen] = useState(() => {
    try {
      return sessionStorage.getItem(gateKey) === '1';
    } catch {
      return false;
    }
  });
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ comments: CommentView[] }>('GET', `/api/chapters/${chapter.slug}/comments`);
      setLoad({ state: 'ready', comments: data.comments });
    } catch (error) {
      setLoad({ state: 'error', error: error as ApiFailure });
    }
  }, [chapter.slug]);

  useEffect(() => {
    if (finished || gateOpen) void refresh();
  }, [finished, gateOpen, refresh]);

  const threads = useMemo(() => {
    if (load.state !== 'ready') return [];
    const roots = load.comments.filter((c) => !c.parentId);
    return roots.map((root) => ({ root, replies: load.comments.filter((c) => c.parentId === root.id) }));
  }, [load]);

  const openGate = () => {
    try {
      sessionStorage.setItem(gateKey, '1');
    } catch {
      /* ignore */
    }
    setGateOpen(true);
  };

  return (
    <>
      <main id="main" className="discussion page">
        <Link className="back" href={`/chapter/${chapter.slug}`}><Icon name="arrow-left" size={14} />Back to the chapter</Link>
        <header className="discussion-head">
          <p className="meta-label">Discussion · Chapter {chapterNumber(chapter.number)}</p>
          <h1 className="discussion-title">{chapter.title}</h1>
          <p className="discussion-scope">
            This room discusses the story up to the end of chapter {chapterNumber(chapter.number)}. Comments that reach further are
            folded until you have read that far, and anything wrapped in <code>||double bars||</code> stays concealed until you choose to reveal it.
          </p>
        </header>

        {!finished && !gateOpen ? (
          <div className="gate">
            <p className="gate-title">You haven’t finished this chapter.</p>
            <p>The discussion assumes you have, and may reveal how it ends.</p>
            <div className="gate-actions">
              <Link className="btn btn-primary" href={`/chapter/${chapter.slug}`}>Return to reading</Link>
              <button type="button" className="btn btn-secondary" onClick={openGate}>Open the discussion anyway</button>
            </div>
          </div>
        ) : (
          <>
            {accountStatus === 'unavailable' ? (
              <Notice tone="quiet" title="Discussion is not connected yet">{accountMessage}</Notice>
            ) : account ? (
              replyTo === null && <Composer chapter={chapter} onPosted={refresh} />
            ) : accountStatus === 'signed-out' ? (
              <div className="join">
                <p>To take part, create an anonymous account. No email, no name, no password — you receive a single reader key.</p>
                <Link className="btn btn-secondary" href="/account">Create an anonymous account</Link>
              </div>
            ) : null}

            {load.state === 'loading' && <p className="meta loading">Loading the discussion…</p>}
            {load.state === 'error' && (
              <Notice tone={load.error.code === 'offline' ? 'caution' : 'quiet'} title="The discussion could not be loaded" action={<button type="button" className="btn btn-quiet" onClick={refresh}>Try again</button>}>
                {load.error.message}
              </Notice>
            )}
            {load.state === 'ready' && threads.length === 0 && (
              <div className="empty">
                <p className="empty-title">No one has written here yet.</p>
                <p>{account ? 'The first comment sets the tone. Take your time.' : 'When readers begin, their comments will appear here.'}</p>
              </div>
            )}
            {threads.length > 0 && (
              <ol className="threads">
                {threads.map(({ root, replies }) => (
                  <li key={root.id} className="thread">
                    <CommentItem comment={root} chapter={chapter} through={through} onChange={refresh} canReply={Boolean(account)} onReply={() => setReplyTo(root.id)} />
                    {(replies.length > 0 || replyTo === root.id) && (
                      <ol className="replies">
                        {replies.map((r) => (
                          <li key={r.id}>
                            <CommentItem comment={r} chapter={chapter} through={through} onChange={refresh} canReply={Boolean(account)} onReply={() => setReplyTo(root.id)} />
                          </li>
                        ))}
                        {replyTo === root.id && (
                          <li>
                            <Composer chapter={chapter} parentId={root.id} onPosted={async () => { setReplyTo(null); await refresh(); }} onCancel={() => setReplyTo(null)} />
                          </li>
                        )}
                      </ol>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </main>
      <PublicationFooter />
    </>
  );
}

function ScopeSelect({ chapter, value, onChange }: { chapter: Chapter; value: number; onChange: (n: number) => void }) {
  const id = useId();
  const later = getPublishedChapters().filter((c) => c.number >= chapter.number);
  if (later.length <= 1) {
    return <p className="field-hint">Discusses up to chapter {chapterNumber(chapter.number)}.</p>;
  }
  return (
    <div className="scope">
      <label htmlFor={id} className="field-hint">Discusses up to</label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {later.map((c) => (
          <option key={c.slug} value={c.number}>Chapter {chapterNumber(c.number)}{c.number === chapter.number ? ' (this chapter)' : ' — folded for readers who haven’t reached it'}</option>
        ))}
      </select>
    </div>
  );
}

function Composer({ chapter, parentId, initial, onPosted, onCancel, editId }: {
  chapter: Chapter; parentId?: string; initial?: CommentView; editId?: string;
  onPosted: () => Promise<void> | void; onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial?.body ?? '');
  const [scope, setScope] = useState(initial?.revealsThrough ?? chapter.number);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure>();
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      if (editId) await api('PATCH', `/api/comments/${editId}`, { body, revealsThrough: scope });
      else await api('POST', `/api/chapters/${chapter.slug}/comments`, { body, revealsThrough: scope, parentId });
      setBody('');
      await onPosted();
    } catch (err) {
      setError(err as ApiFailure);
    } finally {
      setBusy(false);
    }
  }

  const label = editId ? 'Edit your comment' : parentId ? 'Write a reply' : 'Write a comment';
  return (
    <form className="composer" onSubmit={submit}>
      <label htmlFor={id} className={parentId || editId ? 'visually-hidden' : 'meta-label'}>{label}</label>
      <textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={parentId || editId ? 3 : 5} maxLength={4000} required
        placeholder={parentId ? 'Reply…' : 'What stayed with you?'} aria-describedby={`${id}-hint`} autoFocus={Boolean(parentId || editId)} />
      <div className="composer-foot">
        <div id={`${id}-hint`}>
          <ScopeSelect chapter={chapter} value={scope} onChange={setScope} />
          <p className="field-hint">Wrap spoilers in <code>||double bars||</code>. Plain text only; links are not clickable.</p>
        </div>
        <div className="composer-actions">
          {onCancel && <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>}
          <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>{busy ? 'Posting…' : editId ? 'Save' : parentId ? 'Reply' : 'Post'}</button>
        </div>
      </div>
      {error && <Notice tone="error">{error.message}</Notice>}
    </form>
  );
}

function CommentItem({ comment, chapter, through, onChange, canReply, onReply }: {
  comment: CommentView; chapter: Chapter; through: number; onChange: () => Promise<void>; canReply: boolean; onReply: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();

  const act = async (fn: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError((e as ApiFailure).message);
    }
  };

  if (comment.status === 'deleted') {
    return <article className="comment is-gone"><p className="meta">Comment deleted by its author.</p></article>;
  }
  if (!comment.mine && (comment.status === 'hidden' || comment.status === 'removed')) {
    return <article className="comment is-gone"><p className="meta">Hidden while moderators review reports.</p></article>;
  }

  const folded = !comment.mine && !revealed && isFolded(comment.revealsThrough, through, chapter.number);
  const header = (
    <header className="comment-head">
      <span className="comment-author">{comment.author}{comment.mine && <span className="comment-you"> · you</span>}</span>
      <span className="meta">
        <time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time>
        {comment.editedAt && ' · edited'}
        {comment.revealsThrough > chapter.number && ` · up to ch. ${chapterNumber(comment.revealsThrough)}`}
      </span>
    </header>
  );

  if (folded) {
    return (
      <article className="comment is-folded">
        {header}
        <p className="folded-text">Folded — this comment discusses up to chapter {chapterNumber(comment.revealsThrough)}, which you haven’t finished.</p>
        <button type="button" className="btn btn-quiet" onClick={() => setRevealed(true)}>Reveal anyway</button>
      </article>
    );
  }

  return (
    <article className="comment">
      {header}
      {comment.mine && comment.status !== 'visible' && (
        <Notice tone="caution">{comment.status === 'removed' ? 'Moderators removed this comment. Only you can see it.' : 'This comment is hidden from others while reports are reviewed.'}</Notice>
      )}
      {editing ? (
        <Composer chapter={chapter} initial={comment} editId={comment.id} onCancel={() => setEditing(false)} onPosted={async () => { setEditing(false); await onChange(); }} />
      ) : (
        <CommentText body={comment.body} />
      )}
      {!editing && comment.status === 'visible' && (
        <div className="comment-actions">
          {canReply && <button type="button" className="text-btn" onClick={onReply}><Icon name="reply" size={14} />Reply</button>}
          {canReply && !comment.mine ? (
            <button type="button" className="text-btn" aria-pressed={comment.reacted}
              onClick={() => act(() => api(comment.reacted ? 'DELETE' : 'PUT', `/api/comments/${comment.id}/reaction`))}>
              <Icon name="mark" size={14} />{comment.reacted ? 'Marked' : 'Mark'}
              {comment.reactions > 0 && <span className="count" aria-label={`${comment.reactions} readers marked this`}>{comment.reactions}</span>}
            </button>
          ) : comment.reactions > 0 ? (
            <span className="meta">Marked by {comment.reactions}</span>
          ) : null}
          {comment.mine && <button type="button" className="text-btn" onClick={() => setEditing(true)}>Edit</button>}
          {comment.mine && (confirmDelete ? (
            <span className="confirm-inline">
              Delete permanently?
              <button type="button" className="text-btn danger" onClick={() => act(() => api('DELETE', `/api/comments/${comment.id}`))}>Delete</button>
              <button type="button" className="text-btn" onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : <button type="button" className="text-btn" onClick={() => setConfirmDelete(true)}>Delete</button>)}
          {canReply && !comment.mine && <button type="button" className="text-btn subtle" onClick={() => setReporting((r) => !r)} aria-expanded={reporting}><Icon name="flag" size={14} />Report</button>}
        </div>
      )}
      {reporting && <ReportForm id={comment.id} onDone={async () => { setReporting(false); await onChange(); }} />}
      {error && <Notice tone="error">{error}</Notice>}
    </article>
  );
}

function ReportForm({ id, onDone }: { id: string; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('spoiler');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | string>('idle');
  const name = useId();
  if (state === 'sent') return <Notice tone="quiet">Thank you. Moderators will review it; the author is not told who reported.</Notice>;
  return (
    <form className="report" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await api('POST', `/api/comments/${id}/report`, { reason, note: note || undefined });
        setState('sent');
        window.setTimeout(() => void onDone(), 2500);
      } catch (err) {
        setState((err as ApiFailure).message);
      }
    }}>
      <fieldset>
        <legend className="meta-label">Why are you reporting this?</legend>
        {[['spoiler', 'Unmarked spoiler'], ['harassment', 'Harassment or hate'], ['spam', 'Spam'], ['other', 'Something else']].map(([v, l]) => (
          <label key={v} className="radio"><input type="radio" name={name} value={v} checked={reason === v} onChange={() => setReason(v)} />{l}</label>
        ))}
      </fieldset>
      <label className="visually-hidden" htmlFor={`${name}-note`}>Optional note for moderators</label>
      <input id={`${name}-note`} type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for moderators" />
      <button type="submit" className="btn btn-secondary">Send report</button>
      {state !== 'idle' && <Notice tone="error">{state}</Notice>}
    </form>
  );
}

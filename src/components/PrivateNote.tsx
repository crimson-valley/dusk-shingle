import { useEffect, useId, useState } from 'react';
import { Icon } from './Icon';
import { Link } from './Link';
import { useReader } from '../lib/reader';

/** A private margin note for the chapter. Synced only inside the end-to-end encrypted vault. */
export function PrivateNote({ slug }: { slug: string }) {
  const { vault, setNote, accountStatus, sync } = useReader();
  const saved = vault.notes[slug]?.text ?? '';
  const [text, setText] = useState(saved);
  const [open, setOpen] = useState(Boolean(saved));
  const id = useId();

  useEffect(() => setText(saved), [saved]);
  useEffect(() => {
    if (text === saved) return;
    const t = window.setTimeout(() => setNote(slug, text), 700);
    return () => window.clearTimeout(t);
  }, [text, saved, slug, setNote]);

  const signedIn = accountStatus === 'signed-in';
  // 'locked' means this device has no decryption key yet — the reader already
  // has an account and needs to unlock it, not create another one.
  const locked = sync === 'locked' || sync === 'crypto-error';
  const encrypted = signedIn && !locked;

  if (!open) {
    return (
      <button type="button" className="btn btn-quiet note-open" onClick={() => setOpen(true)}>
        <Icon name="lock" /> Add a private note
      </button>
    );
  }
  return (
    <div className="private-note">
      <div className="private-note-head">
        <label htmlFor={id} className="meta-label">Private note</label>
        {/* Without this the panel is a one-way door: open is only ever set true. */}
        <button type="button" className="icon-btn" aria-label="Close private note" onClick={() => setOpen(false)}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <textarea id={id} value={text} maxLength={4000} rows={4} onChange={(e) => setText(e.target.value)} placeholder="Only you can read this." />
      <p className="field-hint">
        <Icon name="lock" size={13} />{' '}
        {encrypted
          ? 'Encrypted on this device before it is synced. The server stores only ciphertext.'
          : signedIn
            ? <>Saved with your account, but this device cannot encrypt it yet. <Link href="/account">Unlock encrypted sync</Link> to carry it to your other devices.</>
            : <>Kept on this device only. <Link href="/account">Create an anonymous account</Link> to carry it, encrypted, to your other devices.</>}
      </p>
    </div>
  );
}

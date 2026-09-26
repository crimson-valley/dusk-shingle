import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useReader } from '../lib/reader';
import type { FontSize, Measure, Theme } from '../lib/readerState';

const SIZES: FontSize[] = ['small', 'standard', 'large', 'larger'];

export function ReadingControls() {
  const { prefs, setPrefs } = useReader();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sizeIndex = SIZES.indexOf(prefs.fontSize);

  return (
    <div className="controls" ref={root}>
      <button ref={trigger} type="button" className="icon-btn" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <Icon name="type" size={18} />
        <span className="visually-hidden">Reading settings</span>
      </button>
      {open && (
        <div className="controls-panel" id={panelId} role="group" aria-label="Reading settings">
          <Segmented<Theme>
            label="Appearance"
            value={prefs.theme}
            options={[['auto', 'Auto'], ['paper', 'Paper'], ['dusk', 'Dusk']]}
            onChange={(theme) => setPrefs({ theme })}
          />
          <div className="control-row">
            <span className="control-label" id={`${panelId}-size`}>Text size</span>
            <div className="stepper" role="group" aria-labelledby={`${panelId}-size`}>
              <button type="button" disabled={sizeIndex <= 0} onClick={() => setPrefs({ fontSize: SIZES[sizeIndex - 1] })} aria-label="Smaller text">A−</button>
              <output aria-live="polite">{prefs.fontSize}</output>
              <button type="button" disabled={sizeIndex >= SIZES.length - 1} onClick={() => setPrefs({ fontSize: SIZES[sizeIndex + 1] })} aria-label="Larger text">A+</button>
            </div>
          </div>
          <Segmented<Measure>
            label="Line length"
            value={prefs.measure}
            options={[['narrow', 'Narrow'], ['standard', 'Standard'], ['wide', 'Wide']]}
            onChange={(measure) => setPrefs({ measure })}
          />
          <p className="controls-foot">Motion follows your system setting.</p>
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="control-row">
      <span className="control-label" id={id}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

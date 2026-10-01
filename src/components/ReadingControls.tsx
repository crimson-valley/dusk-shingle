import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useReader } from '../lib/reader';
import { defaultPreferences, type FontSize, type Measure, type Theme } from '../lib/readerState';

const SIZES: FontSize[] = ['small', 'standard', 'large', 'larger'];
const SIZE_LABELS: Record<FontSize, string> = { small: 'Small', standard: 'Standard', large: 'Large', larger: 'Largest' };

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

  const isDefault =
    prefs.theme === defaultPreferences.theme &&
    prefs.fontSize === defaultPreferences.fontSize &&
    prefs.measure === defaultPreferences.measure;

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
          <Segmented<FontSize>
            className="segmented-sizes"
            label="Text size"
            value={prefs.fontSize}
            /* Each step is shown at the size it sets, so the choice is made by
               looking at it rather than by remembering what “larger” meant. */
            options={SIZES.map((s) => [s, SIZE_LABELS[s]] as [FontSize, string])}
            onChange={(fontSize) => setPrefs({ fontSize })}
          />
          <Segmented<Measure>
            label="Line length"
            value={prefs.measure}
            options={[['narrow', 'Narrow'], ['standard', 'Standard'], ['wide', 'Wide']]}
            onChange={(measure) => setPrefs({ measure })}
          />
          <p className="controls-foot">
            <span>Motion follows your system setting.</span>
            <button type="button" className="text-btn controls-reset" disabled={isDefault} onClick={() => setPrefs(defaultPreferences)}>
              Reset
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label, value, options, onChange, className,
}: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void; className?: string;
}) {
  const id = useId();
  return (
    <div className="control-row">
      <span className="control-label" id={id}>{label}</span>
      <div className={className ? `segmented ${className}` : 'segmented'} role="radiogroup" aria-labelledby={id}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

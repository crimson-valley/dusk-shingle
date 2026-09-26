import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FontSize, LineSpacing, ReadingPreferences, ReadingWidth, Theme } from '../hooks/useReadingPreferences';
import { Icon } from './Icon';

type ReadingSettingsProps = {
  preferences: ReadingPreferences;
  updatePreferences: (update: Partial<ReadingPreferences>) => void;
};

export function ReadingSettings({ preferences, updatePreferences }: ReadingSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="settings" ref={panelRef}>
      <button
        ref={buttonRef}
        className="icon-button"
        type="button"
        aria-label="Reading settings"
        aria-expanded={isOpen}
        aria-controls="reading-settings-panel"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Icon name="type" />
      </button>
      {isOpen && (
        <div className="settings-panel" id="reading-settings-panel" role="dialog" aria-label="Reading settings">
          <div className="settings-heading">
            <span>Reading settings</span>
            <button className="settings-close" type="button" aria-label="Close reading settings" onClick={() => setIsOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <SettingGroup label="Theme">
            <ChoiceButton label="Paper" active={preferences.theme === 'paper'} onClick={() => updatePreferences({ theme: 'paper' })} />
            <ChoiceButton label="Night" active={preferences.theme === 'night'} onClick={() => updatePreferences({ theme: 'night' })} />
          </SettingGroup>
          <SettingGroup label="Text size">
            <ChoiceButton label="Standard" active={preferences.fontSize === 'standard'} onClick={() => updatePreferences({ fontSize: 'standard' })} />
            <ChoiceButton label="Large" active={preferences.fontSize === 'large'} onClick={() => updatePreferences({ fontSize: 'large' })} />
          </SettingGroup>
          <SettingGroup label="Reading width">
            <ChoiceButton label="Standard" active={preferences.width === 'standard'} onClick={() => updatePreferences({ width: 'standard' })} />
            <ChoiceButton label="Wide" active={preferences.width === 'wide'} onClick={() => updatePreferences({ width: 'wide' })} />
          </SettingGroup>
          <SettingGroup label="Line spacing">
            <ChoiceButton label="Relaxed" active={preferences.lineSpacing === 'relaxed'} onClick={() => updatePreferences({ lineSpacing: 'relaxed' })} />
            <ChoiceButton label="Airy" active={preferences.lineSpacing === 'airy'} onClick={() => updatePreferences({ lineSpacing: 'airy' })} />
          </SettingGroup>
        </div>
      )}
    </div>
  );
}

type SettingGroupProps = {
  label: string;
  children: ReactNode;
};

function SettingGroup({ label, children }: SettingGroupProps) {
  return (
    <fieldset className="settings-group">
      <legend>{label}</legend>
      <div className="choice-row">{children}</div>
    </fieldset>
  );
}

type ChoiceButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function ChoiceButton({ label, active, onClick }: ChoiceButtonProps) {
  return (
    <button className={`choice-button${active ? ' is-active' : ''}`} type="button" aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );
}

export type { FontSize, LineSpacing, ReadingWidth, Theme };

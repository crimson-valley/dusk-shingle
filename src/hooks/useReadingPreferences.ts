import { useEffect, useState } from 'react';

export type Theme = 'paper' | 'night';
export type FontSize = 'standard' | 'large';
export type ReadingWidth = 'standard' | 'wide';
export type LineSpacing = 'relaxed' | 'airy';

export type ReadingPreferences = {
  theme: Theme;
  fontSize: FontSize;
  width: ReadingWidth;
  lineSpacing: LineSpacing;
};

const storageKey = 'dusk-shingle-reading-preferences';

const defaultPreferences: ReadingPreferences = {
  theme: 'paper',
  fontSize: 'standard',
  width: 'standard',
  lineSpacing: 'relaxed',
};

function readPreferences(): ReadingPreferences {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return defaultPreferences;

    const parsed = JSON.parse(stored) as Partial<ReadingPreferences>;
    return {
      ...defaultPreferences,
      ...parsed,
      theme: parsed.theme === 'night' ? 'night' : 'paper',
      fontSize: parsed.fontSize === 'large' ? 'large' : 'standard',
      width: parsed.width === 'wide' ? 'wide' : 'standard',
      lineSpacing: parsed.lineSpacing === 'airy' ? 'airy' : 'relaxed',
    };
  } catch {
    return defaultPreferences;
  }
}

export function useReadingPreferences() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(readPreferences);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      // Preferences are an enhancement; reading remains available if storage is disabled.
    }
  }, [preferences]);

  function updatePreferences(update: Partial<ReadingPreferences>) {
    setPreferences((current) => ({ ...current, ...update }));
  }

  function toggleTheme() {
    updatePreferences({ theme: preferences.theme === 'paper' ? 'night' : 'paper' });
  }

  return { preferences, updatePreferences, toggleTheme };
}

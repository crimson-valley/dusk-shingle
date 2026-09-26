import { useEffect, useState } from 'react';

export function useReadingProgress(enabled: boolean) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let frame = 0;
    function updateProgress() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
        const nextProgress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
        setProgress(Math.min(1, Math.max(0, nextProgress)));
      });
    }

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, [enabled]);

  return progress;
}

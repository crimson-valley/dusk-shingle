import { useEffect, useState, type RefObject } from 'react';

/** Fraction of the referenced element that has scrolled past the bottom of the viewport. */
export function useReadingProgress(ref: RefObject<HTMLElement>, key: string) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const total = rect.height - window.innerHeight * 0.35;
        const seen = window.innerHeight * 0.65 - rect.top;
        setProgress(total > 0 ? Math.min(1, Math.max(0, seen / total)) : 0);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, key]);
  return progress;
}

import { useReadingProgress } from '../hooks/useReadingProgress';

type ProgressBarProps = {
  enabled: boolean;
};

export function ProgressBar({ enabled }: ProgressBarProps) {
  const progress = useReadingProgress(enabled);

  if (!enabled) return null;

  return (
    <div className="progress-track" aria-hidden="true">
      <div className="progress-value" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

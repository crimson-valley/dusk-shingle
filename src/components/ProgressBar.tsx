/** A single hairline along the top edge. Decorative: progress is also stated in text at the chapter end. */
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress" aria-hidden="true">
      <div className="progress-value" style={{ transform: `scaleX(${value})` }} />
    </div>
  );
}

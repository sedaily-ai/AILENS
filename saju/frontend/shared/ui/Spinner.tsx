interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function Spinner({ size = 'md', className = '', label }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-[3px]',
  }[size];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      <span
        className={`inline-block ${sizeClasses} rounded-full animate-spin border-gray-300 dark:border-gray-600 border-t-gray-700 dark:border-t-gray-100`}
        aria-hidden="true"
      />
      {label && <span className="text-[12px] text-gray-500 dark:text-gray-300">{label}</span>}
      {!label && <span className="sr-only">Loading…</span>}
    </div>
  );
}

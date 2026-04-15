// LoadingSpinner — shown while data is being fetched.
// TanStack Query surfaces isLoading automatically; this component gives it a visible form.
import { clsx } from 'clsx';

interface LoadingSpinnerProps {
  className?: string;
  fullPage?: boolean;
}

export function LoadingSpinner({ className, fullPage }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-gray-300 border-t-brand-600',
        'w-8 h-8',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );

  if (fullPage) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        {spinner}
      </div>
    );
  }

  return spinner;
}

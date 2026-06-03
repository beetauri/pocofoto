import { cn } from '@/lib/utils';

function Spinner({ className, ...props }) {
  return (
    <span
      data-slot="spinner"
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      role="status"
      aria-label="Loading"
      {...props}
    />
  );
}

export { Spinner };

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-14 w-full rounded-[var(--radius-md)] border border-border bg-control px-4 py-3 text-base font-bold text-foreground shadow-none transition-[border-color,box-shadow,background] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-55',
        className
      )}
      {...props}
    />
  );
}

export { Input };

import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-extrabold transition-[background,color,transform,box-shadow,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_16px_40px_var(--accent-glow)] hover:bg-primary/90',
        primary: 'bg-primary text-primary-foreground shadow-[0_16px_40px_var(--accent-glow)] hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        danger: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border border-border bg-background/70 text-foreground hover:bg-accent/10',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'bg-control text-foreground hover:bg-control-hover',
        link: 'text-primary underline-offset-4 hover:underline',
        icon: 'rounded-full bg-control text-foreground hover:bg-control-hover',
        mini: 'rounded-full bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90',
        cameraTool: 'rounded-full bg-black/34 text-white backdrop-blur-md hover:bg-black/50',
        nav: 'rounded-full bg-transparent text-muted-foreground hover:bg-white/8 data-[active=true]:text-foreground'
      },
      size: {
        default: 'h-12 px-5 py-3',
        sm: 'h-10 rounded-[var(--radius-sm)] px-4 text-xs',
        lg: 'h-14 rounded-[var(--radius-lg)] px-7 text-base',
        icon: 'size-12',
        'icon-sm': 'size-10',
        'icon-lg': 'size-14'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };

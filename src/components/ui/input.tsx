import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-12 w-full rounded-field border border-border-strong bg-surface-raised px-4 text-base',
        'text-fg placeholder:text-fg-subtle',
        'transition-colors duration-150 hover:border-primary-ring',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

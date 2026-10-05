import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

/** Placeholder block shown while content loads, so layout does not jump. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-sunken', className)}
      {...props}
    />
  );
}

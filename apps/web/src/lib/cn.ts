/**
 * Merge class names, last-wins on conflicts.
 *
 * The shadcn/ui convention, and it earns its place the moment a component
 * takes a `className` prop: `clsx` alone would produce `px-4 px-2`, where the
 * winner is whichever Tailwind emitted first rather than whichever the caller
 * asked for. `tailwind-merge` resolves that by understanding the utilities.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

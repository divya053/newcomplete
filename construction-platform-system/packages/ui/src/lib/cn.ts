import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely (later wins). The one styling primitive — no
 *  one-off inline styles (guardrail #8). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

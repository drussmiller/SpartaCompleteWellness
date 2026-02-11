import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDisplayName(user: { preferredName?: string | null; username?: string } | null | undefined): string {
  if (!user) return "Unknown User";
  return user.preferredName || user.username || "Unknown User";
}

export function getDisplayInitial(user: { preferredName?: string | null; username?: string } | null | undefined): string {
  if (!user) return "U";
  const name = user.preferredName || user.username;
  return name?.[0]?.toUpperCase() || "U";
}

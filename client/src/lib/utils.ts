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

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length > 10) {
    const countryCode = digits.slice(0, digits.length - 10);
    const national = digits.slice(-10);
    return `+${countryCode} (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return phone;
}

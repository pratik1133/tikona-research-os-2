import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge Tailwind classes with clsx
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format date for display
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format date with time
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Get initials from email
export function getInitials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Validate ISIN format (12 characters: 2 letters + 10 alphanumeric)
export function validateISIN(isin: string): boolean {
  const isinRegex = /^[A-Z]{2}[A-Z0-9]{10}$/;
  return isinRegex.test(isin.toUpperCase());
}

// Validate BSE code (numeric, typically 6 digits)
export function validateBSECode(code: string): boolean {
  return /^\d{1,6}$/.test(code);
}

// Force uppercase transformation
export function toUpperCase(value: string): string {
  return value.toUpperCase();
}

// Debounce function for search
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Format currency in Indian notation (lakhs/crores)
export function formatIndianCurrency(value: number | null): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// Format number with optional suffix
export function formatMetric(value: number | null, suffix = ''): string {
  if (value == null) return '—';
  return `${value.toFixed(2)}${suffix}`;
}

// Truncate text with ellipsis
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

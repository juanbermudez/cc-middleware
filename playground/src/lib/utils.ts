import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "0";
  }
  return new Intl.NumberFormat().format(value);
}

export function formatTimestamp(value: number | string | undefined): string {
  if (!value) {
    return "Unavailable";
  }

  const date = typeof value === "number"
    ? new Date(value)
    : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function truncate(value: string | undefined, max = 120): string {
  if (!value) {
    return "";
  }
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// src/utils/formatDate.ts
// Simple helpers for formatting dates for display in TrayFlow.

export function formatDisplayDate(value: string | Date | null | undefined): string {
  if (!value) return "";

  // If we were passed a Date object, convert it to YYYY-MM-DD in local time
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${mm}-${dd}-${yyyy}`;
  }

  // value is a string
  const str = String(value);

  // Handle ISO strings like "2025-12-10T00:00:00.000Z"
  const parts = str.split("T")[0].split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) {
      return `${month}-${day}-${year}`;
    }
  }

  // Fallback – if it’s some other format, just show it as-is.
  return str;
}

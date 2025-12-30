// src/utils/formatDate.ts
// Simple helpers for formatting dates for display in TrayFlow.

/**
 * Convert a date string like "2025-12-10" to "12-10-2025".
 * If the input is missing or not in the expected format, we
 * just return the original string so we never crash the app.
 */
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "";

  // Handle plain "YYYY-MM-DD" (what <input type="date"> gives us)
  const parts = value.split("T")[0].split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) {
      return `${month}-${day}-${year}`;
    }
  }

  // Fallback – if it’s some other format, just show it as-is.
  return value;
}

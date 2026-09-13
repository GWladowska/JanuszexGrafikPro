import { weekStartOf } from "@/lib/week";

export type ScheduleFieldParseResult = { value: string; fieldError: null } | { value: null; fieldError: string };

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WEEK_START_ERROR = "Podaj poniedziałek wybranego tygodnia w formacie RRRR-MM-DD.";

export function parseWeekStart(raw: unknown): ScheduleFieldParseResult {
  if (typeof raw !== "string") {
    return { value: null, fieldError: WEEK_START_ERROR };
  }
  const value = raw.trim();
  if (!WEEK_START_PATTERN.test(value)) {
    return { value: null, fieldError: WEEK_START_ERROR };
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  const isRealDate = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  if (!isRealDate || weekStartOf(value) !== value) {
    return { value: null, fieldError: WEEK_START_ERROR };
  }
  return { value, fieldError: null };
}

export function parseAssignmentId(raw: unknown): ScheduleFieldParseResult {
  if (typeof raw !== "string" || !UUID_PATTERN.test(raw.trim())) {
    return { value: null, fieldError: "Nieprawidłowy identyfikator przypisania." };
  }
  return { value: raw.trim(), fieldError: null };
}

export function parseEmployeeId(raw: unknown): ScheduleFieldParseResult {
  if (typeof raw !== "string" || !UUID_PATTERN.test(raw.trim())) {
    return { value: null, fieldError: "Nieprawidłowy identyfikator pracownika." };
  }
  return { value: raw.trim(), fieldError: null };
}

import { weekStartOf } from "@/lib/week";

export type ScheduleFieldParseResult = { value: string; fieldError: null } | { value: null; fieldError: string };

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEK_START_ERROR = "Podaj poniedziałek wybranego tygodnia w formacie RRRR-MM-DD.";
const WORK_DATE_ERROR = "Podaj datę zmiany w formacie RRRR-MM-DD.";
const TIME_ERROR = "Podaj godzinę w formacie GG:MM (np. 08:30).";

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

export function parseShiftTime(raw: unknown): ScheduleFieldParseResult {
  if (typeof raw !== "string" || !TIME_PATTERN.test(raw.trim())) {
    return { value: null, fieldError: TIME_ERROR };
  }
  return { value: raw.trim(), fieldError: null };
}

export function parseWorkDate(raw: unknown): ScheduleFieldParseResult {
  if (typeof raw !== "string") {
    return { value: null, fieldError: WORK_DATE_ERROR };
  }
  const value = raw.trim();
  if (!WEEK_START_PATTERN.test(value)) {
    return { value: null, fieldError: WORK_DATE_ERROR };
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  const isRealDate = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  if (!isRealDate) {
    return { value: null, fieldError: WORK_DATE_ERROR };
  }
  return { value, fieldError: null };
}

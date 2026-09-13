import { parseTime } from "@/lib/services/business-validation";

export interface AvailabilityInput {
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
}

export type AvailabilityFieldParseResult = { value: string; fieldError: null } | { value: null; fieldError: string };

const WORK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseWorkDate(raw: unknown): AvailabilityFieldParseResult {
  if (typeof raw !== "string") {
    return { value: null, fieldError: "Data jest wymagana." };
  }
  const value = raw.trim();
  if (!WORK_DATE_PATTERN.test(value)) {
    return { value: null, fieldError: "Podaj datę w formacie RRRR-MM-DD." };
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { value: null, fieldError: "Podaj poprawną datę." };
  }
  return { value, fieldError: null };
}

export function parseAvailabilityTime(raw: unknown): AvailabilityFieldParseResult {
  const value = parseTime(raw);
  if (value === null) {
    return { value: null, fieldError: "Podaj godzinę w formacie HH:MM." };
  }
  return { value, fieldError: null };
}

export function validateTimeRange(startTime: string, endTime: string): string | null {
  if (endTime <= startTime) {
    return "Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.";
  }
  return null;
}

export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

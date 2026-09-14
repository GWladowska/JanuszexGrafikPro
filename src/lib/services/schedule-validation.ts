import type { DraftInput, DraftPiece } from "@/lib/services/schedule-generation";
import { weekStartOf } from "@/lib/week";

export type ScheduleFieldParseResult = { value: string; fieldError: null } | { value: null; fieldError: string };

export type ScheduleInputParseResult<T> = { data: T; error: null } | { data: null; error: string };

export interface ScheduleAssignmentShape {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
}

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEK_START_ERROR = "Podaj poniedziałek wybranego tygodnia w formacie RRRR-MM-DD.";
const WORK_DATE_ERROR = "Podaj datę zmiany w formacie RRRR-MM-DD.";
const TIME_ERROR = "Podaj godzinę w formacie GG:MM (np. 08:30).";
const INPUT_SHAPE_ERROR = "Dane grafiku mają nieprawidłowy kształt.";
const EMPLOYEE_NAME_ERROR = "Pracownik z listy nie ma nazwy.";
const WEEKDAY_ERROR = "Nieprawidłowy dzień tygodnia w godzinach otwarcia.";
const OPENING_RANGE_ERROR = "Godzina zamknięcia musi być późniejsza niż godzina otwarcia.";
const TIME_RANGE_ERROR = "Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.";

function readField(entry: unknown, key: string): unknown {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  return (entry as Record<string, unknown>)[key];
}

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

function parseSchedulePieces(raw: unknown): ScheduleInputParseResult<DraftPiece[]> {
  if (!Array.isArray(raw)) {
    return { data: null, error: INPUT_SHAPE_ERROR };
  }
  const pieces: DraftPiece[] = [];
  for (const entry of raw) {
    const employeeId = parseEmployeeId(readField(entry, "employeeId"));
    if (employeeId.fieldError !== null) {
      return { data: null, error: employeeId.fieldError };
    }
    const workDate = parseWorkDate(readField(entry, "workDate"));
    if (workDate.fieldError !== null) {
      return { data: null, error: workDate.fieldError };
    }
    const startTime = parseShiftTime(readField(entry, "startTime"));
    if (startTime.fieldError !== null) {
      return { data: null, error: startTime.fieldError };
    }
    const endTime = parseShiftTime(readField(entry, "endTime"));
    if (endTime.fieldError !== null) {
      return { data: null, error: endTime.fieldError };
    }
    if (endTime.value <= startTime.value) {
      return { data: null, error: TIME_RANGE_ERROR };
    }
    pieces.push({
      employeeId: employeeId.value,
      workDate: workDate.value,
      startTime: startTime.value,
      endTime: endTime.value,
    });
  }
  return { data: pieces, error: null };
}

export function parseScheduleEmployees(raw: unknown): ScheduleInputParseResult<DraftInput["employees"]> {
  if (!Array.isArray(raw)) {
    return { data: null, error: INPUT_SHAPE_ERROR };
  }
  const employees: DraftInput["employees"] = [];
  for (const entry of raw) {
    const id = parseEmployeeId(readField(entry, "id"));
    if (id.fieldError !== null) {
      return { data: null, error: id.fieldError };
    }
    const name = readField(entry, "name");
    if (typeof name !== "string" || name.trim().length === 0) {
      return { data: null, error: EMPLOYEE_NAME_ERROR };
    }
    employees.push({ id: id.value, name });
  }
  return { data: employees, error: null };
}

export function parseScheduleOpeningHours(raw: unknown): ScheduleInputParseResult<DraftInput["openingHours"]> {
  if (!Array.isArray(raw)) {
    return { data: null, error: INPUT_SHAPE_ERROR };
  }
  const openingHours: DraftInput["openingHours"] = [];
  for (const entry of raw) {
    const weekday = readField(entry, "weekday");
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      return { data: null, error: WEEKDAY_ERROR };
    }
    const opensAt = parseShiftTime(readField(entry, "opensAt"));
    if (opensAt.fieldError !== null) {
      return { data: null, error: opensAt.fieldError };
    }
    const closesAt = parseShiftTime(readField(entry, "closesAt"));
    if (closesAt.fieldError !== null) {
      return { data: null, error: closesAt.fieldError };
    }
    if (closesAt.value <= opensAt.value) {
      return { data: null, error: OPENING_RANGE_ERROR };
    }
    openingHours.push({ weekday, opensAt: opensAt.value, closesAt: closesAt.value });
  }
  return { data: openingHours, error: null };
}

export function parseScheduleAvailabilities(raw: unknown): ScheduleInputParseResult<DraftInput["availabilities"]> {
  return parseSchedulePieces(raw);
}

export function parseScheduleDraftPieces(raw: unknown): ScheduleInputParseResult<DraftPiece[]> {
  return parseSchedulePieces(raw);
}

export function parseScheduleAssignmentRows(raw: unknown): ScheduleInputParseResult<ScheduleAssignmentShape[]> {
  if (!Array.isArray(raw)) {
    return { data: null, error: INPUT_SHAPE_ERROR };
  }
  const assignments: ScheduleAssignmentShape[] = [];
  for (const entry of raw) {
    const id = parseAssignmentId(readField(entry, "id"));
    if (id.fieldError !== null) {
      return { data: null, error: id.fieldError };
    }
    const employeeId = parseEmployeeId(readField(entry, "employee_id"));
    if (employeeId.fieldError !== null) {
      return { data: null, error: employeeId.fieldError };
    }
    const workDate = parseWorkDate(readField(entry, "work_date"));
    if (workDate.fieldError !== null) {
      return { data: null, error: workDate.fieldError };
    }
    const startTime = parseShiftTime(readField(entry, "start_time"));
    if (startTime.fieldError !== null) {
      return { data: null, error: startTime.fieldError };
    }
    const endTime = parseShiftTime(readField(entry, "end_time"));
    if (endTime.fieldError !== null) {
      return { data: null, error: endTime.fieldError };
    }
    if (endTime.value <= startTime.value) {
      return { data: null, error: TIME_RANGE_ERROR };
    }
    assignments.push({
      id: id.value,
      employee_id: employeeId.value,
      work_date: workDate.value,
      start_time: startTime.value,
      end_time: endTime.value,
    });
  }
  return { data: assignments, error: null };
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type OpeningHoursDay =
  | { weekday: Weekday; opensAt: string; closesAt: string }
  | { weekday: Weekday; closed: true };

export type OpenDay = Extract<OpeningHoursDay, { opensAt: string }>;
export type ClosedDay = Extract<OpeningHoursDay, { closed: true }>;

export function isOpenDay(day: OpeningHoursDay): day is OpenDay {
  return !("closed" in day);
}

export function isClosedDay(day: OpeningHoursDay): day is ClosedDay {
  return "closed" in day;
}

export type OpeningWeekFieldErrors = Record<string, string>;

export type BusinessNameParseResult = { value: string; fieldError: null } | { value: null; fieldError: string };

export type OpeningWeekParseResult =
  | { value: OpeningHoursDay[]; fieldErrors: null }
  | { value: null; fieldErrors: OpeningWeekFieldErrors };

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2})?$/;
const BUSINESS_NAME_MAX_LENGTH = 120;

function readField(entry: unknown, key: string): unknown {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  return (entry as Record<string, unknown>)[key];
}

export function parseBusinessName(name: unknown): BusinessNameParseResult {
  if (typeof name !== "string") {
    return { value: null, fieldError: "Nazwa biznesu jest wymagana." };
  }
  const value = name.trim();
  if (value.length === 0) {
    return { value: null, fieldError: "Nazwa biznesu jest wymagana." };
  }
  if (value.length > BUSINESS_NAME_MAX_LENGTH) {
    return { value: null, fieldError: "Nazwa biznesu może mieć najwyżej 120 znaków." };
  }
  return { value, fieldError: null };
}

export function parseTime(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const match = TIME_PATTERN.exec(raw.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

export function parseOpeningWeek(raw: unknown): OpeningWeekParseResult {
  if (!Array.isArray(raw)) {
    return { value: null, fieldErrors: { form: "Nieprawidłowy format godzin otwarcia." } };
  }

  const value: OpeningHoursDay[] = [];
  const fieldErrors: OpeningWeekFieldErrors = {};
  const seenWeekdays = new Set<Weekday>();

  for (const entry of raw) {
    const rawWeekday = readField(entry, "weekday");
    if (typeof rawWeekday !== "number" || !Number.isInteger(rawWeekday) || !WEEKDAYS.includes(rawWeekday as Weekday)) {
      return { value: null, fieldErrors: { form: "Nieprawidłowy dzień tygodnia w godzinach otwarcia." } };
    }
    const weekday = rawWeekday as Weekday;
    const key = String(weekday);

    if (seenWeekdays.has(weekday)) {
      fieldErrors[key] = "Ten dzień tygodnia występuje więcej niż raz.";
      continue;
    }
    seenWeekdays.add(weekday);

    if (readField(entry, "closed") === true) {
      value.push({ weekday, closed: true });
      continue;
    }

    const opensAt = parseTime(readField(entry, "opensAt"));
    const closesAt = parseTime(readField(entry, "closesAt"));
    if (opensAt === null || closesAt === null) {
      fieldErrors[key] = "Podaj godziny otwarcia i zamknięcia w formacie HH:MM.";
      continue;
    }
    if (closesAt <= opensAt) {
      fieldErrors[key] = "Godzina zamknięcia musi być późniejsza niż godzina otwarcia.";
      continue;
    }
    value.push({ weekday, opensAt, closesAt });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { value: null, fieldErrors };
  }
  return { value, fieldErrors: null };
}

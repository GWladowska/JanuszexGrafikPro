const WEEKDAY_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"] as const;

const WEEKDAY_LONG = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"] as const;

const dayFormatter = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw" });

const warsawDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" });

function parseUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const parsed = parseUtcDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatIsoDate(parsed);
}

export function nextMonday(from: string): string {
  const parsed = parseUtcDate(from);
  const daysUntilNextMonday = (8 - parsed.getUTCDay()) % 7 || 7;
  return addDays(from, daysUntilNextMonday);
}

export function isoWeekday(date: string): number {
  return ((parseUtcDate(date).getUTCDay() + 6) % 7) + 1;
}

export function weekStartOf(date: string): string {
  const parsed = parseUtcDate(date);
  const isoWeekday = (parsed.getUTCDay() + 6) % 7;
  return addDays(date, -isoWeekday);
}

export function weekdayShort(date: string): (typeof WEEKDAY_SHORT)[number] {
  return WEEKDAY_SHORT[parseUtcDate(date).getUTCDay()];
}

export function weekdayLong(date: string): (typeof WEEKDAY_LONG)[number] {
  return WEEKDAY_LONG[parseUtcDate(date).getUTCDay()];
}

export function formatDayLabel(date: string): string {
  return dayFormatter.format(parseUtcDate(date));
}

export function formatWeekLabel(weekStart: string): string {
  return `Pn ${formatDayLabel(weekStart)} – Nd ${formatDayLabel(addDays(weekStart, 6))}`;
}

export function todayInWarsaw(now: Date = new Date()): string {
  return warsawDateFormatter.format(now);
}

export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(todayInWarsaw(now));
}

export function isFrozenWeek(weekStart: string, reference: string = currentWeekStart()): boolean {
  return weekStart <= reference;
}

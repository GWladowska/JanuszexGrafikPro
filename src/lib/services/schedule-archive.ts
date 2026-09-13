import type { OpenDay } from "@/lib/services/business-validation";
import { WEEKDAYS } from "@/lib/services/business-validation";

export function parseOpeningHoursSnapshot(value: unknown): OpenDay[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const days: OpenDay[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const { weekday, opensAt, closesAt } = entry as Record<string, unknown>;
    if (typeof weekday !== "number" || !WEEKDAYS.includes(weekday as OpenDay["weekday"])) {
      return null;
    }
    if (typeof opensAt !== "string" || typeof closesAt !== "string") {
      return null;
    }
    days.push({ weekday: weekday as OpenDay["weekday"], opensAt, closesAt });
  }
  return days;
}

export function resolveOpeningHours(current: OpenDay[], snapshot: unknown, useSnapshot: boolean): OpenDay[] {
  if (!useSnapshot) {
    return current;
  }
  const parsed = parseOpeningHoursSnapshot(snapshot);
  if (parsed !== null) {
    return parsed;
  }
  if (snapshot !== null && snapshot !== undefined) {
    // eslint-disable-next-line no-console
    console.warn("[schedule-archive] Nieprawidłowa kopia godzin otwarcia — używam bieżących godzin.");
  }
  return current;
}

import { isOpenDay, type OpeningHoursDay, type Weekday } from "@/lib/services/business-validation";

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Pn",
  2: "Wt",
  3: "Śr",
  4: "Cz",
  5: "Pt",
  6: "So",
  7: "Nd",
};

export function defaultWeek(): OpeningHoursDay[] {
  return WEEKDAYS.map((weekday) =>
    weekday <= 5 ? { weekday, opensAt: "09:00", closesAt: "17:00" } : { weekday, closed: true },
  );
}

export function fillClosedDays(openDays: OpeningHoursDay[]): OpeningHoursDay[] {
  return WEEKDAYS.map((weekday) => {
    const open = openDays.find((day) => isOpenDay(day) && day.weekday === weekday);
    return open ?? { weekday, closed: true };
  });
}

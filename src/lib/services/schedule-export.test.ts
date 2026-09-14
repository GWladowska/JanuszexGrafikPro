import { describe, expect, it } from "vitest";

import { buildScheduleDays, buildScheduleText, type ScheduleExportInput } from "@/lib/services/schedule-export";

const WEEK_START = "2026-03-30";

function makeInput(overrides: Partial<ScheduleExportInput> = {}): ScheduleExportInput {
  return {
    weekStart: WEEK_START,
    employees: [{ id: "e1", name: "Anna" }],
    openingHours: [{ weekday: 1, opensAt: "08:00", closesAt: "16:00" }],
    assignments: [{ employeeId: "e1", workDate: WEEK_START, startTime: "08:00", endTime: "14:00" }],
    ...overrides,
  };
}

describe("buildScheduleDays", () => {
  it("zwraca dokładnie 7 dni w kolejności Pn–Nd licząc od weekStart", () => {
    const days = buildScheduleDays(makeInput());

    expect(days.map((day) => day.workDate)).toEqual([
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
    ]);
  });

  it("oznacza jako nieczynny dzień bez wpisu w godzinach otwarcia, zachowując jego pozycję", () => {
    const days = buildScheduleDays(makeInput());

    expect(days[0].closed).toBe(false);
    expect(days.slice(1).map((day) => day.closed)).toEqual([true, true, true, true, true, true]);
    expect(days.slice(1).every((day) => day.shifts.length === 0)).toBe(true);
  });

  it("zwraca otwarty dzień bez zmian, gdy nie ma przypisań", () => {
    const days = buildScheduleDays(makeInput({ assignments: [] }));

    expect(days[0]).toEqual({ workDate: WEEK_START, closed: false, shifts: [] });
  });

  it("podstawia myślnik, gdy nie znamy nazwiska pracownika", () => {
    const days = buildScheduleDays(makeInput({ employees: [] }));

    expect(days[0].shifts).toEqual([{ name: "—", startTime: "08:00", endTime: "14:00" }]);
  });

  it("sortuje zmiany w dniu po godzinie rozpoczęcia", () => {
    const days = buildScheduleDays(
      makeInput({
        assignments: [
          { employeeId: "e1", workDate: WEEK_START, startTime: "12:00", endTime: "16:00" },
          { employeeId: "e1", workDate: WEEK_START, startTime: "08:00", endTime: "10:00" },
          { employeeId: "e1", workDate: WEEK_START, startTime: "10:00", endTime: "12:00" },
        ],
      }),
    );

    expect(days[0].shifts.map((shift) => shift.startTime)).toEqual(["08:00", "10:00", "12:00"]);
  });

  it("nie miesza przypisań z innych dni tygodnia", () => {
    const days = buildScheduleDays(
      makeInput({
        openingHours: [
          { weekday: 1, opensAt: "08:00", closesAt: "16:00" },
          { weekday: 3, opensAt: "08:00", closesAt: "20:00" },
        ],
        assignments: [
          { employeeId: "e1", workDate: WEEK_START, startTime: "08:00", endTime: "14:00" },
          { employeeId: "e1", workDate: "2026-04-01", startTime: "08:00", endTime: "12:00" },
        ],
      }),
    );

    expect(days[0].shifts).toHaveLength(1);
    expect(days[2].shifts).toHaveLength(1);
  });
});

describe("buildScheduleText", () => {
  it("składa dokładnie oczekiwany tekst w wariancie bez formatowania", () => {
    const { plain } = buildScheduleText(makeInput());

    expect(plain).toBe(
      [
        "Pn 30.03 – Nd 05.04",
        "",
        "Poniedziałek 30.03",
        "Anna · 08:00 – 14:00",
        "",
        "Wtorek 31.03 — nieczynne",
        "",
        "Środa 01.04 — nieczynne",
        "",
        "Czwartek 02.04 — nieczynne",
        "",
        "Piątek 03.04 — nieczynne",
        "",
        "Sobota 04.04 — nieczynne",
        "",
        "Niedziela 05.04 — nieczynne",
      ].join("\n"),
    );
  });

  it("nie dokleja końcowego znaku nowej linii", () => {
    const { plain, formatted } = buildScheduleText(makeInput());

    expect(plain.endsWith("\n")).toBe(false);
    expect(formatted.endsWith("\n")).toBe(false);
  });

  it("wariant z formatowaniem różni się od bez formatowania wyłącznie znacznikami", () => {
    const { plain, formatted } = buildScheduleText(makeInput());

    expect(formatted).toContain("*Pn 30.03 – Nd 05.04*");
    expect(formatted).toContain("Anna · `08:00 – 14:00`");
    expect(plain).not.toContain("*");
    expect(plain).not.toContain("`");
    expect(formatted.replaceAll("*", "").replaceAll("`", "")).toBe(plain);
  });

  it("dla pustego tygodnia wypisuje nagłówek i siedem dni nieczynnych", () => {
    const { plain } = buildScheduleText(makeInput({ openingHours: [], assignments: [] }));

    const lines = plain.split("\n");
    expect(lines[0]).toBe("Pn 30.03 – Nd 05.04");
    expect(lines.filter((line) => line.endsWith("— nieczynne"))).toHaveLength(7);
  });

  it("zostawia sam nagłówek dnia, gdy dzień jest otwarty, ale bez zmian", () => {
    const { plain } = buildScheduleText(makeInput({ assignments: [] }));

    expect(plain).toContain("Poniedziałek 30.03\n\n");
  });
});

import { describe, expect, it } from "vitest";

import {
  parseScheduleAssignmentRows,
  parseScheduleAvailabilities,
  parseScheduleDraftPieces,
  parseScheduleEmployees,
  parseScheduleOpeningHours,
} from "@/lib/services/schedule-validation";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_B = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT_A = "33333333-3333-4333-8333-333333333333";

describe("parseScheduleEmployees", () => {
  it("przepuszcza poprawną listę i zawęża ją do identyfikatora i nazwy", () => {
    const result = parseScheduleEmployees([
      { id: EMPLOYEE_A, name: "Janusz", contact_email: "janusz@example.com" },
      { id: EMPLOYEE_B, name: "Grażyna" },
    ]);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { id: EMPLOYEE_A, name: "Janusz" },
      { id: EMPLOYEE_B, name: "Grażyna" },
    ]);
  });

  it("odrzuca wartość, która nie jest listą", () => {
    expect(parseScheduleEmployees(null).error).not.toBeNull();
    expect(parseScheduleEmployees({ id: EMPLOYEE_A }).error).not.toBeNull();
  });

  it("odrzuca wpis bez poprawnego identyfikatora", () => {
    expect(parseScheduleEmployees([{ id: "not-a-uuid", name: "Janusz" }]).error).not.toBeNull();
    expect(parseScheduleEmployees([{ name: "Janusz" }]).error).not.toBeNull();
  });

  it("odrzuca wpis bez nazwy", () => {
    expect(parseScheduleEmployees([{ id: EMPLOYEE_A }]).error).not.toBeNull();
    expect(parseScheduleEmployees([{ id: EMPLOYEE_A, name: "" }]).error).not.toBeNull();
    expect(parseScheduleEmployees([{ id: EMPLOYEE_A, name: "   " }]).error).not.toBeNull();
  });
});

describe("parseScheduleOpeningHours", () => {
  it("przepuszcza poprawne godziny otwarcia", () => {
    const result = parseScheduleOpeningHours([
      { weekday: 1, opensAt: "08:00", closesAt: "16:00" },
      { weekday: 7, opensAt: "10:00", closesAt: "14:00" },
    ]);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { weekday: 1, opensAt: "08:00", closesAt: "16:00" },
      { weekday: 7, opensAt: "10:00", closesAt: "14:00" },
    ]);
  });

  it("odrzuca dzień tygodnia poza zakresem 1-7", () => {
    expect(parseScheduleOpeningHours([{ weekday: 0, opensAt: "08:00", closesAt: "16:00" }]).error).not.toBeNull();
    expect(parseScheduleOpeningHours([{ weekday: 8, opensAt: "08:00", closesAt: "16:00" }]).error).not.toBeNull();
    expect(parseScheduleOpeningHours([{ weekday: 1.5, opensAt: "08:00", closesAt: "16:00" }]).error).not.toBeNull();
    expect(parseScheduleOpeningHours([{ weekday: "1", opensAt: "08:00", closesAt: "16:00" }]).error).not.toBeNull();
  });

  it("odrzuca brak godziny otwarcia", () => {
    expect(parseScheduleOpeningHours([{ weekday: 1, closesAt: "16:00" }]).error).not.toBeNull();
  });

  it("odrzuca zamknięcie wcześniejsze lub równe otwarciu", () => {
    expect(parseScheduleOpeningHours([{ weekday: 1, opensAt: "16:00", closesAt: "08:00" }]).error).not.toBeNull();
    expect(parseScheduleOpeningHours([{ weekday: 1, opensAt: "08:00", closesAt: "08:00" }]).error).not.toBeNull();
  });

  it("odrzuca czas z sekundami i bez zero-paddingu", () => {
    expect(parseScheduleOpeningHours([{ weekday: 1, opensAt: "08:00:00", closesAt: "16:00" }]).error).not.toBeNull();
    expect(parseScheduleOpeningHours([{ weekday: 1, opensAt: "8:00", closesAt: "16:00" }]).error).not.toBeNull();
  });
});

describe("parseScheduleAvailabilities", () => {
  it("przepuszcza poprawne dostępności", () => {
    const result = parseScheduleAvailabilities([
      { employeeId: EMPLOYEE_A, workDate: "2026-03-30", startTime: "08:00", endTime: "12:00" },
    ]);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { employeeId: EMPLOYEE_A, workDate: "2026-03-30", startTime: "08:00", endTime: "12:00" },
    ]);
  });

  it("odrzuca wiersze w kształcie snake_case zamiast przepuścić pusty grafik", () => {
    const result = parseScheduleAvailabilities([
      { employee_id: EMPLOYEE_A, work_date: "2026-03-30", start_time: "08:00", end_time: "12:00" },
    ]);

    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  it("odrzuca datę, która nie istnieje w kalendarzu", () => {
    expect(
      parseScheduleAvailabilities([
        { employeeId: EMPLOYEE_A, workDate: "2026-02-30", startTime: "08:00", endTime: "12:00" },
      ]).error,
    ).not.toBeNull();
  });

  it("odrzuca brak daty pracy", () => {
    expect(
      parseScheduleAvailabilities([{ employeeId: EMPLOYEE_A, startTime: "08:00", endTime: "12:00" }]).error,
    ).not.toBeNull();
  });

  it("odrzuca koniec wcześniejszy lub równy początkowi", () => {
    const base = { employeeId: EMPLOYEE_A, workDate: "2026-03-30" };
    expect(parseScheduleAvailabilities([{ ...base, startTime: "12:00", endTime: "08:00" }]).error).not.toBeNull();
    expect(parseScheduleAvailabilities([{ ...base, startTime: "08:00", endTime: "08:00" }]).error).not.toBeNull();
  });
});

describe("parseScheduleDraftPieces", () => {
  it("przepuszcza poprawne przypisania", () => {
    const result = parseScheduleDraftPieces([
      { employeeId: EMPLOYEE_A, workDate: "2026-03-30", startTime: "08:00", endTime: "16:00" },
    ]);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it("odrzuca identyfikator pracownika, który nie jest UUID", () => {
    expect(
      parseScheduleDraftPieces([{ employeeId: "janusz", workDate: "2026-03-30", startTime: "08:00", endTime: "16:00" }])
        .error,
    ).not.toBeNull();
  });
});

describe("parseScheduleAssignmentRows", () => {
  it("przepuszcza poprawne wiersze bazy", () => {
    const result = parseScheduleAssignmentRows([
      {
        id: ASSIGNMENT_A,
        employee_id: EMPLOYEE_A,
        work_date: "2026-03-30",
        start_time: "08:00",
        end_time: "16:00",
      },
    ]);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: ASSIGNMENT_A,
        employee_id: EMPLOYEE_A,
        work_date: "2026-03-30",
        start_time: "08:00",
        end_time: "16:00",
      },
    ]);
  });

  it("odrzuca wiersz bez identyfikatora przypisania", () => {
    expect(
      parseScheduleAssignmentRows([
        { employee_id: EMPLOYEE_A, work_date: "2026-03-30", start_time: "08:00", end_time: "16:00" },
      ]).error,
    ).not.toBeNull();
  });

  it("odrzuca wiersz z kluczami camelCase zamiast przepuścić pusty grafik", () => {
    const result = parseScheduleAssignmentRows([
      { id: ASSIGNMENT_A, employeeId: EMPLOYEE_A, workDate: "2026-03-30", startTime: "08:00", endTime: "16:00" },
    ]);

    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  it("odrzuca czas z sekundami", () => {
    expect(
      parseScheduleAssignmentRows([
        {
          id: ASSIGNMENT_A,
          employee_id: EMPLOYEE_A,
          work_date: "2026-03-30",
          start_time: "08:00:00",
          end_time: "16:00:00",
        },
      ]).error,
    ).not.toBeNull();
  });
});

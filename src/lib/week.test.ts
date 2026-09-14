import { describe, expect, it } from "vitest";

import {
  addDays,
  currentWeekStart,
  formatDayLabel,
  formatWeekLabel,
  isFrozenWeek,
  isoWeekday,
  nextMonday,
  todayInWarsaw,
  weekStartOf,
  weekdayLong,
  weekdayShort,
} from "@/lib/week";

const MONDAY = "2026-03-23";
const WEEK_OF_MONDAY = [
  "2026-03-23",
  "2026-03-24",
  "2026-03-25",
  "2026-03-26",
  "2026-03-27",
  "2026-03-28",
  "2026-03-29",
] as const;

describe("weekStartOf", () => {
  it("sprowadza każdy dzień tygodnia do tego samego poniedziałku", () => {
    for (const date of WEEK_OF_MONDAY) {
      expect(weekStartOf(date)).toBe(MONDAY);
    }
  });

  it("traktuje niedzielę jako ostatni dzień tygodnia, nie pierwszy", () => {
    expect(weekStartOf("2026-03-29")).toBe("2026-03-23");
  });

  it("zwraca poniedziałek poprzedniego roku dla tygodnia na przełomie roku", () => {
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29");
    expect(weekStartOf("2026-01-04")).toBe("2025-12-29");
  });

  it("zwrócona data jest zawsze poniedziałkiem", () => {
    for (const date of ["2026-01-01", "2026-03-29", "2026-10-25", "2028-02-29", "2026-12-31"]) {
      expect(isoWeekday(weekStartOf(date))).toBe(1);
    }
  });
});

describe("isoWeekday", () => {
  it("numeruje dni od poniedziałku = 1 do niedzieli = 7", () => {
    expect(WEEK_OF_MONDAY.map((date) => isoWeekday(date))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("zwraca 7 dla niedzieli będącej dniem zmiany czasu", () => {
    expect(isoWeekday("2026-03-29")).toBe(7);
    expect(isoWeekday("2026-10-25")).toBe(7);
  });
});

describe("addDays", () => {
  it("przechodzi przez granicę miesiąca", () => {
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
  });

  it("przechodzi przez granicę roku w obie strony", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("obsługuje dzień przestępny", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("dodaje 6 dni niezależnie od zmiany czasu", () => {
    expect(addDays("2026-03-23", 6)).toBe("2026-03-29");
    expect(addDays("2026-10-19", 6)).toBe("2026-10-25");
  });
});

describe("nextMonday", () => {
  it("z poniedziałku zwraca poniedziałek następnego tygodnia", () => {
    expect(nextMonday("2026-03-30")).toBe("2026-04-06");
  });

  it("z pozostałych dni zwraca najbliższy poniedziałek", () => {
    expect(nextMonday("2026-03-29")).toBe("2026-03-30");
    expect(nextMonday("2026-01-01")).toBe("2026-01-05");
  });
});

describe("weekdayShort i weekdayLong", () => {
  it("zwracają polskie nazwy w kolejności Pn–Nd", () => {
    expect(WEEK_OF_MONDAY.map((date) => weekdayShort(date))).toEqual(["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]);
    expect(WEEK_OF_MONDAY.map((date) => weekdayLong(date))).toEqual([
      "Poniedziałek",
      "Wtorek",
      "Środa",
      "Czwartek",
      "Piątek",
      "Sobota",
      "Niedziela",
    ]);
  });
});

describe("formatDayLabel i formatWeekLabel", () => {
  it("formatuje dzień jako DD.MM", () => {
    expect(formatDayLabel("2026-03-29")).toBe("29.03");
    expect(formatDayLabel("2027-01-03")).toBe("03.01");
  });

  it("formatuje tydzień jako Pn DD.MM – Nd DD.MM, także na przełomie roku", () => {
    expect(formatWeekLabel("2026-03-30")).toBe("Pn 30.03 – Nd 05.04");
    expect(formatWeekLabel("2026-12-28")).toBe("Pn 28.12 – Nd 03.01");
  });
});

describe("todayInWarsaw", () => {
  it("zwraca datę w strefie Europe/Warsaw, nie w strefie serwera", () => {
    expect(todayInWarsaw(new Date("2026-03-29T00:30:00Z"))).toBe("2026-03-29");
    expect(todayInWarsaw(new Date("2026-03-29T23:30:00Z"))).toBe("2026-03-30");
  });

  it("przeskakuje na kolejny dzień po warszawskiej północy także przy zmianie czasu", () => {
    expect(todayInWarsaw(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(todayInWarsaw(new Date("2026-09-13T23:30:00Z"))).toBe("2026-09-14");
  });
});

describe("currentWeekStart", () => {
  it("liczy tydzień od poniedziałku w strefie Europe/Warsaw", () => {
    expect(currentWeekStart(new Date("2026-03-29T12:00:00Z"))).toBe("2026-03-23");
    expect(currentWeekStart(new Date("2026-03-29T23:30:00Z"))).toBe("2026-03-30");
  });
});

describe("isFrozenWeek", () => {
  const reference = "2026-03-30";

  it("zamraża tygodnie minione", () => {
    expect(isFrozenWeek("2026-03-23", reference)).toBe(true);
  });

  it("zamraża tydzień bieżący", () => {
    expect(isFrozenWeek(reference, reference)).toBe(true);
  });

  it("przepuszcza tygodnie przyszłe", () => {
    expect(isFrozenWeek("2026-04-06", reference)).toBe(false);
  });
});

describe("błędne dane wejściowe", () => {
  it("rzuca RangeError dla ciągów, których nie da się sparsować jako daty", () => {
    expect(() => addDays("bogus", 1)).toThrow(RangeError);
    expect(() => addDays("2026-13-01", 1)).toThrow(RangeError);
    expect(() => weekStartOf("")).toThrow(RangeError);
  });

  it("przestawia nieistniejący dzień miesiąca zamiast go odrzucić", () => {
    expect(formatDayLabel("2026-02-30")).toBe("02.03");
    expect(weekStartOf("2026-02-30")).toBe("2026-03-02");
  });
});

import { describe, expect, it } from "vitest";

import {
  computeHoles,
  findScheduleBlockers,
  findSelfOverlaps,
  findUncoveredRanges,
  generateDraft,
  isFullyCovered,
  isWithinOpeningHours,
  type DraftInput,
  type DraftPiece,
} from "@/lib/services/schedule-generation";

const MONDAY = "2026-03-30";
const TUESDAY = "2026-03-31";
const WEDNESDAY = "2026-04-01";

const MONDAY_OPEN = { weekday: 1, opensAt: "08:00", closesAt: "16:00" };
const MONDAY_WIDE = { weekday: 1, opensAt: "08:00", closesAt: "18:00" };

function makeInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    employees: [
      { id: "e1", name: "Anna" },
      { id: "e2", name: "Piotr" },
    ],
    openingHours: [MONDAY_OPEN],
    availabilities: [],
    ...overrides,
  };
}

function availability(employeeId: string, startTime: string, endTime: string, workDate = MONDAY) {
  return { employeeId, workDate, startTime, endTime };
}

function piece(employeeId: string, startTime: string, endTime: string, workDate = MONDAY): DraftPiece {
  return { employeeId, workDate, startTime, endTime };
}

describe("generateDraft — obsada", () => {
  it("przypisuje pracownika dostępnego w całym oknie bez dziur", () => {
    const draft = generateDraft(makeInput({ availabilities: [availability("e1", "08:00", "16:00")] }));

    expect(draft.assignments).toEqual([piece("e1", "08:00", "16:00")]);
  });

  it("wybiera pracownika o najdłuższym zasięgu od bieżącej godziny", () => {
    const draft = generateDraft(
      makeInput({
        openingHours: [MONDAY_WIDE],
        availabilities: [availability("e1", "08:00", "14:00"), availability("e2", "08:00", "18:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e2", "08:00", "18:00")]);
  });

  it("składa dzień z kilku pracowników, gdy żaden nie pokrywa całości", () => {
    const draft = generateDraft(
      makeInput({
        availabilities: [availability("e1", "08:00", "12:00"), availability("e2", "12:00", "16:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e1", "08:00", "12:00"), piece("e2", "12:00", "16:00")]);
  });

  it("przy równym zasięgu rozstrzyga po nazwisku, nie po kolejności z bazy", () => {
    const draft = generateDraft(
      makeInput({
        employees: [
          { id: "e1", name: "Bogdan" },
          { id: "e2", name: "Anna" },
        ],
        availabilities: [availability("e1", "08:00", "16:00"), availability("e2", "08:00", "16:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e2", "08:00", "16:00")]);
  });

  it("przy równym zasięgu i nazwisku rozstrzyga po identyfikatorze", () => {
    const draft = generateDraft(
      makeInput({
        employees: [
          { id: "e2", name: "Anna" },
          { id: "e1", name: "Anna" },
        ],
        availabilities: [availability("e2", "08:00", "16:00"), availability("e1", "08:00", "16:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e1", "08:00", "16:00")]);
  });

  it("zostawia dziurę w środku okna, gdy nikt nie jest dostępny", () => {
    const draft = generateDraft(
      makeInput({
        openingHours: [MONDAY_WIDE],
        availabilities: [availability("e1", "08:00", "12:00"), availability("e2", "14:00", "18:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e1", "08:00", "12:00"), piece("e2", "14:00", "18:00")]);
    expect(draft.holes).toEqual([{ workDate: MONDAY, startTime: "12:00", endTime: "14:00" }]);
  });

  it("przycina dostępność wystającą poza okno i zostawia dziurę na resztę", () => {
    const draft = generateDraft(makeInput({ availabilities: [availability("e1", "06:00", "10:00")] }));

    expect(draft.assignments).toEqual([piece("e1", "08:00", "10:00")]);
    expect(draft.holes).toEqual([{ workDate: MONDAY, startTime: "10:00", endTime: "16:00" }]);
  });

  it("traktuje dostępność w całości poza oknem jako pełną dziurę", () => {
    const draft = generateDraft(makeInput({ availabilities: [availability("e1", "18:00", "22:00")] }));

    expect(draft.assignments).toEqual([]);
    expect(draft.holes).toEqual([{ workDate: MONDAY, startTime: "08:00", endTime: "16:00" }]);
  });

  it("pomija dzień bez godzin otwarcia — ani przypisania, ani dziury", () => {
    const draft = generateDraft(
      makeInput({
        openingHours: [{ weekday: 2, opensAt: "08:00", closesAt: "16:00" }],
        availabilities: [availability("e1", "08:00", "16:00", MONDAY)],
      }),
    );

    expect(draft.assignments).toEqual([]);
    expect(draft.holes).toEqual([]);
  });

  it("rozdziela pracownika na dwa przypisania, gdy ma przerwę w dostępności", () => {
    const draft = generateDraft(
      makeInput({
        availabilities: [availability("e1", "08:00", "12:00"), availability("e1", "14:00", "16:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e1", "08:00", "12:00"), piece("e1", "14:00", "16:00")]);
    expect(draft.holes).toEqual([{ workDate: MONDAY, startTime: "12:00", endTime: "14:00" }]);
  });

  it("scala nachodzące na siebie wpisy dostępności tego samego pracownika", () => {
    const draft = generateDraft(
      makeInput({
        availabilities: [availability("e1", "08:00", "12:00"), availability("e1", "10:00", "16:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e1", "08:00", "16:00")]);
  });

  it("dla pustej listy dostępności zwraca pusty grafik i zero dziur", () => {
    const draft = generateDraft(makeInput({ availabilities: [] }));

    expect(draft.assignments).toEqual([]);
    expect(draft.holes).toEqual([]);
  });

  it("przy powtórzonym dniu w godzinach otwarcia wygrywa ostatni wpis", () => {
    const draft = generateDraft(
      makeInput({
        openingHours: [
          { weekday: 1, opensAt: "08:00", closesAt: "12:00" },
          { weekday: 1, opensAt: "10:00", closesAt: "14:00" },
        ],
        availabilities: [availability("e1", "08:00", "16:00")],
      }),
    );

    expect(draft.assignments).toEqual([piece("e1", "10:00", "14:00")]);
  });

  it("sortuje przypisania po dacie, a w obrębie dnia po godzinie rozpoczęcia", () => {
    const draft = generateDraft(
      makeInput({
        openingHours: [MONDAY_OPEN, { weekday: 2, opensAt: "08:00", closesAt: "16:00" }],
        availabilities: [
          availability("e1", "12:00", "16:00", MONDAY),
          availability("e1", "10:00", "12:00", TUESDAY),
          availability("e1", "08:00", "10:00", MONDAY),
        ],
      }),
    );

    expect(draft.assignments).toEqual([
      piece("e1", "08:00", "10:00", MONDAY),
      piece("e1", "12:00", "16:00", MONDAY),
      piece("e1", "10:00", "12:00", TUESDAY),
    ]);
  });

  it("pomija pracownika bez dostępności", () => {
    const draft = generateDraft(
      makeInput({
        availabilities: [availability("e1", "08:00", "12:00"), availability("e2", "12:00", "16:00")],
      }),
    );

    expect(draft.assignments.map((assignment) => assignment.employeeId)).not.toContain("e3");
  });

  it("przypisuje pracownika nieobecnego na liście pracowników", () => {
    const draft = generateDraft(makeInput({ employees: [], availabilities: [availability("e9", "08:00", "16:00")] }));

    expect(draft.assignments).toEqual([piece("e9", "08:00", "16:00")]);
  });
});

describe("computeHoles — dziury z przypisań", () => {
  it("nie tworzy dziury na styku dwóch przypisań", () => {
    const holes = computeHoles([MONDAY_OPEN], [piece("e1", "08:00", "12:00"), piece("e2", "12:00", "14:00")], MONDAY);

    expect(holes).toEqual([{ workDate: MONDAY, startTime: "14:00", endTime: "16:00" }]);
  });

  it("nie tworzy dziury na nakładających się przypisaniach", () => {
    const holes = computeHoles([MONDAY_OPEN], [piece("e1", "08:00", "12:00"), piece("e2", "10:00", "16:00")], MONDAY);

    expect(holes).toEqual([]);
  });

  it("przycina przypisanie wystające poza okno", () => {
    const holes = computeHoles([MONDAY_OPEN], [piece("e1", "06:00", "10:00")], MONDAY);

    expect(holes).toEqual([{ workDate: MONDAY, startTime: "10:00", endTime: "16:00" }]);
  });

  it("zwraca dziurę wiodącą i końcową wokół przypisania", () => {
    const holes = computeHoles([MONDAY_OPEN], [piece("e1", "10:00", "12:00")], MONDAY);

    expect(holes).toEqual([
      { workDate: MONDAY, startTime: "08:00", endTime: "10:00" },
      { workDate: MONDAY, startTime: "12:00", endTime: "16:00" },
    ]);
  });

  it("liczy dziury tylko dla dni, które mają godziny otwarcia", () => {
    const holes = computeHoles([MONDAY_OPEN], [], MONDAY);

    expect(holes).toEqual([{ workDate: MONDAY, startTime: "08:00", endTime: "16:00" }]);
  });

  it("ignoruje przypisania w dniu spoza godzin otwarcia", () => {
    const holes = computeHoles([MONDAY_OPEN], [piece("e1", "08:00", "16:00", TUESDAY)], MONDAY);

    expect(holes).toEqual([{ workDate: MONDAY, startTime: "08:00", endTime: "16:00" }]);
  });

  it("przelicza dzień tygodnia na datę względem weekStart", () => {
    const holes = computeHoles([{ weekday: 3, opensAt: "08:00", closesAt: "16:00" }], [], MONDAY);

    expect(holes).toEqual([{ workDate: WEDNESDAY, startTime: "08:00", endTime: "16:00" }]);
  });
});

describe("isFullyCovered", () => {
  it("zwraca prawdę, gdy dostępność pokrywa cały zakres", () => {
    expect(isFullyCovered([availability("e1", "08:00", "16:00")], "e1", MONDAY, "08:00", "16:00")).toBe(true);
  });

  it("zwraca fałsz, gdy w dostępności jest luka", () => {
    expect(isFullyCovered([availability("e1", "08:00", "12:00")], "e1", MONDAY, "08:00", "16:00")).toBe(false);
  });

  it("zwraca prawdę dla zakresu pustego lub odwróconego", () => {
    expect(isFullyCovered([], "e1", MONDAY, "12:00", "12:00")).toBe(true);
    expect(isFullyCovered([], "e1", MONDAY, "16:00", "08:00")).toBe(true);
  });

  it("ignoruje dostępności innych pracowników i innych dni", () => {
    const availabilities = [availability("e2", "08:00", "16:00"), availability("e1", "08:00", "16:00", TUESDAY)];

    expect(isFullyCovered(availabilities, "e1", MONDAY, "08:00", "16:00")).toBe(false);
  });
});

describe("findUncoveredRanges", () => {
  it("zwraca pustą listę, gdy zakres jest pokryty", () => {
    expect(findUncoveredRanges([availability("e1", "08:00", "16:00")], "e1", MONDAY, "08:00", "12:00")).toEqual([]);
  });

  it("zwraca lukę w środku dostępności", () => {
    const ranges = findUncoveredRanges(
      [availability("e1", "08:00", "10:00"), availability("e1", "12:00", "16:00")],
      "e1",
      MONDAY,
      "08:00",
      "16:00",
    );

    expect(ranges).toEqual([{ startTime: "10:00", endTime: "12:00" }]);
  });

  it("przycina lukę do zadanego zakresu", () => {
    const ranges = findUncoveredRanges([availability("e1", "08:00", "12:00")], "e1", MONDAY, "08:00", "16:00");

    expect(ranges).toEqual([{ startTime: "12:00", endTime: "16:00" }]);
  });

  it("przy braku jakiejkolwiek dostępności zwraca cały zakres", () => {
    expect(findUncoveredRanges([], "e1", MONDAY, "08:00", "16:00")).toEqual([{ startTime: "08:00", endTime: "16:00" }]);
  });
});

describe("findSelfOverlaps", () => {
  it("zwraca część wspólną dwóch zmian tego samego pracownika w tym samym dniu", () => {
    const target = piece("e1", "08:00", "12:00");

    expect(findSelfOverlaps([piece("e1", "10:00", "14:00")], target)).toEqual([
      { startTime: "10:00", endTime: "12:00" },
    ]);
  });

  it("nie zgłasza nakładki, gdy zmiany tylko się stykają", () => {
    const target = piece("e1", "08:00", "12:00");

    expect(findSelfOverlaps([piece("e1", "12:00", "14:00")], target)).toEqual([]);
  });

  it("ignoruje zmiany innych pracowników i innych dni", () => {
    const target = piece("e1", "08:00", "12:00");
    const others = [piece("e2", "10:00", "14:00"), piece("e1", "10:00", "14:00", TUESDAY)];

    expect(findSelfOverlaps(others, target)).toEqual([]);
  });

  it("scala nakładające się zakresy", () => {
    const target = piece("e1", "08:00", "12:00");
    const others = [piece("e1", "08:30", "09:30"), piece("e1", "09:00", "10:00")];

    expect(findSelfOverlaps(others, target)).toEqual([{ startTime: "08:30", endTime: "10:00" }]);
  });
});

describe("isWithinOpeningHours", () => {
  it("zwraca prawdę dla zmiany mieszczącej się w oknie", () => {
    expect(isWithinOpeningHours([MONDAY_OPEN], 1, "08:00", "16:00")).toBe(true);
  });

  it("zwraca fałsz dla zmiany wychodzącej poza okno", () => {
    expect(isWithinOpeningHours([MONDAY_OPEN], 1, "06:00", "12:00")).toBe(false);
    expect(isWithinOpeningHours([MONDAY_OPEN], 1, "12:00", "18:00")).toBe(false);
  });

  it("zwraca fałsz dla zakresu pustego lub odwróconego", () => {
    expect(isWithinOpeningHours([MONDAY_OPEN], 1, "12:00", "12:00")).toBe(false);
    expect(isWithinOpeningHours([MONDAY_OPEN], 1, "16:00", "08:00")).toBe(false);
  });

  it("zwraca fałsz dla dnia bez godzin otwarcia", () => {
    expect(isWithinOpeningHours([MONDAY_OPEN], 7, "10:00", "12:00")).toBe(false);
  });
});

describe("findScheduleBlockers", () => {
  it("łączy dziury i kolizje, zgłaszając nakładkę własną tylko raz", () => {
    const blockers = findScheduleBlockers(
      [MONDAY_OPEN],
      [availability("e1", "08:00", "16:00")],
      [piece("e1", "08:00", "12:00"), piece("e1", "10:00", "14:00")],
      MONDAY,
    );

    expect(blockers.holes).toEqual([{ workDate: MONDAY, startTime: "14:00", endTime: "16:00" }]);
    expect(blockers.collisions).toEqual([
      { kind: "self-overlap", employeeId: "e1", workDate: MONDAY, startTime: "10:00", endTime: "12:00" },
    ]);
  });

  it("zgłasza kolizję typu uncovered, gdy zmiana wychodzi poza dostępność", () => {
    const blockers = findScheduleBlockers(
      [MONDAY_OPEN],
      [availability("e1", "08:00", "12:00")],
      [piece("e1", "08:00", "14:00")],
      MONDAY,
    );

    expect(blockers.collisions).toEqual([
      { kind: "uncovered", employeeId: "e1", workDate: MONDAY, startTime: "12:00", endTime: "14:00" },
    ]);
  });

  it("nie zgłasza kolizji, gdy nakładają się zmiany dwóch różnych osób", () => {
    const blockers = findScheduleBlockers(
      [MONDAY_OPEN],
      [availability("e1", "08:00", "16:00"), availability("e2", "08:00", "16:00")],
      [piece("e1", "08:00", "12:00"), piece("e2", "10:00", "14:00")],
      MONDAY,
    );

    expect(blockers.collisions).toEqual([]);
  });

  it("dla pustego grafiku zwraca pełne dziury i zero kolizji", () => {
    const blockers = findScheduleBlockers([MONDAY_OPEN], [availability("e1", "08:00", "16:00")], [], MONDAY);

    expect(blockers.holes).toEqual([{ workDate: MONDAY, startTime: "08:00", endTime: "16:00" }]);
    expect(blockers.collisions).toEqual([]);
  });

  it("dla poprawnego grafiku nie zwraca niczego", () => {
    const blockers = findScheduleBlockers(
      [MONDAY_OPEN],
      [availability("e1", "08:00", "12:00"), availability("e2", "12:00", "16:00")],
      [piece("e1", "08:00", "12:00"), piece("e2", "12:00", "16:00")],
      MONDAY,
    );

    expect(blockers).toEqual({ holes: [], collisions: [] });
  });
});

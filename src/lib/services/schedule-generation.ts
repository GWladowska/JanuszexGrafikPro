import { addDays, isoWeekday } from "@/lib/week";

export interface DraftInput {
  employees: { id: string; name: string }[];
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
  availabilities: { employeeId: string; workDate: string; startTime: string; endTime: string }[];
}

export interface DraftPiece {
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
}

export type DraftHole = Omit<DraftPiece, "employeeId">;

interface Interval {
  start: string;
  end: string;
}

function compareIntervals(a: Interval, b: Interval): number {
  if (a.start < b.start) {
    return -1;
  }
  if (a.start > b.start) {
    return 1;
  }
  if (a.end < b.end) {
    return -1;
  }
  if (a.end > b.end) {
    return 1;
  }
  return 0;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort(compareIntervals);
  const merged: Interval[] = [];
  let last: Interval | undefined;
  for (const interval of sorted) {
    if (last !== undefined && interval.start <= last.end) {
      if (interval.end > last.end) {
        last.end = interval.end;
      }
    } else {
      const copy = { ...interval };
      merged.push(copy);
      last = copy;
    }
  }
  return merged;
}

function clipIntervals(intervals: Interval[], window: Interval): Interval[] {
  const clipped: Interval[] = [];
  for (const interval of intervals) {
    const start = interval.start > window.start ? interval.start : window.start;
    const end = interval.end < window.end ? interval.end : window.end;
    if (start < end) {
      clipped.push({ start, end });
    }
  }
  return clipped;
}

function isPreferredCandidate(
  candidateEnd: string,
  candidateId: string,
  bestEnd: string,
  bestId: string,
  employeesById: Map<string, { id: string; name: string }>,
): boolean {
  if (candidateEnd !== bestEnd) {
    return candidateEnd > bestEnd;
  }
  const candidateName = employeesById.get(candidateId)?.name ?? "";
  const bestName = employeesById.get(bestId)?.name ?? "";
  const byName = candidateName.localeCompare(bestName, "pl");
  if (byName !== 0) {
    return byName < 0;
  }
  return candidateId < bestId;
}

function generateDay(
  workDate: string,
  window: Interval,
  availabilitiesByEmployee: Map<string, Interval[]>,
  employeesById: Map<string, { id: string; name: string }>,
): { assignments: DraftPiece[]; holes: DraftHole[] } {
  const clippedByEmployee = new Map<string, Interval[]>();
  for (const [employeeId, intervals] of availabilitiesByEmployee) {
    const clipped = mergeIntervals(clipIntervals(intervals, window));
    if (clipped.length > 0) {
      clippedByEmployee.set(employeeId, clipped);
    }
  }

  const assignments: DraftPiece[] = [];
  const holes: DraftHole[] = [];
  let cursor = window.start;

  while (cursor < window.end) {
    let bestId: string | null = null;
    let bestEnd = "";
    for (const [employeeId, intervals] of clippedByEmployee) {
      const current = intervals.find((interval) => interval.start <= cursor && cursor < interval.end);
      if (current === undefined) {
        continue;
      }
      if (bestId === null || isPreferredCandidate(current.end, employeeId, bestEnd, bestId, employeesById)) {
        bestId = employeeId;
        bestEnd = current.end;
      }
    }

    if (bestId !== null) {
      assignments.push({ employeeId: bestId, workDate, startTime: cursor, endTime: bestEnd });
      cursor = bestEnd;
      continue;
    }

    let nextStart: string | null = null;
    for (const intervals of clippedByEmployee.values()) {
      for (const interval of intervals) {
        if (interval.start > cursor && (nextStart === null || interval.start < nextStart)) {
          nextStart = interval.start;
        }
      }
    }
    const holeEnd = nextStart ?? window.end;
    holes.push({ workDate, startTime: cursor, endTime: holeEnd });
    cursor = holeEnd;
  }

  return { assignments, holes };
}

export function generateDraft(input: DraftInput): { assignments: DraftPiece[]; holes: DraftHole[] } {
  const employeesById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const windowByWeekday = new Map(
    input.openingHours.map((day) => [day.weekday, { start: day.opensAt, end: day.closesAt }]),
  );

  const availabilitiesByDate = new Map<string, Map<string, Interval[]>>();
  for (const availability of input.availabilities) {
    let byEmployee = availabilitiesByDate.get(availability.workDate);
    if (byEmployee === undefined) {
      byEmployee = new Map<string, Interval[]>();
      availabilitiesByDate.set(availability.workDate, byEmployee);
    }
    let intervals = byEmployee.get(availability.employeeId);
    if (intervals === undefined) {
      intervals = [];
      byEmployee.set(availability.employeeId, intervals);
    }
    intervals.push({ start: availability.startTime, end: availability.endTime });
  }

  const assignments: DraftPiece[] = [];
  const holes: DraftHole[] = [];
  for (const workDate of [...availabilitiesByDate.keys()].sort()) {
    const window = windowByWeekday.get(isoWeekday(workDate));
    if (window === undefined) {
      continue;
    }
    const day = generateDay(
      workDate,
      window,
      availabilitiesByDate.get(workDate) ?? new Map<string, Interval[]>(),
      employeesById,
    );
    assignments.push(...day.assignments);
    holes.push(...day.holes);
  }

  assignments.sort((a, b) => {
    if (a.workDate !== b.workDate) {
      return a.workDate < b.workDate ? -1 : 1;
    }
    if (a.startTime !== b.startTime) {
      return a.startTime < b.startTime ? -1 : 1;
    }
    return 0;
  });

  return { assignments, holes };
}

export function computeHoles(
  openingHours: DraftInput["openingHours"],
  assignments: DraftPiece[],
  weekStart: string,
): DraftHole[] {
  const assignmentsByDate = new Map<string, Interval[]>();
  for (const assignment of assignments) {
    let intervals = assignmentsByDate.get(assignment.workDate);
    if (intervals === undefined) {
      intervals = [];
      assignmentsByDate.set(assignment.workDate, intervals);
    }
    intervals.push({ start: assignment.startTime, end: assignment.endTime });
  }

  const holes: DraftHole[] = [];
  for (const day of [...openingHours].sort((a, b) => a.weekday - b.weekday)) {
    const workDate = addDays(weekStart, day.weekday - 1);
    const window = { start: day.opensAt, end: day.closesAt };
    const covered = mergeIntervals(clipIntervals(assignmentsByDate.get(workDate) ?? [], window));
    let cursor = window.start;
    for (const interval of covered) {
      if (interval.start > cursor) {
        holes.push({ workDate, startTime: cursor, endTime: interval.start });
      }
      if (interval.end > cursor) {
        cursor = interval.end;
      }
    }
    if (cursor < window.end) {
      holes.push({ workDate, startTime: cursor, endTime: window.end });
    }
  }

  return holes;
}

export function isFullyCovered(
  availabilities: DraftInput["availabilities"],
  employeeId: string,
  workDate: string,
  start: string,
  end: string,
): boolean {
  const intervals = availabilities
    .filter((availability) => availability.employeeId === employeeId && availability.workDate === workDate)
    .map((availability) => ({ start: availability.startTime, end: availability.endTime }));
  const merged = mergeIntervals(intervals);

  let cursor = start;
  for (const interval of merged) {
    if (interval.start > cursor) {
      return false;
    }
    if (interval.end > cursor) {
      cursor = interval.end;
    }
    if (cursor >= end) {
      return true;
    }
  }
  return cursor >= end;
}

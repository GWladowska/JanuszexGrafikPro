import type { DraftPiece } from "@/lib/services/schedule-generation";
import { addDays, formatDayLabel, formatWeekLabel, isoWeekday, weekdayLong } from "@/lib/week";

export interface ScheduleExportDay {
  workDate: string;
  closed: boolean;
  shifts: { name: string; startTime: string; endTime: string }[];
}

export interface ScheduleTextResult {
  formatted: string;
  plain: string;
}

export interface ScheduleExportInput {
  weekStart: string;
  assignments: DraftPiece[];
  employees: { id: string; name: string }[];
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
}

const UNKNOWN_EMPLOYEE_NAME = "—";

function compareTimes(a: string, b: string): number {
  return a.localeCompare(b);
}

export function buildScheduleDays(input: ScheduleExportInput): ScheduleExportDay[] {
  const employeesById = new Map(input.employees.map((employee) => [employee.id, employee]));

  const days: ScheduleExportDay[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const workDate = addDays(input.weekStart, offset);
    const weekday = isoWeekday(workDate);
    const openDay = input.openingHours.find((entry) => entry.weekday === weekday);

    if (openDay === undefined) {
      days.push({ workDate, closed: true, shifts: [] });
      continue;
    }

    const shifts = input.assignments
      .filter((assignment) => assignment.workDate === workDate)
      .map((assignment) => ({
        name: employeesById.get(assignment.employeeId)?.name ?? UNKNOWN_EMPLOYEE_NAME,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
      }))
      .sort((a, b) => compareTimes(a.startTime, b.startTime));

    days.push({ workDate, closed: false, shifts });
  }

  return days;
}

function wrapBold(text: string): string {
  return `*${text}*`;
}

function wrapMono(text: string): string {
  return `\`${text}\``;
}

function formatRange(startTime: string, endTime: string): string {
  return `${startTime} – ${endTime}`;
}

function buildVariant(days: ScheduleExportDay[], weekStart: string, withFormatting: boolean): string {
  const bold = withFormatting ? wrapBold : (text: string) => text;
  const mono = withFormatting ? wrapMono : (text: string) => text;

  const lines: string[] = [bold(formatWeekLabel(weekStart))];

  for (const day of days) {
    lines.push("");
    const label = `${weekdayLong(day.workDate)} ${formatDayLabel(day.workDate)}`;

    if (day.closed) {
      lines.push(`${bold(label)} — nieczynne`);
      continue;
    }

    lines.push(bold(label));
    for (const shift of day.shifts) {
      lines.push(`${shift.name} · ${mono(formatRange(shift.startTime, shift.endTime))}`);
    }
  }

  return lines.join("\n");
}

export function buildScheduleText(input: ScheduleExportInput): ScheduleTextResult {
  const days = buildScheduleDays(input);
  return {
    formatted: buildVariant(days, input.weekStart, true),
    plain: buildVariant(days, input.weekStart, false),
  };
}

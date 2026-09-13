import { useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ERROR_NETWORK, useApiErrorState } from "@/components/hooks/useApiErrorState";
import type { OpenDay } from "@/lib/services/business-validation";
import type { AssignmentRow, ScheduleRow } from "@/lib/services/schedule";
import type { DraftInput, DraftPiece } from "@/lib/services/schedule-generation";
import { computeHoles, isFullyCovered } from "@/lib/services/schedule-generation";
import { addDays, formatDayLabel, formatWeekLabel, isoWeekday, weekdayShort } from "@/lib/week";
import { cn } from "@/lib/utils";

export interface ScheduleWeekData {
  schedule: ScheduleRow | null;
  assignments: AssignmentRow[];
  availabilities: DraftInput["availabilities"];
}

interface ScheduleBoardProps {
  initialEmployees: { id: string; name: string }[];
  openingHours: OpenDay[];
  defaultWeekStart: string;
  initialWeekData: ScheduleWeekData;
}

const selectClass =
  "rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-400 [color-scheme:dark]";

const holeClass = "rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100";

function extractWeekData(body: unknown): ScheduleWeekData | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { schedule, assignments, availabilities } = body as Record<string, unknown>;
  if (schedule !== null && typeof schedule !== "object") {
    return null;
  }
  if (!Array.isArray(assignments) || !Array.isArray(availabilities)) {
    return null;
  }
  return {
    schedule: schedule as ScheduleRow | null,
    assignments: assignments as AssignmentRow[],
    availabilities: availabilities as DraftInput["availabilities"],
  };
}

function extractCreatedDraft(body: unknown): { schedule: ScheduleRow; assignments: AssignmentRow[] } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { schedule, assignments } = body as Record<string, unknown>;
  if (typeof schedule !== "object" || schedule === null || !Array.isArray(assignments)) {
    return null;
  }
  return { schedule: schedule as ScheduleRow, assignments: assignments as AssignmentRow[] };
}

function extractAssignment(body: unknown): AssignmentRow | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const assignment = (body as { assignment?: unknown }).assignment;
  if (typeof assignment !== "object" || assignment === null) {
    return null;
  }
  return assignment as AssignmentRow;
}

function toDraftPieces(assignments: AssignmentRow[]): DraftPiece[] {
  return assignments.map((row) => ({
    employeeId: row.employee_id,
    workDate: row.work_date,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

export default function ScheduleBoard({
  initialEmployees,
  openingHours,
  defaultWeekStart,
  initialWeekData,
}: ScheduleBoardProps) {
  const employees = initialEmployees;
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [weekData, setWeekData] = useState<ScheduleWeekData>(initialWeekData);

  const [navPending, setNavPending] = useState(false);
  const [generatePending, setGeneratePending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [swapPendingId, setSwapPendingId] = useState<string | null>(null);

  const navApi = useApiErrorState();
  const generateApi = useApiErrorState();
  const deleteApi = useApiErrorState();
  const swapApi = useApiErrorState();

  const actionButtonClass = (danger: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
      danger
        ? "border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
        : "border-white/20 bg-white/10 text-white hover:bg-white/20",
    );

  async function goToWeek(previousWeekStart: string, nextWeekStart: string) {
    setDeleting(false);
    navApi.setServerError(null);
    setWeekStart(nextWeekStart);
    setNavPending(true);
    try {
      const response = await fetch(`/api/schedules?week=${encodeURIComponent(nextWeekStart)}`);
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        navApi.applyApiError(responseBody);
        setWeekStart(previousWeekStart);
        return;
      }
      const data = extractWeekData(responseBody);
      if (data !== null) {
        setWeekData(data);
      } else {
        setWeekStart(previousWeekStart);
      }
    } catch {
      navApi.setServerError(ERROR_NETWORK);
      setWeekStart(previousWeekStart);
    } finally {
      setNavPending(false);
    }
  }

  async function submitGenerate(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (weekData.schedule !== null) {
      return;
    }

    generateApi.setServerError(null);
    setGeneratePending(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        generateApi.applyApiError(responseBody);
        return;
      }
      const created = extractCreatedDraft(responseBody);
      if (created !== null) {
        setWeekData((prev) => ({ ...prev, schedule: created.schedule, assignments: created.assignments }));
      }
    } catch {
      generateApi.setServerError(ERROR_NETWORK);
    } finally {
      setGeneratePending(false);
    }
  }

  async function submitDelete() {
    deleteApi.setServerError(null);
    setDeletePending(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        deleteApi.applyApiError(responseBody);
        return;
      }
      setWeekData((prev) => ({ ...prev, schedule: null, assignments: [] }));
      setDeleting(false);
    } catch {
      deleteApi.setServerError(ERROR_NETWORK);
    } finally {
      setDeletePending(false);
    }
  }

  async function submitSwap(assignmentId: string, employeeId: string) {
    swapApi.setServerError(null);
    setSwapPendingId(assignmentId);
    try {
      const response = await fetch("/api/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, employeeId }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        swapApi.applyApiError(responseBody);
        return;
      }
      const updated = extractAssignment(responseBody);
      if (updated !== null) {
        setWeekData((prev) => ({
          ...prev,
          assignments: prev.assignments.map((row) => (row.id === updated.id ? updated : row)),
        }));
      }
    } catch {
      swapApi.setServerError(ERROR_NETWORK);
    } finally {
      setSwapPendingId(null);
    }
  }

  if (employees.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-blue-100/70">
          Nie masz jeszcze pracowników. Dodaj pierwszego, aby generować grafik.
        </p>
        <p className="text-center">
          <a href="/employees" className="text-sm text-purple-300 hover:underline">
            Przejdź do pracowników
          </a>
        </p>
      </div>
    );
  }

  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const openingByWeekday = new Map<number, OpenDay>(openingHours.map((day) => [day.weekday, day]));
  const weekHoles = computeHoles(openingHours, toDraftPieces(weekData.assignments), weekStart);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={navPending}
            onClick={() => {
              void goToWeek(weekStart, addDays(weekStart, -7));
            }}
            className={cn(actionButtonClass(false), "flex items-center gap-1 disabled:opacity-50")}
            aria-label="Poprzedni tydzień"
          >
            <ChevronLeft className="size-4" />
            Poprzedni
          </button>
          <p className="text-sm font-semibold text-blue-100">{formatWeekLabel(weekStart)}</p>
          <button
            type="button"
            disabled={navPending}
            onClick={() => {
              void goToWeek(weekStart, addDays(weekStart, 7));
            }}
            className={cn(actionButtonClass(false), "flex items-center gap-1 disabled:opacity-50")}
            aria-label="Następny tydzień"
          >
            Następny
            <ChevronRight className="size-4" />
          </button>
        </div>

        <ServerError message={navApi.serverError} />

        <ul className="space-y-3">
          {weekDays.map((day) => {
            const opening = openingByWeekday.get(isoWeekday(day));
            const dayAssignments = weekData.assignments
              .filter((row) => row.work_date === day)
              .sort((a, b) => a.start_time.localeCompare(b.start_time));
            const dayHoles = weekHoles.filter((hole) => hole.workDate === day);

            return (
              <li key={day} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-sm font-semibold text-blue-100">
                  {weekdayShort(day)} {formatDayLabel(day)}
                </p>
                {opening === undefined ? (
                  <p className="mt-1 text-sm text-blue-100/40">Nieczynne</p>
                ) : (
                  <>
                    {dayAssignments.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {dayAssignments.map((row) => {
                          const pool = employees.filter(
                            (employee) =>
                              employee.id !== row.employee_id &&
                              isFullyCovered(
                                weekData.availabilities,
                                employee.id,
                                row.work_date,
                                row.start_time,
                                row.end_time,
                              ),
                          );

                          return (
                            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm text-white/80">
                                {employeesById.get(row.employee_id)?.name ?? "—"} · {row.start_time} – {row.end_time}
                              </p>
                              {pool.length > 0 ? (
                                <select
                                  value=""
                                  disabled={swapPendingId !== null}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    if (value !== "") {
                                      void submitSwap(row.id, value);
                                    }
                                  }}
                                  className={selectClass}
                                  aria-label={`Zamień osobę w zmianie ${row.start_time} – ${row.end_time}`}
                                >
                                  <option value="" className="bg-slate-900">
                                    Zamień na…
                                  </option>
                                  {pool.map((employee) => (
                                    <option key={employee.id} value={employee.id} className="bg-slate-900">
                                      {employee.name}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {dayHoles.map((hole) => (
                      <p key={`${hole.startTime}-${hole.endTime}`} className={cn(holeClass, "mt-2")}>
                        Dziura {hole.startTime} – {hole.endTime}
                      </p>
                    ))}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        {weekData.schedule === null && !navPending ? (
          <form onSubmit={(event) => submitGenerate(event)} noValidate>
            <SubmitButton pendingText="Generowanie..." icon={<Sparkles className="size-4" />} pending={generatePending}>
              Generuj draft
            </SubmitButton>
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled
              title={
                weekData.schedule !== null
                  ? "Draft już istnieje — użyj „Usuń draft”, aby zacząć od nowa."
                  : "Ładowanie danych tygodnia…"
              }
              className={cn(actionButtonClass(false), "w-full cursor-not-allowed opacity-50")}
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="size-4" />
                Generuj draft
              </span>
            </button>
            {weekData.schedule !== null ? (
              <>
                <p className="text-sm text-blue-100/70">
                  Draft już istnieje — użyj „Usuń draft”, aby wygenerować grafik od nowa.
                </p>
                {deleting ? (
                  <div className="text-sm">
                    <p className="text-red-200">Na pewno usunąć draft grafiku wraz ze wszystkimi zmianami?</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={deletePending || navPending}
                        onClick={() => {
                          void submitDelete();
                        }}
                        className={cn(actionButtonClass(true), "flex items-center gap-1 disabled:opacity-50")}
                      >
                        <Trash2 className="size-4" />
                        {deletePending ? "Usuwanie..." : "Usuń"}
                      </button>
                      <button
                        type="button"
                        disabled={deletePending}
                        onClick={() => {
                          setDeleting(false);
                        }}
                        className={cn(actionButtonClass(false), "disabled:opacity-50")}
                      >
                        Anuluj
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={navPending}
                    onClick={() => {
                      setDeleting(true);
                    }}
                    className={cn(actionButtonClass(true), "flex items-center gap-1 disabled:opacity-50")}
                  >
                    <Trash2 className="size-4" />
                    Usuń draft
                  </button>
                )}
              </>
            ) : null}
          </>
        )}

        <ServerError message={generateApi.serverError} />
        <ServerError message={deleteApi.serverError} />
        <ServerError message={swapApi.serverError} />
      </section>
    </div>
  );
}

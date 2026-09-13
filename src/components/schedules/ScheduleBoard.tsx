import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ERROR_NETWORK, useApiErrorState } from "@/components/hooks/useApiErrorState";
import { ERROR_OUTSIDE_OPENING_HOURS } from "@/lib/http";
import type { OpenDay } from "@/lib/services/business-validation";
import type { AssignmentRow, ScheduleRow } from "@/lib/services/schedule";
import type { DraftInput, DraftPiece } from "@/lib/services/schedule-generation";
import {
  computeHoles,
  findSelfOverlaps,
  findUncoveredRanges,
  isFullyCovered,
  isWithinOpeningHours,
} from "@/lib/services/schedule-generation";
import { parseShiftTime } from "@/lib/services/schedule-validation";
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

interface EditingState {
  id: string;
  startTime: string;
  endTime: string;
}

interface AddingState {
  workDate: string;
  startTime: string;
  endTime: string;
  employeeId: string;
}

const controlClass =
  "rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-400 [color-scheme:dark]";

const holeClass = "rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100";

const flagClass = "rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100";

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

function toDraftPiece(row: AssignmentRow): DraftPiece {
  return { employeeId: row.employee_id, workDate: row.work_date, startTime: row.start_time, endTime: row.end_time };
}

function toDraftPieces(assignments: AssignmentRow[]): DraftPiece[] {
  return assignments.map(toDraftPiece);
}

function formatRange(startTime: string, endTime: string): string {
  return `${startTime} – ${endTime}`;
}

function employeeSections(
  employees: { id: string; name: string }[],
  availabilities: DraftInput["availabilities"],
  workDate: string,
  startTime: string,
  endTime: string,
  excludeEmployeeId: string | null,
): { available: { id: string; name: string }[]; unavailable: { id: string; name: string }[] } {
  const others = employees.filter((employee) => employee.id !== excludeEmployeeId);
  const available: { id: string; name: string }[] = [];
  const unavailable: { id: string; name: string }[] = [];
  for (const employee of others) {
    if (isFullyCovered(availabilities, employee.id, workDate, startTime, endTime)) {
      available.push(employee);
    } else {
      unavailable.push(employee);
    }
  }
  return { available, unavailable };
}

function validateShiftTimes(
  startTime: string,
  endTime: string,
  workDate: string,
  openingHours: OpenDay[],
): string | null {
  const startResult = parseShiftTime(startTime);
  if (startResult.fieldError !== null) {
    return startResult.fieldError;
  }
  const endResult = parseShiftTime(endTime);
  if (endResult.fieldError !== null) {
    return endResult.fieldError;
  }
  if (startTime >= endTime) {
    return "Godzina „od” musi być wcześniejsza niż „do”.";
  }
  if (!isWithinOpeningHours(openingHours, isoWeekday(workDate), startTime, endTime)) {
    return ERROR_OUTSIDE_OPENING_HOURS;
  }
  return null;
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
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editPendingId, setEditPendingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddingState | null>(null);
  const [addingError, setAddingError] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [removePendingId, setRemovePendingId] = useState<string | null>(null);

  const navApi = useApiErrorState();
  const generateApi = useApiErrorState();
  const deleteApi = useApiErrorState();
  const swapApi = useApiErrorState();
  const editApi = useApiErrorState();
  const addApi = useApiErrorState();
  const removeApi = useApiErrorState();

  const actionButtonClass = (danger: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
      danger
        ? "border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
        : "border-white/20 bg-white/10 text-white hover:bg-white/20",
    );

  const smallButtonClass = (danger: boolean) =>
    cn(actionButtonClass(danger), "flex items-center gap-1 px-2 py-1 text-xs disabled:opacity-50");

  function closeEditingForms() {
    setEditing(null);
    setEditingError(null);
    setAdding(null);
    setAddingError(null);
    setRemoveConfirmId(null);
  }

  async function goToWeek(previousWeekStart: string, nextWeekStart: string) {
    setDeleting(false);
    closeEditingForms();
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
      closeEditingForms();
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
      const response = await fetch("/api/schedules/assignments", {
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

  async function submitEdit(row: AssignmentRow) {
    if (editing?.id !== row.id) {
      return;
    }
    editApi.setServerError(null);
    const validationError = validateShiftTimes(editing.startTime, editing.endTime, row.work_date, openingHours);
    if (validationError !== null) {
      setEditingError(validationError);
      return;
    }

    setEditingError(null);
    setEditPendingId(row.id);
    try {
      const response = await fetch("/api/schedules/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: row.id, startTime: editing.startTime, endTime: editing.endTime }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        editApi.applyApiError(responseBody);
        return;
      }
      const updated = extractAssignment(responseBody);
      if (updated !== null) {
        setWeekData((prev) => ({
          ...prev,
          assignments: prev.assignments.map((r) => (r.id === updated.id ? updated : r)),
        }));
      }
      setEditing(null);
    } catch {
      editApi.setServerError(ERROR_NETWORK);
    } finally {
      setEditPendingId(null);
    }
  }

  async function submitAdd() {
    if (adding === null || adding.employeeId === "") {
      setAddingError("Wybierz osobę do zmiany.");
      return;
    }
    addApi.setServerError(null);
    const validationError = validateShiftTimes(adding.startTime, adding.endTime, adding.workDate, openingHours);
    if (validationError !== null) {
      setAddingError(validationError);
      return;
    }

    setAddPending(true);
    try {
      const response = await fetch("/api/schedules/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          employeeId: adding.employeeId,
          workDate: adding.workDate,
          startTime: adding.startTime,
          endTime: adding.endTime,
        }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        addApi.applyApiError(responseBody);
        return;
      }
      const created = extractAssignment(responseBody);
      if (created !== null) {
        setWeekData((prev) => ({ ...prev, assignments: [...prev.assignments, created] }));
      }
      setAdding(null);
    } catch {
      addApi.setServerError(ERROR_NETWORK);
    } finally {
      setAddPending(false);
    }
  }

  async function submitRemove(assignmentId: string) {
    removeApi.setServerError(null);
    setRemovePendingId(assignmentId);
    try {
      const response = await fetch("/api/schedules/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        removeApi.applyApiError(responseBody);
        return;
      }
      setWeekData((prev) => ({ ...prev, assignments: prev.assignments.filter((row) => row.id !== assignmentId) }));
      setRemoveConfirmId(null);
    } catch {
      removeApi.setServerError(ERROR_NETWORK);
    } finally {
      setRemovePendingId(null);
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
  const draft = weekData.schedule !== null;
  const actionsPending =
    navPending || swapPendingId !== null || editPendingId !== null || addPending || removePendingId !== null;

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
            const addingHere = adding !== null && adding.workDate === day;

            return (
              <li key={day} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-sm font-semibold text-blue-100">
                  {weekdayShort(day)} {formatDayLabel(day)}
                  {opening !== undefined ? (
                    <span className="ml-2 font-normal text-blue-100/60">
                      · {opening.opensAt} – {opening.closesAt}
                    </span>
                  ) : null}
                </p>
                {opening === undefined ? (
                  <p className="mt-1 text-sm text-blue-100/40">Nieczynne</p>
                ) : (
                  <>
                    {dayAssignments.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {dayAssignments.map((row) => {
                          const rowEditing = editing !== null && editing.id === row.id;
                          const { available, unavailable } = employeeSections(
                            employees,
                            weekData.availabilities,
                            row.work_date,
                            row.start_time,
                            row.end_time,
                            row.employee_id,
                          );
                          const uncovered = findUncoveredRanges(
                            weekData.availabilities,
                            row.employee_id,
                            row.work_date,
                            row.start_time,
                            row.end_time,
                          );
                          const selfOverlaps = findSelfOverlaps(
                            toDraftPieces(weekData.assignments.filter((other) => other.id !== row.id)),
                            toDraftPiece(row),
                          );
                          const rowConfirmingRemove = removeConfirmId === row.id;

                          return (
                            <li key={row.id} className="space-y-2">
                              {rowEditing ? (
                                <div className="space-y-2 rounded-lg border border-purple-400/30 bg-purple-500/5 px-3 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm text-white/80">
                                      {employeesById.get(row.employee_id)?.name ?? "—"} ·
                                    </p>
                                    <input
                                      type="time"
                                      value={editing.startTime}
                                      onChange={(event) => {
                                        setEditing({ ...editing, startTime: event.target.value });
                                        setEditingError(null);
                                      }}
                                      className={controlClass}
                                      aria-label="Godzina od"
                                      disabled={editPendingId !== null}
                                    />
                                    <span className="text-sm text-white/60">–</span>
                                    <input
                                      type="time"
                                      value={editing.endTime}
                                      onChange={(event) => {
                                        setEditing({ ...editing, endTime: event.target.value });
                                        setEditingError(null);
                                      }}
                                      className={controlClass}
                                      aria-label="Godzina do"
                                      disabled={editPendingId !== null}
                                    />
                                  </div>
                                  {editingError !== null ? (
                                    <p className="text-sm text-red-200">{editingError}</p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={editPendingId !== null || actionsPending}
                                      onClick={() => {
                                        void submitEdit(row);
                                      }}
                                      className={smallButtonClass(false)}
                                    >
                                      {editPendingId === row.id ? "Zapisywanie..." : "Zapisz"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={editPendingId !== null}
                                      onClick={() => {
                                        setEditing(null);
                                        setEditingError(null);
                                      }}
                                      className={smallButtonClass(false)}
                                    >
                                      Anuluj
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm text-white/80">
                                      {employeesById.get(row.employee_id)?.name ?? "—"} · {row.start_time} –{" "}
                                      {row.end_time}
                                    </p>
                                    {draft && !rowConfirmingRemove ? (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={actionsPending}
                                          onClick={() => {
                                            setEditing({
                                              id: row.id,
                                              startTime: row.start_time,
                                              endTime: row.end_time,
                                            });
                                            setEditingError(null);
                                          }}
                                          className={smallButtonClass(false)}
                                          aria-label={`Edytuj godziny zmiany ${row.start_time} – ${row.end_time}`}
                                        >
                                          <Pencil className="size-4" />
                                          Edytuj
                                        </button>
                                        {employees.length > 1 ? (
                                          <select
                                            value=""
                                            disabled={actionsPending}
                                            onChange={(event) => {
                                              const value = event.target.value;
                                              if (value !== "") {
                                                void submitSwap(row.id, value);
                                              }
                                            }}
                                            className={controlClass}
                                            aria-label={`Zamień osobę w zmianie ${row.start_time} – ${row.end_time}`}
                                          >
                                            <option value="" className="bg-slate-900">
                                              Zamień na…
                                            </option>
                                            {available.map((employee) => (
                                              <option key={employee.id} value={employee.id} className="bg-slate-900">
                                                {employee.name}
                                              </option>
                                            ))}
                                            {unavailable.map((employee) => (
                                              <option key={employee.id} value={employee.id} className="bg-slate-900">
                                                {employee.name} (poza dostępnością)
                                              </option>
                                            ))}
                                          </select>
                                        ) : null}
                                        <button
                                          type="button"
                                          disabled={actionsPending}
                                          onClick={() => {
                                            setRemoveConfirmId(row.id);
                                          }}
                                          className={smallButtonClass(true)}
                                          aria-label={`Usuń zmianę ${row.start_time} – ${row.end_time}`}
                                        >
                                          <Trash2 className="size-4" />
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  {rowConfirmingRemove ? (
                                    <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm">
                                      <p className="text-red-200">
                                        Na pewno usunąć zmianę {employeesById.get(row.employee_id)?.name ?? "—"}{" "}
                                        {formatRange(row.start_time, row.end_time)}?
                                      </p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          disabled={actionsPending}
                                          onClick={() => {
                                            void submitRemove(row.id);
                                          }}
                                          className={smallButtonClass(true)}
                                        >
                                          <Trash2 className="size-4" />
                                          {removePendingId === row.id ? "Usuwanie..." : "Usuń"}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actionsPending}
                                          onClick={() => {
                                            setRemoveConfirmId(null);
                                          }}
                                          className={smallButtonClass(false)}
                                        >
                                          Anuluj
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                  {uncovered.length > 0 ? (
                                    <p className={flagClass}>
                                      ⚠ Poza dostępnością:{" "}
                                      {uncovered.map((range) => formatRange(range.startTime, range.endTime)).join(", ")}
                                    </p>
                                  ) : null}
                                  {selfOverlaps.length > 0 ? (
                                    <p className={flagClass}>
                                      ⚠ Nakładka z inną zmianą tej samej osoby:{" "}
                                      {selfOverlaps
                                        .map((range) => formatRange(range.startTime, range.endTime))
                                        .join(", ")}
                                    </p>
                                  ) : null}
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {dayHoles.map((hole) => (
                      <div
                        key={`${hole.startTime}-${hole.endTime}`}
                        className={cn(holeClass, "mt-2 flex flex-wrap items-center justify-between gap-2")}
                      >
                        <span>Dziura {formatRange(hole.startTime, hole.endTime)}</span>
                        {draft && !addingHere ? (
                          <button
                            type="button"
                            disabled={actionsPending}
                            onClick={() => {
                              setAdding({
                                workDate: hole.workDate,
                                startTime: hole.startTime,
                                endTime: hole.endTime,
                                employeeId: "",
                              });
                              setAddingError(null);
                            }}
                            className={smallButtonClass(false)}
                            aria-label={`Obsadź dziurę ${hole.startTime} – ${hole.endTime}`}
                          >
                            <Plus className="size-4" />
                            Obsadź
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {draft && !addingHere ? (
                      <button
                        type="button"
                        disabled={actionsPending}
                        onClick={() => {
                          setAdding({
                            workDate: day,
                            startTime: opening.opensAt,
                            endTime: opening.closesAt,
                            employeeId: "",
                          });
                          setAddingError(null);
                        }}
                        className={cn(smallButtonClass(false), "mt-2")}
                      >
                        <Plus className="size-4" />
                        Dodaj zmianę
                      </button>
                    ) : null}
                    {adding !== null && addingHere ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitAdd();
                        }}
                        noValidate
                        className="mt-2 space-y-2 rounded-lg border border-purple-400/30 bg-purple-500/5 px-3 py-3"
                      >
                        <p className="text-sm font-semibold text-blue-100">
                          Nowa zmiana — {weekdayShort(adding.workDate)} {formatDayLabel(adding.workDate)}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const sections = employeeSections(
                              employees,
                              weekData.availabilities,
                              adding.workDate,
                              adding.startTime,
                              adding.endTime,
                              null,
                            );
                            return (
                              <select
                                value={adding.employeeId}
                                disabled={addPending || actionsPending}
                                onChange={(event) => {
                                  setAdding({ ...adding, employeeId: event.target.value });
                                  setAddingError(null);
                                }}
                                className={controlClass}
                                aria-label="Pracownik dla nowej zmiany"
                              >
                                <option value="" className="bg-slate-900">
                                  Wybierz osobę…
                                </option>
                                {sections.available.map((employee) => (
                                  <option key={employee.id} value={employee.id} className="bg-slate-900">
                                    {employee.name}
                                  </option>
                                ))}
                                {sections.unavailable.map((employee) => (
                                  <option key={employee.id} value={employee.id} className="bg-slate-900">
                                    {employee.name} (poza dostępnością)
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="time"
                            value={adding.startTime}
                            onChange={(event) => {
                              setAdding({ ...adding, startTime: event.target.value });
                              setAddingError(null);
                            }}
                            className={controlClass}
                            aria-label="Godzina od"
                            disabled={addPending}
                          />
                          <span className="text-sm text-white/60">–</span>
                          <input
                            type="time"
                            value={adding.endTime}
                            onChange={(event) => {
                              setAdding({ ...adding, endTime: event.target.value });
                              setAddingError(null);
                            }}
                            className={controlClass}
                            aria-label="Godzina do"
                            disabled={addPending}
                          />
                        </div>
                        {addingError !== null ? <p className="text-sm text-red-200">{addingError}</p> : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={addPending || actionsPending}
                            className={smallButtonClass(false)}
                          >
                            {addPending ? "Dodawanie..." : "Dodaj"}
                          </button>
                          <button
                            type="button"
                            disabled={addPending}
                            onClick={() => {
                              setAdding(null);
                              setAddingError(null);
                            }}
                            className={smallButtonClass(false)}
                          >
                            Anuluj
                          </button>
                        </div>
                      </form>
                    ) : null}
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
        <ServerError message={editApi.serverError} />
        <ServerError message={addApi.serverError} />
        <ServerError message={removeApi.serverError} />
      </section>
    </div>
  );
}

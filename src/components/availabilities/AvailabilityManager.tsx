import { useState } from "react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ERROR_NETWORK, useApiErrorState } from "@/components/hooks/useApiErrorState";
import { parseAvailabilityTime, parseWorkDate, validateTimeRange } from "@/lib/services/availability-validation";
import type { AvailabilityRow } from "@/lib/services/availability";
import type { EmployeeRow } from "@/lib/services/employee";
import { addDays, formatDayLabel, formatWeekLabel, weekStartOf, weekdayShort } from "@/lib/week";
import { cn } from "@/lib/utils";

interface AvailabilityManagerProps {
  initialEmployees: EmployeeRow[];
  initialAvailabilities: AvailabilityRow[];
  defaultWeekStart: string;
}

const darkInputClass = "[color-scheme:dark]";

const selectClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-400 [color-scheme:dark]";

function extractAvailability(body: unknown): AvailabilityRow | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const availability = (body as { availability?: unknown }).availability;
  if (typeof availability !== "object" || availability === null) {
    return null;
  }
  return availability as AvailabilityRow;
}

function isInWeek(date: string, weekStart: string): boolean {
  return date >= weekStart && date <= addDays(weekStart, 6);
}

function parseEntryFields(
  date: string,
  start: string,
  end: string,
):
  | { input: { workDate: string; startTime: string; endTime: string } }
  | { fieldErrors: Partial<Record<string, string>> } {
  const dateResult = parseWorkDate(date);
  const startResult = parseAvailabilityTime(start);
  const endResult = parseAvailabilityTime(end);

  const nextErrors: Partial<Record<string, string>> = {};
  if (dateResult.fieldError !== null) {
    nextErrors.workDate = dateResult.fieldError;
  }
  if (startResult.fieldError !== null) {
    nextErrors.startTime = startResult.fieldError;
  }
  if (endResult.fieldError !== null) {
    nextErrors.endTime = endResult.fieldError;
  }
  if (dateResult.value === null || startResult.value === null || endResult.value === null) {
    return { fieldErrors: nextErrors };
  }

  const rangeError = validateTimeRange(startResult.value, endResult.value);
  if (rangeError !== null) {
    return { fieldErrors: { ...nextErrors, endTime: rangeError } };
  }

  return { input: { workDate: dateResult.value, startTime: startResult.value, endTime: endResult.value } };
}

export default function AvailabilityManager({
  initialEmployees,
  initialAvailabilities,
  defaultWeekStart,
}: AvailabilityManagerProps) {
  const employees = initialEmployees;
  const [availabilities, setAvailabilities] = useState<AvailabilityRow[]>(initialAvailabilities);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(initialEmployees[0]?.id ?? null);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);

  const addApi = useApiErrorState();
  const editApi = useApiErrorState();
  const deleteApi = useApiErrorState();

  const [workDate, setWorkDate] = useState(defaultWeekStart);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [addPending, setAddPending] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editPending, setEditPending] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  function goToWeek(nextWeekStart: string) {
    setWeekStart(nextWeekStart);
    setWorkDate(nextWeekStart);
    setEditingId(null);
    setDeletingId(null);
  }

  async function submitAdd(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = parseEntryFields(workDate, startTime, endTime);
    if ("fieldErrors" in parsed) {
      addApi.setFieldErrors(parsed.fieldErrors);
      return;
    }

    addApi.setFieldErrors({});
    addApi.setServerError(null);
    setAddPending(true);
    try {
      const response = await fetch("/api/availabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedEmployeeId, ...parsed.input }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        addApi.applyApiError(responseBody);
        return;
      }
      const created = extractAvailability(responseBody);
      if (created !== null) {
        setAvailabilities((prev) => [...prev, created]);
        const targetWeek = weekStartOf(created.work_date);
        if (targetWeek !== weekStart) {
          setWeekStart(targetWeek);
        }
        setWorkDate(targetWeek);
      }
      setStartTime("");
      setEndTime("");
    } catch {
      addApi.setServerError(ERROR_NETWORK);
    } finally {
      setAddPending(false);
    }
  }

  function startEdit(availability: AvailabilityRow) {
    setDeletingId(null);
    setEditingId(availability.id);
    setEditDate(availability.work_date);
    setEditStartTime(availability.start_time);
    setEditEndTime(availability.end_time);
    editApi.setFieldErrors({});
    editApi.setServerError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    editApi.setServerError(null);
  }

  async function submitEdit(event: React.SubmitEvent<HTMLFormElement>, id: string) {
    event.preventDefault();

    const parsed = parseEntryFields(editDate, editStartTime, editEndTime);
    if ("fieldErrors" in parsed) {
      editApi.setFieldErrors(parsed.fieldErrors);
      return;
    }

    editApi.setFieldErrors({});
    editApi.setServerError(null);
    setEditPending(true);
    try {
      const response = await fetch("/api/availabilities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, employeeId: selectedEmployeeId, ...parsed.input }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        editApi.applyApiError(responseBody);
        return;
      }
      const updated = extractAvailability(responseBody);
      if (updated !== null) {
        setAvailabilities((prev) => prev.map((row) => (row.id === id ? updated : row)));
        const targetWeek = weekStartOf(updated.work_date);
        if (targetWeek !== weekStart) {
          setWeekStart(targetWeek);
        }
      }
      setEditingId(null);
    } catch {
      editApi.setServerError(ERROR_NETWORK);
    } finally {
      setEditPending(false);
    }
  }

  async function submitDelete(id: string) {
    deleteApi.setServerError(null);
    setDeletePending(true);
    try {
      const response = await fetch("/api/availabilities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        deleteApi.applyApiError(responseBody);
        return;
      }
      setAvailabilities((prev) => prev.filter((row) => row.id !== id));
      setDeletingId(null);
    } catch {
      deleteApi.setServerError(ERROR_NETWORK);
    } finally {
      setDeletePending(false);
    }
  }

  const actionButtonClass = (danger: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
      danger
        ? "border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
        : "border-white/20 bg-white/10 text-white hover:bg-white/20",
    );

  if (employees.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-blue-100/70">
          Nie masz jeszcze pracowników. Dodaj pierwszego, aby wprowadzać dostępności.
        </p>
        <p className="text-center">
          <a href="/employees" className="text-sm text-purple-300 hover:underline">
            Przejdź do pracowników
          </a>
        </p>
      </div>
    );
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekAvailabilities = availabilities.filter(
    (row) => row.employee_id === selectedEmployeeId && isInWeek(row.work_date, weekStart),
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wider text-blue-100/70 uppercase">Pracownik</h2>
        <select
          value={selectedEmployeeId ?? ""}
          onChange={(event) => {
            setSelectedEmployeeId(event.target.value);
            setEditingId(null);
            setDeletingId(null);
            addApi.setFieldErrors({});
            addApi.setServerError(null);
          }}
          className={selectClass}
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id} className="bg-slate-900">
              {employee.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              goToWeek(addDays(weekStart, -7));
            }}
            className={cn(actionButtonClass(false), "flex items-center gap-1")}
            aria-label="Poprzedni tydzień"
          >
            <ChevronLeft className="size-4" />
            Poprzedni
          </button>
          <p className="text-sm font-semibold text-blue-100">{formatWeekLabel(weekStart)}</p>
          <button
            type="button"
            onClick={() => {
              goToWeek(addDays(weekStart, 7));
            }}
            className={cn(actionButtonClass(false), "flex items-center gap-1")}
            aria-label="Następny tydzień"
          >
            Następny
            <ChevronRight className="size-4" />
          </button>
        </div>

        <ul className="space-y-3">
          {weekDays.map((day) => {
            const dayEntries = weekAvailabilities
              .filter((row) => row.work_date === day)
              .sort((a, b) => (a.start_time < b.start_time ? -1 : 1));

            return (
              <li key={day} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-sm font-semibold text-blue-100">
                  {weekdayShort(day)} {formatDayLabel(day)}
                </p>
                {dayEntries.length === 0 ? (
                  <p className="mt-1 text-sm text-blue-100/40">—</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {dayEntries.map((row) => (
                      <li key={row.id}>
                        {editingId === row.id ? (
                          <form onSubmit={(event) => submitEdit(event, row.id)} noValidate className="space-y-3">
                            <FormField
                              id={`edit-date-${row.id}`}
                              type="date"
                              label="Data"
                              value={editDate}
                              onChange={(value) => {
                                setEditDate(value);
                                editApi.setFieldErrors((prev) => ({ ...prev, workDate: undefined }));
                              }}
                              error={editApi.fieldErrors.workDate}
                              icon={<CalendarPlus className="size-4" />}
                              inputClassName={darkInputClass}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <FormField
                                id={`edit-start-${row.id}`}
                                type="time"
                                label="Od"
                                value={editStartTime}
                                onChange={(value) => {
                                  setEditStartTime(value);
                                  editApi.setFieldErrors((prev) => ({ ...prev, startTime: undefined }));
                                }}
                                error={editApi.fieldErrors.startTime}
                                icon={<CalendarPlus className="size-4" />}
                                inputClassName={darkInputClass}
                              />
                              <FormField
                                id={`edit-end-${row.id}`}
                                type="time"
                                label="Do"
                                value={editEndTime}
                                onChange={(value) => {
                                  setEditEndTime(value);
                                  editApi.setFieldErrors((prev) => ({ ...prev, endTime: undefined }));
                                }}
                                error={editApi.fieldErrors.endTime}
                                icon={<CalendarPlus className="size-4" />}
                                inputClassName={darkInputClass}
                              />
                            </div>

                            <ServerError message={editApi.serverError} />

                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <SubmitButton
                                  pendingText="Zapisywanie..."
                                  icon={<Check className="size-4" />}
                                  pending={editPending}
                                >
                                  Zapisz
                                </SubmitButton>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  cancelEdit();
                                }}
                                className={cn(actionButtonClass(false), "flex items-center gap-1")}
                              >
                                <X className="size-4" />
                                Anuluj
                              </button>
                            </div>
                          </form>
                        ) : deletingId === row.id ? (
                          <div className="text-sm">
                            <p className="text-red-200">
                              Na pewno usunąć ten wpis dostępności ({row.start_time} – {row.end_time})?
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={deletePending}
                                onClick={() => {
                                  void submitDelete(row.id);
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
                                  setDeletingId(null);
                                }}
                                className={cn(actionButtonClass(false), "disabled:opacity-50")}
                              >
                                Anuluj
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-white/80">
                              {row.start_time} – {row.end_time}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  startEdit(row);
                                }}
                                className={cn(actionButtonClass(false), "flex items-center gap-1")}
                              >
                                <Pencil className="size-4" />
                                Edytuj
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setDeletingId(row.id);
                                }}
                                className={cn(actionButtonClass(true), "flex items-center gap-1")}
                              >
                                <Trash2 className="size-4" />
                                Usuń
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <ServerError message={deleteApi.serverError} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wider text-blue-100/70 uppercase">Dodaj dostępność</h2>
        <form onSubmit={(event) => submitAdd(event)} noValidate className="space-y-4">
          <FormField
            id="availability-date"
            type="date"
            label="Data"
            value={workDate}
            onChange={(value) => {
              setWorkDate(value);
              addApi.setFieldErrors((prev) => ({ ...prev, workDate: undefined }));
            }}
            error={addApi.fieldErrors.workDate}
            icon={<CalendarPlus className="size-4" />}
            inputClassName={darkInputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="availability-start"
              type="time"
              label="Od"
              value={startTime}
              onChange={(value) => {
                setStartTime(value);
                addApi.setFieldErrors((prev) => ({ ...prev, startTime: undefined }));
              }}
              error={addApi.fieldErrors.startTime}
              icon={<CalendarPlus className="size-4" />}
              inputClassName={darkInputClass}
            />
            <FormField
              id="availability-end"
              type="time"
              label="Do"
              value={endTime}
              onChange={(value) => {
                setEndTime(value);
                addApi.setFieldErrors((prev) => ({ ...prev, endTime: undefined }));
              }}
              error={addApi.fieldErrors.endTime}
              icon={<CalendarPlus className="size-4" />}
              inputClassName={darkInputClass}
            />
          </div>

          <ServerError message={addApi.serverError} />

          <SubmitButton pendingText="Dodawanie..." icon={<CalendarPlus className="size-4" />} pending={addPending}>
            Dodaj dostępność
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

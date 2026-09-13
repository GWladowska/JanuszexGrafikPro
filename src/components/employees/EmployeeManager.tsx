import { useState } from "react";
import { CalendarPlus, Check, Mail, Pencil, Trash2, User, UserPlus, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ERROR_NETWORK, useApiErrorState } from "@/components/hooks/useApiErrorState";
import { parseContactEmail, parseEmployeeName } from "@/lib/services/employee-validation";
import type { EmployeeRow } from "@/lib/services/employee";
import { cn } from "@/lib/utils";

interface EmployeeManagerProps {
  initialEmployees: EmployeeRow[];
}

function extractEmployee(body: unknown): EmployeeRow | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const employee = (body as { employee?: unknown }).employee;
  if (typeof employee !== "object" || employee === null) {
    return null;
  }
  return employee as EmployeeRow;
}

export default function EmployeeManager({ initialEmployees }: EmployeeManagerProps) {
  const [employees, setEmployees] = useState<EmployeeRow[]>(initialEmployees);
  const addApi = useApiErrorState();
  const editApi = useApiErrorState();
  const deleteApi = useApiErrorState();

  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [addPending, setAddPending] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editPending, setEditPending] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  async function submitAdd(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const nameResult = parseEmployeeName(name);
    const emailResult = parseContactEmail(contactEmail);
    const nextErrors: Partial<Record<string, string>> = {};
    if (nameResult.fieldError !== null) {
      nextErrors.name = nameResult.fieldError;
    }
    if (emailResult.fieldError !== null) {
      nextErrors.contactEmail = emailResult.fieldError;
    }
    if (Object.keys(nextErrors).length > 0) {
      addApi.setFieldErrors(nextErrors);
      return;
    }

    addApi.setFieldErrors({});
    addApi.setServerError(null);
    setAddPending(true);
    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameResult.value, contactEmail: emailResult.value }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        addApi.applyApiError(responseBody);
        return;
      }
      const created = extractEmployee(responseBody);
      if (created !== null) {
        setEmployees((prev) => [...prev, created]);
      }
      setName("");
      setContactEmail("");
    } catch {
      addApi.setServerError(ERROR_NETWORK);
    } finally {
      setAddPending(false);
    }
  }

  function startEdit(employee: EmployeeRow) {
    setDeletingId(null);
    setEditingId(employee.id);
    setEditName(employee.name);
    setEditContactEmail(employee.contact_email ?? "");
    editApi.setFieldErrors({});
    editApi.setServerError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    editApi.setServerError(null);
  }

  async function submitEdit(event: React.SubmitEvent<HTMLFormElement>, id: string) {
    event.preventDefault();

    const nameResult = parseEmployeeName(editName);
    const emailResult = parseContactEmail(editContactEmail);
    const nextErrors: Partial<Record<string, string>> = {};
    if (nameResult.fieldError !== null) {
      nextErrors.name = nameResult.fieldError;
    }
    if (emailResult.fieldError !== null) {
      nextErrors.contactEmail = emailResult.fieldError;
    }
    if (Object.keys(nextErrors).length > 0) {
      editApi.setFieldErrors(nextErrors);
      return;
    }

    editApi.setFieldErrors({});
    editApi.setServerError(null);
    setEditPending(true);
    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: nameResult.value, contactEmail: emailResult.value }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        editApi.applyApiError(responseBody);
        return;
      }
      const updated = extractEmployee(responseBody);
      if (updated !== null) {
        setEmployees((prev) => prev.map((employee) => (employee.id === id ? updated : employee)));
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
      const response = await fetch("/api/employees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        deleteApi.applyApiError(responseBody);
        return;
      }
      setEmployees((prev) => prev.filter((employee) => employee.id !== id));
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

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wider text-blue-100/70 uppercase">Dodaj pracownika</h2>
        <form onSubmit={(event) => submitAdd(event)} noValidate className="space-y-4">
          <FormField
            id="employee-name"
            label="Imię i nazwisko"
            value={name}
            onChange={(value) => {
              setName(value);
              addApi.setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="Anna Kowalska"
            error={addApi.fieldErrors.name}
            icon={<User className="size-4" />}
          />
          <FormField
            id="employee-email"
            type="email"
            label="E-mail kontaktowy"
            value={contactEmail}
            onChange={(value) => {
              setContactEmail(value);
              addApi.setFieldErrors((prev) => ({ ...prev, contactEmail: undefined }));
            }}
            placeholder="anna@example.com"
            error={addApi.fieldErrors.contactEmail}
            icon={<Mail className="size-4" />}
          />

          <ServerError message={addApi.serverError} />

          <SubmitButton pendingText="Dodawanie..." icon={<UserPlus className="size-4" />} pending={addPending}>
            Dodaj pracownika
          </SubmitButton>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wider text-blue-100/70 uppercase">
          Zespół ({employees.length})
        </h2>
        {employees.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-blue-100/70">
            Nie masz jeszcze pracowników. Dodaj pierwszego w formularzu powyżej.
          </p>
        ) : (
          <ul className="space-y-3">
            {employees.map((employee) => {
              return (
                <li key={employee.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                  {editingId === employee.id ? (
                    <form onSubmit={(event) => submitEdit(event, employee.id)} noValidate className="space-y-3">
                      <FormField
                        id={`edit-name-${employee.id}`}
                        label="Imię i nazwisko"
                        value={editName}
                        onChange={(value) => {
                          setEditName(value);
                          editApi.setFieldErrors((prev) => ({ ...prev, name: undefined }));
                        }}
                        error={editApi.fieldErrors.name}
                        icon={<User className="size-4" />}
                      />
                      <FormField
                        id={`edit-email-${employee.id}`}
                        type="email"
                        label="E-mail kontaktowy"
                        value={editContactEmail}
                        onChange={(value) => {
                          setEditContactEmail(value);
                          editApi.setFieldErrors((prev) => ({ ...prev, contactEmail: undefined }));
                        }}
                        error={editApi.fieldErrors.contactEmail}
                        icon={<Mail className="size-4" />}
                      />

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
                  ) : deletingId === employee.id ? (
                    <div className="text-sm">
                      <p className="text-red-200">
                        Czy na pewno usunąć pracownika „{employee.name}”? Usunięte zostaną też jego dostępności i
                        przypisania w grafikach.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={deletePending}
                          onClick={() => {
                            void submitDelete(employee.id);
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
                      <div>
                        <p className="font-semibold text-blue-100">{employee.name}</p>
                        <p className="text-sm text-blue-100/60">{employee.contact_email ?? "—"}</p>
                        <p className="text-xs text-blue-100/40">
                          Dodano{" "}
                          {new Date(employee.created_at).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/availabilities?employee=${employee.id}`}
                          className={cn(actionButtonClass(false), "flex items-center gap-1")}
                        >
                          <CalendarPlus className="size-4" />
                          Dostępności
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            startEdit(employee);
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
                            setDeletingId(employee.id);
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
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <ServerError message={deleteApi.serverError} />
        </div>
      </section>
    </div>
  );
}

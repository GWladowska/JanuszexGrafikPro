import type { APIContext, APIRoute, AstroCookies } from "astro";
import type { CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { addDays, currentWeekStart } from "@/lib/week";
import { POST as businessPOST } from "@/pages/api/business/index";
import { POST as employeePOST } from "@/pages/api/employees/index";
import { POST as availabilityPOST } from "@/pages/api/availabilities/index";
import { GET as scheduleGET, PATCH as schedulePATCH, POST as schedulePOST } from "@/pages/api/schedules/index";
import { POST as assignmentPOST } from "@/pages/api/schedules/assignments";

export const DEFAULT_OPENING_HOURS = [
  { weekday: 1, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 2, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 3, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 4, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 5, opensAt: "08:00", closesAt: "18:00" },
] as const;

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  set(name: string, value: string, _options?: CookieOptions): void {
    if (value === "") {
      this.cookies.delete(name);
    } else {
      this.cookies.set(name, value);
    }
  }

  toHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

export interface SessionContext {
  userId: string;
  jar: CookieJar;
}

function sessionClient(jar: CookieJar) {
  const client = createClient(new Request("http://test.local").headers, jar as unknown as AstroCookies);
  if (!client) {
    throw new Error("Klient Supabase nie powstał — sprawdź SUPABASE_URL/SUPABASE_KEY (lokalnie .dev.vars).");
  }
  return client;
}

export async function signUpOwner(prefix: string): Promise<SessionContext> {
  const email = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "haslo12345!";

  const jar = new CookieJar();
  const client = sessionClient(jar);

  const { error: signUpError } = await client.auth.signUp({ email, password });
  if (signUpError) {
    throw new Error(`Rejestracja nie powiodła się: ${signUpError.message}`);
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Logowanie po rejestracji nie powiodło się: ${error.message}`);
  }

  return { userId: data.user.id, jar };
}

export async function signIn(email: string, password: string): Promise<SessionContext> {
  const jar = new CookieJar();
  const client = sessionClient(jar);

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Logowanie nie powiodło się: ${error.message}`);
  }

  return { userId: data.user.id, jar };
}

export function ownerClient(jar: CookieJar): Supabase {
  const request = new Request("http://test.local", { headers: { cookie: jar.toHeader() } });
  const client = createClient(request.headers, jar as unknown as AstroCookies);
  if (!client) {
    throw new Error("Klient Supabase nie powstał — sprawdź SUPABASE_URL/SUPABASE_KEY.");
  }
  return client;
}

export interface CallHandlerOptions {
  method: string;
  path: string;
  body?: unknown;
  user?: { id: string } | null;
  jar?: CookieJar;
}

export async function callHandler(handler: APIRoute, options: CallHandlerOptions): Promise<Response> {
  const { method, path, body, user = null, jar } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (jar) {
    headers.cookie = jar.toHeader();
  }

  const request = new Request(`http://test.local${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const context = {
    request,
    cookies: (jar ?? new CookieJar()) as unknown as AstroCookies,
    locals: { user: user as User | null },
    url: new URL(request.url),
    redirect: (_to: string) => new Response(null, { status: 302 }),
  } as unknown as APIContext;

  return handler(context);
}

export async function expectStatus(res: Response, status: number, what: string): Promise<void> {
  if (res.status !== status) {
    const text = await res.text();
    throw new Error(`Oczekiwano ${status} przy: ${what} — dostałem ${res.status}: ${text}`);
  }
}

export function weekStartOffset(days: number): string {
  return addDays(currentWeekStart(), days);
}

export async function createBusiness(
  jar: CookieJar,
  userId: string,
  name = "Kawiarnia Testowa",
  openingHours: readonly { weekday: number; opensAt: string; closesAt: string }[] = DEFAULT_OPENING_HOURS,
): Promise<string> {
  const res = await callHandler(businessPOST, {
    method: "POST",
    path: "/api/business",
    body: { name, openingHours },
    user: { id: userId },
    jar,
  });
  await expectStatus(res, 201, "utworzenie biznesu");
  const body = (await res.json()) as { business?: { id?: string } };
  if (!body.business?.id) {
    throw new Error("Brak business.id w odpowiedzi.");
  }
  return body.business.id;
}

export interface EmployeeInfo {
  id: string;
  name: string;
}

export async function createEmployee(
  jar: CookieJar,
  userId: string,
  name: string,
  contactEmail: string,
): Promise<EmployeeInfo> {
  const res = await callHandler(employeePOST, {
    method: "POST",
    path: "/api/employees",
    body: { name, contactEmail },
    user: { id: userId },
    jar,
  });
  await expectStatus(res, 201, "utworzenie pracownika");
  const body = (await res.json()) as { employee?: { id?: string; name?: string } };
  if (!body.employee?.id) {
    throw new Error("Brak employee.id w odpowiedzi.");
  }
  return { id: body.employee.id, name: body.employee.name ?? name };
}

export async function createAvailability(
  jar: CookieJar,
  userId: string,
  employeeId: string,
  workDate: string,
  startTime: string,
  endTime: string,
): Promise<string> {
  const res = await callHandler(availabilityPOST, {
    method: "POST",
    path: "/api/availabilities",
    body: { employeeId, workDate, startTime, endTime },
    user: { id: userId },
    jar,
  });
  await expectStatus(res, 201, `utworzenie dostępności dla ${workDate}`);
  const body = (await res.json()) as { availability?: { id?: string } };
  if (!body.availability?.id) {
    throw new Error("Brak availability.id w odpowiedzi.");
  }
  return body.availability.id;
}

export async function createDraft(jar: CookieJar, userId: string, weekStart: string): Promise<string> {
  const res = await callHandler(schedulePOST, {
    method: "POST",
    path: "/api/schedules",
    body: { weekStart },
    user: { id: userId },
    jar,
  });
  await expectStatus(res, 201, "utworzenie draftu grafiku");
  const body = (await res.json()) as { schedule?: { id?: string } };
  if (!body.schedule?.id) {
    throw new Error("Brak schedule.id w odpowiedzi.");
  }
  return body.schedule.id;
}

export interface AssignmentInput {
  weekStart: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
}

export async function createAssignment(jar: CookieJar, userId: string, input: AssignmentInput): Promise<string> {
  const res = await callHandler(assignmentPOST, {
    method: "POST",
    path: "/api/schedules/assignments",
    body: input,
    user: { id: userId },
    jar,
  });
  await expectStatus(res, 201, `utworzenie przypisania dla ${input.workDate}`);
  const body = (await res.json()) as { assignment?: { id?: string } };
  if (!body.assignment?.id) {
    throw new Error("Brak assignment.id w odpowiedzi.");
  }
  return body.assignment.id;
}

export async function saveSchedule(jar: CookieJar, userId: string, weekStart: string): Promise<Response> {
  return callHandler(schedulePATCH, {
    method: "PATCH",
    path: "/api/schedules",
    body: { weekStart, status: "saved" },
    user: { id: userId },
    jar,
  });
}

export interface ScheduleSnapshot {
  schedule: { id: string; status: string; week_start: string } | null;
  assignments: unknown[];
  availabilities: unknown[];
}

export async function getSchedule(jar: CookieJar, userId: string, weekStart: string): Promise<ScheduleSnapshot> {
  const res = await callHandler(scheduleGET, {
    method: "GET",
    path: `/api/schedules?week=${weekStart}`,
    user: { id: userId },
    jar,
  });
  await expectStatus(res, 200, "odczyt grafiku");
  return (await res.json()) as ScheduleSnapshot;
}

export interface OwnerWorld {
  userId: string;
  jar: CookieJar;
  businessId: string;
  employeeId: string;
  employeeName: string;
  weekStart: string;
  availabilityIds: string[];
  scheduleId: string;
}

export async function setupOwnerWorld(prefix: string, weekStart: string = weekStartOffset(7)): Promise<OwnerWorld> {
  const { userId, jar } = await signUpOwner(prefix);

  const businessId = await createBusiness(jar, userId, `${prefix} Kawiarnia`);
  const employee = await createEmployee(jar, userId, "Testowy Pracownik", `${prefix}-pracownik@example.com`);

  const availabilityIds: string[] = [];
  for (let offset = 0; offset < 5; offset++) {
    const id = await createAvailability(jar, userId, employee.id, addDays(weekStart, offset), "08:00", "18:00");
    availabilityIds.push(id);
  }

  const scheduleId = await createDraft(jar, userId, weekStart);

  return {
    userId,
    jar,
    businessId,
    employeeId: employee.id,
    employeeName: employee.name,
    weekStart,
    availabilityIds,
    scheduleId,
  };
}

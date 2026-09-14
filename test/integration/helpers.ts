import type { APIContext, APIRoute, AstroCookies } from "astro";
import type { CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { addDays, currentWeekStart } from "@/lib/week";
import { POST as businessPOST } from "@/pages/api/business/index";
import { POST as employeePOST } from "@/pages/api/employees/index";
import { POST as availabilityPOST } from "@/pages/api/availabilities/index";
import { POST as schedulePOST } from "@/pages/api/schedules/index";

export const DEFAULT_OPENING_HOURS = [
  { weekday: 1, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 2, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 3, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 4, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 5, opensAt: "08:00", closesAt: "18:00" },
] as const;

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
  const user = { id: userId };

  const businessRes = await callHandler(businessPOST, {
    method: "POST",
    path: "/api/business",
    body: { name: `${prefix} Kawiarnia`, openingHours: DEFAULT_OPENING_HOURS },
    user,
    jar,
  });
  await expectStatus(businessRes, 201, "utworzenie biznesu");
  const businessBody = (await businessRes.json()) as { business?: { id?: string } };
  if (!businessBody.business?.id) {
    throw new Error("Brak business.id w odpowiedzi.");
  }

  const employeeRes = await callHandler(employeePOST, {
    method: "POST",
    path: "/api/employees",
    body: { name: "Testowy Pracownik", contactEmail: `${prefix}-pracownik@example.com` },
    user,
    jar,
  });
  await expectStatus(employeeRes, 201, "utworzenie pracownika");
  const employeeBody = (await employeeRes.json()) as { employee?: { id?: string; name?: string } };
  if (!employeeBody.employee?.id) {
    throw new Error("Brak employee.id w odpowiedzi.");
  }

  const availabilityIds: string[] = [];
  for (let offset = 0; offset < 5; offset++) {
    const workDate = addDays(weekStart, offset);
    const res = await callHandler(availabilityPOST, {
      method: "POST",
      path: "/api/availabilities",
      body: {
        employeeId: employeeBody.employee.id,
        workDate,
        startTime: "08:00",
        endTime: "18:00",
      },
      user,
      jar,
    });
    await expectStatus(res, 201, `utworzenie dostępności dla ${workDate}`);
    const body = (await res.json()) as { availability?: { id?: string } };
    if (!body.availability?.id) {
      throw new Error("Brak availability.id w odpowiedzi.");
    }
    availabilityIds.push(body.availability.id);
  }

  const scheduleRes = await callHandler(schedulePOST, {
    method: "POST",
    path: "/api/schedules",
    body: { weekStart },
    user,
    jar,
  });
  await expectStatus(scheduleRes, 201, "utworzenie draftu grafiku");
  const scheduleBody = (await scheduleRes.json()) as { schedule?: { id?: string } };
  if (!scheduleBody.schedule?.id) {
    throw new Error("Brak schedule.id w odpowiedzi.");
  }

  return {
    userId,
    jar,
    businessId: businessBody.business.id,
    employeeId: employeeBody.employee.id,
    employeeName: employeeBody.employee.name ?? "",
    weekStart,
    availabilityIds,
    scheduleId: scheduleBody.schedule.id,
  };
}

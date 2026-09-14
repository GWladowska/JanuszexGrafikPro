import { describe, expect, it } from "vitest";
import { ERROR_AVAILABILITY_WEEK_FROZEN, ERROR_SCHEDULE_INCOMPLETE, ERROR_WEEK_FROZEN } from "@/lib/http";
import { POST as availabilityPOST } from "@/pages/api/availabilities/index";
import { PATCH as schedulePATCH } from "@/pages/api/schedules/index";
import {
  callHandler,
  createBusiness,
  createEmployee,
  ownerClient,
  signIn,
  signUpOwner,
  weekStartOffset,
} from "./helpers";

const SEED_BUSINESS_ID = "00000000-0000-4000-8000-000000000002";

async function freshOwner(prefix: string) {
  const { userId, jar } = await signUpOwner(prefix);
  await createBusiness(jar, userId);
  const employee = await createEmployee(jar, userId, "Anna Kowalska", `${prefix}@example.com`);
  return { userId, jar, employeeId: employee.id };
}

async function postAvailability(
  jar: import("./helpers").CookieJar,
  userId: string,
  employeeId: string,
  workDate: string,
): Promise<{ status: number; body: { error?: string } }> {
  const res = await callHandler(availabilityPOST, {
    method: "POST",
    path: "/api/availabilities",
    body: { employeeId, workDate, startTime: "08:00", endTime: "18:00" },
    user: { id: userId },
    jar,
  });
  return { status: res.status, body: (await res.json()) as { error?: string } };
}

describe("ryzyko #3 — zamrożenie dostępności i asymetria zapisu (realny czas)", () => {
  it("miniony tydzień: dostępność odrzucona 409 ERROR_AVAILABILITY_WEEK_FROZEN", async () => {
    const { userId, jar, employeeId } = await freshOwner("freeze-av-past");

    const result = await postAvailability(jar, userId, employeeId, weekStartOffset(-7));
    expect(result.status).toBe(409);
    expect(result.body.error).toBe(ERROR_AVAILABILITY_WEEK_FROZEN);
  });

  it("przyszły tydzień: dostępność przyjęta 201", async () => {
    const { userId, jar, employeeId } = await freshOwner("freeze-av-future");

    const result = await postAvailability(jar, userId, employeeId, weekStartOffset(7));
    expect(result.status).toBe(201);
  });

  it("bieżący tydzień bez zapisanego grafiku: dostępność przyjęta 201", async () => {
    const { userId, jar, employeeId } = await freshOwner("freeze-av-current");

    const result = await postAvailability(jar, userId, employeeId, weekStartOffset(0));
    expect(result.status).toBe(201);
  });

  it("odblokowanie zapisanego grafiku z minionego tygodnia: 409 ERROR_WEEK_FROZEN (seed)", async () => {
    const { userId, jar } = await signIn("owner@example.com", "haslo12345");
    const client = ownerClient(jar);
    const { data, error } = await client
      .from("schedules")
      .select("week_start")
      .eq("business_id", SEED_BUSINESS_ID)
      .eq("status", "saved")
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Nie znaleziono zapisanego grafiku seeda: ${error?.message}`);
    }

    const res = await callHandler(schedulePATCH, {
      method: "PATCH",
      path: "/api/schedules",
      body: { weekStart: data.week_start, status: "draft" },
      user: { id: userId },
      jar,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(ERROR_WEEK_FROZEN);
  });

  it("zapis draftu w bieżącym tygodniu NIE ma bramki zamrożenia — 400 incomplete zamiast 409 frozen (seed)", async () => {
    const { userId, jar } = await signIn("owner@example.com", "haslo12345");
    const client = ownerClient(jar);
    const { data, error } = await client
      .from("schedules")
      .select("week_start")
      .eq("business_id", SEED_BUSINESS_ID)
      .eq("status", "draft")
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Nie znaleziono draftu seeda: ${error?.message}`);
    }

    const res = await callHandler(schedulePATCH, {
      method: "PATCH",
      path: "/api/schedules",
      body: { weekStart: data.week_start, status: "saved" },
      user: { id: userId },
      jar,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(ERROR_SCHEDULE_INCOMPLETE);
    expect(body.error).not.toBe(ERROR_WEEK_FROZEN);
  });
});

import { describe, expect, it } from "vitest";
import { ERROR_SCHEDULE_INCOMPLETE, ERROR_SAVED_SCHEDULE, ERROR_SERVER } from "@/lib/http";
import { addDays } from "@/lib/week";
import { POST as assignmentPOST } from "@/pages/api/schedules/assignments";
import { PATCH as schedulePATCH } from "@/pages/api/schedules/index";
import {
  callHandler,
  createAssignment,
  createAvailability,
  createBusiness,
  createDraft,
  createEmployee,
  expectStatus,
  getSchedule,
  ownerClient,
  saveSchedule,
  signUpOwner,
  weekStartOffset,
} from "./helpers";

interface World {
  userId: string;
  jar: import("./helpers").CookieJar;
  weekStart: string;
}

async function world(prefix: string): Promise<World> {
  const { userId, jar } = await signUpOwner(prefix);
  return { userId, jar, weekStart: weekStartOffset(7) };
}

async function employeeWithFullAvailability(
  world: World,
  prefix: string,
): Promise<{ employeeId: string; businessId: string }> {
  const businessId = await createBusiness(world.jar, world.userId);
  const employee = await createEmployee(world.jar, world.userId, "Anna Kowalska", `${prefix}@example.com`);
  for (let offset = 0; offset < 5; offset++) {
    await createAvailability(world.jar, world.userId, employee.id, addDays(world.weekStart, offset), "08:00", "18:00");
  }
  return { employeeId: employee.id, businessId };
}

describe("ryzyko #1 — bramka zapisu po stronie serwera", () => {
  it("kompletny grafik zapisuje się (200, status saved)", async () => {
    const w = await world("save-complete");
    await employeeWithFullAvailability(w, "save-complete");
    const scheduleId = await createDraft(w.jar, w.userId, w.weekStart);

    const res = await saveSchedule(w.jar, w.userId, w.weekStart);
    await expectStatus(res, 200, "zapis kompletnego grafiku");
    const body = (await res.json()) as { schedule?: { id?: string; status?: string } };
    expect(body.schedule?.id).toBe(scheduleId);
    expect(body.schedule?.status).toBe("saved");
  });

  it("zapis z dziurą jest odrzucany (400 + blockers.holes opisuje wtorek)", async () => {
    const w = await world("save-hole");
    await createBusiness(w.jar, w.userId);
    const employee = await createEmployee(w.jar, w.userId, "Anna Kowalska", "save-hole@example.com");
    await createAvailability(w.jar, w.userId, employee.id, w.weekStart, "08:00", "18:00");
    await createDraft(w.jar, w.userId, w.weekStart);

    const res = await saveSchedule(w.jar, w.userId, w.weekStart);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error?: string;
      blockers?: { holes?: { workDate: string }[]; collisions?: unknown[] };
    };
    expect(body.error).toBe(ERROR_SCHEDULE_INCOMPLETE);
    expect(body.blockers?.holes?.length).toBe(4);
    expect(body.blockers?.holes?.some((hole) => hole.workDate === addDays(w.weekStart, 1))).toBe(true);
  });

  it("zapis z kolizją uncovered jest odrzucany (400 + blockers.collisions)", async () => {
    const w = await world("save-collision");
    await employeeWithFullAvailability(w, "save-collision");
    const uncoveredEmployee = await createEmployee(w.jar, w.userId, "Piotr Nowak", "save-collision-b@example.com");
    await createDraft(w.jar, w.userId, w.weekStart);
    await createAssignment(w.jar, w.userId, {
      weekStart: w.weekStart,
      employeeId: uncoveredEmployee.id,
      workDate: w.weekStart,
      startTime: "08:00",
      endTime: "18:00",
    });

    const res = await saveSchedule(w.jar, w.userId, w.weekStart);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error?: string;
      blockers?: {
        holes?: unknown[];
        collisions?: { kind?: string }[];
      };
    };
    expect(body.error).toBe(ERROR_SCHEDULE_INCOMPLETE);
    expect(body.blockers?.collisions?.some((collision) => collision.kind === "uncovered")).toBe(true);
  });

  it("ponowny zapis zapisanego grafiku daje 409 ERROR_SAVED_SCHEDULE", async () => {
    const w = await world("save-twice");
    await employeeWithFullAvailability(w, "save-twice");
    await createDraft(w.jar, w.userId, w.weekStart);
    await expectStatus(await saveSchedule(w.jar, w.userId, w.weekStart), 200, "pierwszy zapis");

    const res = await saveSchedule(w.jar, w.userId, w.weekStart);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(ERROR_SAVED_SCHEDULE);
  });

  it("zapis zmian na zapisanym grafiku daje 409 ERROR_SAVED_SCHEDULE", async () => {
    const w = await world("save-then-edit");
    const { employeeId } = await employeeWithFullAvailability(w, "save-then-edit");
    await createDraft(w.jar, w.userId, w.weekStart);
    await expectStatus(await saveSchedule(w.jar, w.userId, w.weekStart), 200, "zapis grafiku");

    const res = await callHandler(assignmentPOST, {
      method: "POST",
      path: "/api/schedules/assignments",
      body: {
        weekStart: w.weekStart,
        employeeId,
        workDate: w.weekStart,
        startTime: "08:00",
        endTime: "18:00",
      },
      user: { id: w.userId },
      jar: w.jar,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(ERROR_SAVED_SCHEDULE);
  });

  it("niezalogowany zapis daje 401 i nie zmienia stanu grafiku", async () => {
    const w = await world("save-unauth");
    await employeeWithFullAvailability(w, "save-unauth");
    await createDraft(w.jar, w.userId, w.weekStart);

    const res = await callHandler(schedulePATCH, {
      method: "PATCH",
      path: "/api/schedules",
      body: { weekStart: w.weekStart, status: "saved" },
    });
    expect(res.status).toBe(401);

    const snapshot = await getSchedule(w.jar, w.userId, w.weekStart);
    expect(snapshot.schedule?.status).toBe("draft");
  });

  it("uszkodzone dane przypisań dają 500 ERROR_SERVER (parsery z Fazy 1)", async () => {
    const w = await world("save-shape");
    const { businessId, employeeId } = await employeeWithFullAvailability(w, "save-shape");
    const scheduleId = await createDraft(w.jar, w.userId, w.weekStart);

    const client = ownerClient(w.jar);
    const inserted = await client.from("assignments").insert({
      business_id: businessId,
      schedule_id: scheduleId,
      employee_id: employeeId,
      work_date: w.weekStart,
      start_time: "23:59",
      end_time: "24:00",
    });
    if (inserted.error) {
      throw new Error(`Bezpośredni insert przypisania nie powiódł się: ${inserted.error.message}`);
    }

    const res = await saveSchedule(w.jar, w.userId, w.weekStart);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(ERROR_SERVER);
  });
});

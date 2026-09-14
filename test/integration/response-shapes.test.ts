import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { describe, expect, it } from "vitest";
import { ERROR_DUPLICATE_EMPLOYEE, ERROR_UNAUTHORIZED, ERROR_VALIDATION } from "@/lib/http";
import { PUT as openingHoursPUT } from "@/pages/api/business/opening-hours";
import { POST as businessPOST, PUT as businessPUT } from "@/pages/api/business/index";
import {
  DELETE as availabilityDELETE,
  POST as availabilityPOST,
  PUT as availabilityPUT,
} from "@/pages/api/availabilities/index";
import { DELETE as employeeDELETE, POST as employeePOST, PUT as employeePUT } from "@/pages/api/employees/index";
import { DELETE as scheduleDELETE, PATCH as schedulePATCH, POST as schedulePOST } from "@/pages/api/schedules/index";
import {
  DELETE as assignmentDELETE,
  POST as assignmentPOST,
  PUT as assignmentPUT,
} from "@/pages/api/schedules/assignments";
import { callHandler, createEmployee, setupOwnerWorld, weekStartOffset } from "./helpers";

interface ShapeCase {
  name: string;
  handler: APIRoute;
  method: string;
  path: string;
  body?: unknown;
}

const UNAUTH_MUTATIONS: ShapeCase[] = [
  { name: "POST /api/business", handler: businessPOST, method: "POST", path: "/api/business", body: { name: "X" } },
  { name: "PUT /api/business", handler: businessPUT, method: "PUT", path: "/api/business", body: { name: "X" } },
  {
    name: "PUT /api/business/opening-hours",
    handler: openingHoursPUT,
    method: "PUT",
    path: "/api/business/opening-hours",
    body: { openingHours: [{ weekday: 1, opensAt: "08:00", closesAt: "18:00" }] },
  },
  {
    name: "POST /api/employees",
    handler: employeePOST,
    method: "POST",
    path: "/api/employees",
    body: { name: "X", contactEmail: "x@example.com" },
  },
  {
    name: "PUT /api/employees",
    handler: employeePUT,
    method: "PUT",
    path: "/api/employees",
    body: { id: randomUUID(), name: "X", contactEmail: "x@example.com" },
  },
  {
    name: "DELETE /api/employees",
    handler: employeeDELETE,
    method: "DELETE",
    path: "/api/employees",
    body: { id: randomUUID() },
  },
  {
    name: "POST /api/availabilities",
    handler: availabilityPOST,
    method: "POST",
    path: "/api/availabilities",
    body: { employeeId: randomUUID(), workDate: "2026-04-13", startTime: "08:00", endTime: "18:00" },
  },
  {
    name: "PUT /api/availabilities",
    handler: availabilityPUT,
    method: "PUT",
    path: "/api/availabilities",
    body: { id: randomUUID(), employeeId: randomUUID(), workDate: "2026-04-13", startTime: "08:00", endTime: "18:00" },
  },
  {
    name: "DELETE /api/availabilities",
    handler: availabilityDELETE,
    method: "DELETE",
    path: "/api/availabilities",
    body: { id: randomUUID() },
  },
  {
    name: "POST /api/schedules",
    handler: schedulePOST,
    method: "POST",
    path: "/api/schedules",
    body: { weekStart: "2026-04-13" },
  },
  {
    name: "PATCH /api/schedules",
    handler: schedulePATCH,
    method: "PATCH",
    path: "/api/schedules",
    body: { weekStart: "2026-04-13", status: "saved" },
  },
  {
    name: "DELETE /api/schedules",
    handler: scheduleDELETE,
    method: "DELETE",
    path: "/api/schedules",
    body: { weekStart: "2026-04-13" },
  },
  {
    name: "POST /api/schedules/assignments",
    handler: assignmentPOST,
    method: "POST",
    path: "/api/schedules/assignments",
    body: {
      weekStart: "2026-04-13",
      employeeId: randomUUID(),
      workDate: "2026-04-13",
      startTime: "08:00",
      endTime: "18:00",
    },
  },
  {
    name: "PUT /api/schedules/assignments",
    handler: assignmentPUT,
    method: "PUT",
    path: "/api/schedules/assignments",
    body: { assignmentId: randomUUID(), startTime: "09:00", endTime: "17:00" },
  },
  {
    name: "DELETE /api/schedules/assignments",
    handler: assignmentDELETE,
    method: "DELETE",
    path: "/api/schedules/assignments",
    body: { assignmentId: randomUUID() },
  },
];

describe("ryzyko #6 — wspólny kształt odpowiedzi na trasach JSON", () => {
  it("wszystkie trasy mutacji bez sesji: 401 { error: ERROR_UNAUTHORIZED }", async () => {
    for (const testCase of UNAUTH_MUTATIONS) {
      const res = await callHandler(testCase.handler, {
        method: testCase.method,
        path: testCase.path,
        body: testCase.body,
      });
      expect(res.status, testCase.name).toBe(401);
      const body = (await res.json()) as { error?: string };
      expect(body.error, testCase.name).toBe(ERROR_UNAUTHORIZED);
    }
  });

  it("walidacja pól: 400 { error: ERROR_VALIDATION, fieldErrors } dla złego tygodnia", async () => {
    const world = await setupOwnerWorld("shape-400");

    const res = await callHandler(schedulePOST, {
      method: "POST",
      path: "/api/schedules",
      body: { weekStart: "nie-tydzien" },
      user: { id: world.userId },
      jar: world.jar,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; fieldErrors?: { weekStart?: string } };
    expect(body.error).toBe(ERROR_VALIDATION);
    expect(typeof body.fieldErrors?.weekStart).toBe("string");
  });

  it("mutacje na nieistniejących ID: 404 z kluczem error", async () => {
    const world = await setupOwnerWorld("shape-404");
    const user = { id: world.userId };
    const id = randomUUID();

    const cases: ShapeCase[] = [
      {
        name: "PUT /api/employees",
        handler: employeePUT,
        method: "PUT",
        path: "/api/employees",
        body: { id, name: "Nieistniejący", contactEmail: "nie@example.com" },
      },
      {
        name: "PUT /api/availabilities",
        handler: availabilityPUT,
        method: "PUT",
        path: "/api/availabilities",
        body: { id, employeeId: world.employeeId, workDate: world.weekStart, startTime: "08:00", endTime: "18:00" },
      },
      {
        name: "PUT /api/schedules/assignments",
        handler: assignmentPUT,
        method: "PUT",
        path: "/api/schedules/assignments",
        body: { assignmentId: id, startTime: "09:00", endTime: "17:00" },
      },
      {
        name: "DELETE /api/schedules/assignments",
        handler: assignmentDELETE,
        method: "DELETE",
        path: "/api/schedules/assignments",
        body: { assignmentId: id },
      },
      {
        name: "PATCH /api/schedules",
        handler: schedulePATCH,
        method: "PATCH",
        path: "/api/schedules",
        body: { weekStart: weekStartOffset(21), status: "saved" },
      },
    ];

    for (const testCase of cases) {
      const res = await callHandler(testCase.handler, {
        method: testCase.method,
        path: testCase.path,
        body: testCase.body,
        user,
        jar: world.jar,
      });
      expect(res.status, testCase.name).toBe(404);
      const body = (await res.json()) as { error?: string };
      expect(typeof body.error, testCase.name).toBe("string");
    }
  });

  it("duplikat pracownika: 409 { error: ERROR_DUPLICATE_EMPLOYEE }", async () => {
    const world = await setupOwnerWorld("shape-409");
    const user = { id: world.userId };

    const first = await createEmployee(world.jar, world.userId, "Duplikat", "duplikat@example.com");
    expect(first.id).toBeTruthy();

    const res = await callHandler(employeePOST, {
      method: "POST",
      path: "/api/employees",
      body: { name: "Duplikat", contactEmail: "duplikat@example.com" },
      user,
      jar: world.jar,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(ERROR_DUPLICATE_EMPLOYEE);
  });
});

import { describe, expect, it } from "vitest";
import {
  ERROR_ASSIGNMENT_NOT_FOUND,
  ERROR_AVAILABILITY_NOT_FOUND,
  ERROR_EMPLOYEE_NOT_FOUND,
  ERROR_SCHEDULE_NOT_FOUND,
  ERROR_UNAUTHORIZED,
} from "@/lib/http";
import { DELETE as availabilityDELETE, PUT as availabilityPUT } from "@/pages/api/availabilities/index";
import { DELETE as employeeDELETE, POST as employeePOST, PUT as employeePUT } from "@/pages/api/employees/index";
import { DELETE as scheduleDELETE, GET as scheduleGET, PATCH as schedulePATCH } from "@/pages/api/schedules/index";
import {
  DELETE as assignmentDELETE,
  POST as assignmentPOST,
  PUT as assignmentPUT,
} from "@/pages/api/schedules/assignments";
import { callHandler, expectStatus, ownerClient, setupOwnerWorld, weekStartOffset } from "./helpers";

describe("ryzyko #5 — izolacja między właścicielami i niezalogowane żądania", () => {
  it("właściciel B nie może odczytać ani zmienić zasobów właściciela A (404 na cudzych ID)", async () => {
    const a = await setupOwnerWorld("owner-a");
    const b = await setupOwnerWorld("owner-b", weekStartOffset(14));
    const asB = { user: { id: b.userId }, jar: b.jar };

    const aSchedule = await callHandler(scheduleGET, {
      method: "GET",
      path: `/api/schedules?week=${a.weekStart}`,
      user: { id: a.userId },
      jar: a.jar,
    });
    await expectStatus(aSchedule, 200, "odczyt grafiku A");
    const aBody = (await aSchedule.json()) as { assignments?: { id: string }[] };
    const aAssignmentId = aBody.assignments?.[0]?.id;
    if (!aAssignmentId) {
      throw new Error("Grafik A nie ma przypisań.");
    }

    const employeePut = await callHandler(employeePUT, {
      method: "PUT",
      path: "/api/employees",
      body: { id: a.employeeId, name: "Ktoś Obcy", contactEmail: "obcy@example.com" },
      ...asB,
    });
    expect(employeePut.status).toBe(404);
    expect(((await employeePut.json()) as { error?: string }).error).toBe(ERROR_EMPLOYEE_NOT_FOUND);

    const employeeDelete = await callHandler(employeeDELETE, {
      method: "DELETE",
      path: "/api/employees",
      body: { id: a.employeeId },
      ...asB,
    });
    expect(employeeDelete.status).toBe(404);

    const availabilityPut = await callHandler(availabilityPUT, {
      method: "PUT",
      path: "/api/availabilities",
      body: {
        id: a.availabilityIds[0],
        employeeId: b.employeeId,
        workDate: b.weekStart,
        startTime: "08:00",
        endTime: "18:00",
      },
      ...asB,
    });
    expect(availabilityPut.status).toBe(404);
    expect(((await availabilityPut.json()) as { error?: string }).error).toBe(ERROR_AVAILABILITY_NOT_FOUND);

    const availabilityDelete = await callHandler(availabilityDELETE, {
      method: "DELETE",
      path: "/api/availabilities",
      body: { id: a.availabilityIds[0] },
      ...asB,
    });
    expect(availabilityDelete.status).toBe(404);

    const assignmentPost = await callHandler(assignmentPOST, {
      method: "POST",
      path: "/api/schedules/assignments",
      body: {
        weekStart: b.weekStart,
        employeeId: a.employeeId,
        workDate: b.weekStart,
        startTime: "08:00",
        endTime: "18:00",
      },
      ...asB,
    });
    expect(assignmentPost.status).toBe(404);
    expect(((await assignmentPost.json()) as { error?: string }).error).toBe(ERROR_EMPLOYEE_NOT_FOUND);

    const assignmentPut = await callHandler(assignmentPUT, {
      method: "PUT",
      path: "/api/schedules/assignments",
      body: { assignmentId: aAssignmentId, startTime: "09:00", endTime: "17:00" },
      ...asB,
    });
    expect(assignmentPut.status).toBe(404);
    expect(((await assignmentPut.json()) as { error?: string }).error).toBe(ERROR_ASSIGNMENT_NOT_FOUND);

    const assignmentDelete = await callHandler(assignmentDELETE, {
      method: "DELETE",
      path: "/api/schedules/assignments",
      body: { assignmentId: aAssignmentId },
      ...asB,
    });
    expect(assignmentDelete.status).toBe(404);

    const schedulePatch = await callHandler(schedulePATCH, {
      method: "PATCH",
      path: "/api/schedules",
      body: { weekStart: a.weekStart, status: "saved" },
      ...asB,
    });
    expect(schedulePatch.status).toBe(404);
    expect(((await schedulePatch.json()) as { error?: string }).error).toBe(ERROR_SCHEDULE_NOT_FOUND);

    const scheduleDelete = await callHandler(scheduleDELETE, {
      method: "DELETE",
      path: "/api/schedules",
      body: { weekStart: a.weekStart },
      ...asB,
    });
    expect(scheduleDelete.status).toBe(404);

    const foreignWeekGet = await callHandler(scheduleGET, {
      method: "GET",
      path: `/api/schedules?week=${a.weekStart}`,
      ...asB,
    });
    await expectStatus(foreignWeekGet, 200, "odczyt cudzego tygodnia");
    const foreignBody = (await foreignWeekGet.json()) as { schedule?: unknown };
    expect(foreignBody.schedule).toBeNull();
  });

  it("niezalogowane żądanie dostaje 401 i nie zmienia danych", async () => {
    const a = await setupOwnerWorld("owner-unauth");
    const client = ownerClient(a.jar);

    const before = await client.from("employees").select("id").eq("business_id", a.businessId);
    if (before.error) {
      throw new Error(`Odczyt pracowników A nie powiódł się: ${before.error.message}`);
    }

    const res = await callHandler(employeePOST, {
      method: "POST",
      path: "/api/employees",
      body: { name: "Nieproszony Gość", contactEmail: "nieproszony@example.com" },
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error?: string }).error).toBe(ERROR_UNAUTHORIZED);

    const after = await client.from("employees").select("id").eq("business_id", a.businessId);
    if (after.error) {
      throw new Error(`Odczyt pracowników A po żądaniu nie powiódł się: ${after.error.message}`);
    }
    expect(after.data.length).toBe(before.data.length);
  });

  it("właściciel B może edytować własne zasoby (izolacja nie jest blanket denial)", async () => {
    const b = await setupOwnerWorld("owner-happy");

    const res = await callHandler(employeePUT, {
      method: "PUT",
      path: "/api/employees",
      body: {
        id: b.employeeId,
        name: "Zaktualizowany Pracownik",
        contactEmail: "zaktualizowany@example.com",
      },
      user: { id: b.userId },
      jar: b.jar,
    });
    await expectStatus(res, 200, "aktualizacja własnego pracownika");
    const body = (await res.json()) as { employee?: { id?: string; name?: string } };
    expect(body.employee?.id).toBe(b.employeeId);
    expect(body.employee?.name).toBe("Zaktualizowany Pracownik");
  });
});

import type { APIRoute } from "astro";
import { resolveBusinessId, resolveJsonBody, resolveRequestContext } from "@/lib/api";
import {
  ERROR_INVALID_BODY,
  ERROR_SCHEDULE_EXISTS,
  ERROR_SCHEDULE_INCOMPLETE,
  ERROR_SCHEDULE_NOT_FOUND,
  ERROR_SCHEDULE_NOT_SAVED,
  ERROR_SAVED_SCHEDULE,
  ERROR_SERVER,
  ERROR_VALIDATION,
  ERROR_WEEK_FROZEN,
  jsonResponse,
} from "@/lib/http";
import { getOpeningHours } from "@/lib/services/business";
import { getEmployees } from "@/lib/services/employee";
import {
  createScheduleWithAssignments,
  deleteSchedule,
  getAssignments,
  getAvailabilitiesForWeek,
  getScheduleByWeek,
  saveSchedule,
  unlockSchedule,
} from "@/lib/services/schedule";
import { findScheduleBlockers, generateDraft } from "@/lib/services/schedule-generation";
import {
  parseScheduleAssignmentRows,
  parseScheduleAvailabilities,
  parseScheduleDraftPieces,
  parseScheduleEmployees,
  parseScheduleOpeningHours,
  parseWeekStart,
} from "@/lib/services/schedule-validation";
import { isFrozenWeek } from "@/lib/week";

function parseWeekStartField(body: Record<string, unknown>): { weekStart: string } | Response {
  const result = parseWeekStart(body.weekStart);
  if (result.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { weekStart: result.fieldError } }, 400);
  }
  return { weekStart: result.value };
}

export const GET: APIRoute = async (context) => {
  const resolved = resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId } = resolved;

  const weekResult = parseWeekStart(context.url.searchParams.get("week"));
  if (weekResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { week: weekResult.fieldError } }, 400);
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const scheduleResult = await getScheduleByWeek(supabase, businessId, weekResult.value);
  if (scheduleResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const availabilitiesResult = await getAvailabilitiesForWeek(supabase, businessId, weekResult.value);
  if (availabilitiesResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const availabilities = parseScheduleAvailabilities(availabilitiesResult.data);
  if (availabilities.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  if (scheduleResult.data === null) {
    return jsonResponse({ schedule: null, assignments: [], availabilities: availabilities.data }, 200);
  }

  const assignmentsResult = await getAssignments(supabase, businessId, scheduleResult.data.id);
  if (assignmentsResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const assignments = parseScheduleAssignmentRows(assignmentsResult.data);
  if (assignments.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse(
    {
      schedule: scheduleResult.data,
      assignments: assignments.data,
      availabilities: availabilities.data,
    },
    200,
  );
};

export const POST: APIRoute = async (context) => {
  const resolved = resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId } = resolved;

  const bodyResult = await resolveJsonBody(context);
  if (bodyResult instanceof Response) {
    return bodyResult;
  }
  const body = bodyResult;

  const weekField = parseWeekStartField(body);
  if (weekField instanceof Response) {
    return weekField;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  if (isFrozenWeek(weekField.weekStart)) {
    return jsonResponse({ error: ERROR_WEEK_FROZEN }, 409);
  }

  const existing = await getScheduleByWeek(supabase, businessId, weekField.weekStart);
  if (existing.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (existing.data !== null) {
    return jsonResponse({ error: ERROR_SCHEDULE_EXISTS }, 409);
  }

  const openingHoursResult = await getOpeningHours(supabase, businessId);
  if (openingHoursResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const employeesResult = await getEmployees(supabase, businessId);
  if (employeesResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const availabilitiesResult = await getAvailabilitiesForWeek(supabase, businessId, weekField.weekStart);
  if (availabilitiesResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const employees = parseScheduleEmployees(employeesResult.data);
  if (employees.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const openingHours = parseScheduleOpeningHours(openingHoursResult.data);
  if (openingHours.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const availabilities = parseScheduleAvailabilities(availabilitiesResult.data);
  if (availabilities.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const draft = generateDraft({
    employees: employees.data,
    openingHours: openingHours.data,
    availabilities: availabilities.data,
  });

  const created = await createScheduleWithAssignments(supabase, businessId, weekField.weekStart, draft.assignments);
  if (created.error !== null) {
    if (created.error.code === "23505") {
      return jsonResponse({ error: ERROR_SCHEDULE_EXISTS }, 409);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ schedule: created.data.schedule, assignments: created.data.assignments }, 201);
};

export const DELETE: APIRoute = async (context) => {
  const resolved = resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId } = resolved;

  const bodyResult = await resolveJsonBody(context);
  if (bodyResult instanceof Response) {
    return bodyResult;
  }
  const body = bodyResult;

  const weekField = parseWeekStartField(body);
  if (weekField instanceof Response) {
    return weekField;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const existing = await getScheduleByWeek(supabase, businessId, weekField.weekStart);
  if (existing.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (existing.data === null) {
    return jsonResponse({ error: ERROR_SCHEDULE_NOT_FOUND }, 404);
  }
  if (existing.data.status !== "draft") {
    return jsonResponse({ error: ERROR_SAVED_SCHEDULE }, 409);
  }

  const result = await deleteSchedule(supabase, businessId, existing.data.id);
  if (result.error !== null) {
    if (result.error.code === "PGRST116") {
      return jsonResponse({ error: ERROR_SCHEDULE_NOT_FOUND }, 404);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ deleted: true }, 200);
};

export const PATCH: APIRoute = async (context) => {
  const resolved = resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId } = resolved;

  const bodyResult = await resolveJsonBody(context);
  if (bodyResult instanceof Response) {
    return bodyResult;
  }
  const body = bodyResult;

  const weekField = parseWeekStartField(body);
  if (weekField instanceof Response) {
    return weekField;
  }

  const status = body.status;
  if (status !== "saved" && status !== "draft") {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const scheduleResult = await getScheduleByWeek(supabase, businessId, weekField.weekStart);
  if (scheduleResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (scheduleResult.data === null) {
    return jsonResponse({ error: ERROR_SCHEDULE_NOT_FOUND }, 404);
  }
  const schedule = scheduleResult.data;

  if (status === "saved") {
    if (schedule.status !== "draft") {
      return jsonResponse({ error: ERROR_SAVED_SCHEDULE }, 409);
    }

    const openingHoursResult = await getOpeningHours(supabase, businessId);
    if (openingHoursResult.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }
    const availabilitiesResult = await getAvailabilitiesForWeek(supabase, businessId, weekField.weekStart);
    if (availabilitiesResult.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }
    const assignmentsResult = await getAssignments(supabase, businessId, schedule.id);
    if (assignmentsResult.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }

    const openingHours = parseScheduleOpeningHours(openingHoursResult.data);
    if (openingHours.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }

    const availabilities = parseScheduleAvailabilities(availabilitiesResult.data);
    if (availabilities.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }

    const pieces = parseScheduleDraftPieces(
      assignmentsResult.data.map((row) => ({
        employeeId: row.employee_id,
        workDate: row.work_date,
        startTime: row.start_time,
        endTime: row.end_time,
      })),
    );
    if (pieces.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }

    const blockers = findScheduleBlockers(openingHours.data, availabilities.data, pieces.data, weekField.weekStart);
    if (blockers.holes.length > 0 || blockers.collisions.length > 0) {
      return jsonResponse({ error: ERROR_SCHEDULE_INCOMPLETE, blockers }, 400);
    }

    const saved = await saveSchedule(supabase, businessId, schedule.id, openingHoursResult.data);
    if (saved.error !== null) {
      return jsonResponse({ error: ERROR_SAVED_SCHEDULE }, saved.error.code === "PGRST116" ? 409 : 500);
    }
    return jsonResponse({ schedule: saved.data }, 200);
  }

  if (schedule.status !== "saved") {
    return jsonResponse({ error: ERROR_SCHEDULE_NOT_SAVED }, 409);
  }

  if (isFrozenWeek(weekField.weekStart)) {
    return jsonResponse({ error: ERROR_WEEK_FROZEN }, 409);
  }

  const unlocked = await unlockSchedule(supabase, businessId, schedule.id);
  if (unlocked.error !== null) {
    return jsonResponse({ error: ERROR_SCHEDULE_NOT_SAVED }, unlocked.error.code === "PGRST116" ? 409 : 500);
  }
  return jsonResponse({ schedule: unlocked.data }, 200);
};

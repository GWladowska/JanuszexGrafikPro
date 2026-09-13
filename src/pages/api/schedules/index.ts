import type { APIRoute } from "astro";
import { resolveBusinessId, resolveJsonBody, resolveRequestContext } from "@/lib/api";
import {
  ERROR_SCHEDULE_EXISTS,
  ERROR_SCHEDULE_NOT_FOUND,
  ERROR_SAVED_SCHEDULE,
  ERROR_SERVER,
  ERROR_VALIDATION,
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
} from "@/lib/services/schedule";
import { generateDraft } from "@/lib/services/schedule-generation";
import { parseWeekStart } from "@/lib/services/schedule-validation";

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

  if (scheduleResult.data === null) {
    return jsonResponse({ schedule: null, assignments: [], availabilities: availabilitiesResult.data }, 200);
  }

  const assignmentsResult = await getAssignments(supabase, businessId, scheduleResult.data.id);
  if (assignmentsResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse(
    {
      schedule: scheduleResult.data,
      assignments: assignmentsResult.data,
      availabilities: availabilitiesResult.data,
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

  const draft = generateDraft({
    employees: employeesResult.data,
    openingHours: openingHoursResult.data,
    availabilities: availabilitiesResult.data,
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

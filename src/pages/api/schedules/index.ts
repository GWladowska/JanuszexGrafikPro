import type { APIContext, APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import {
  ERROR_ASSIGNMENT_NOT_FOUND,
  ERROR_BUSINESS_NOT_FOUND,
  ERROR_EMPLOYEE_NOT_AVAILABLE,
  ERROR_EMPLOYEE_NOT_FOUND,
  ERROR_INVALID_BODY,
  ERROR_NOT_CONFIGURED,
  ERROR_SAVED_SCHEDULE,
  ERROR_SCHEDULE_EXISTS,
  ERROR_SCHEDULE_NOT_FOUND,
  ERROR_SERVER,
  ERROR_UNAUTHORIZED,
  ERROR_VALIDATION,
  jsonResponse,
  readJsonBody,
} from "@/lib/http";
import { weekStartOf } from "@/lib/week";
import { getBusinessForOwner, getOpeningHours } from "@/lib/services/business";
import { getEmployeeById, getEmployees } from "@/lib/services/employee";
import {
  createScheduleWithAssignments,
  deleteSchedule,
  getAssignments,
  getAssignmentWithSchedule,
  getAvailabilitiesForWeek,
  getScheduleByWeek,
  updateAssignmentEmployee,
} from "@/lib/services/schedule";
import { generateDraft, isFullyCovered } from "@/lib/services/schedule-generation";
import { parseAssignmentId, parseEmployeeId, parseWeekStart } from "@/lib/services/schedule-validation";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

interface AuthContext {
  supabase: Supabase;
  ownerId: string;
}

function resolveRequestContext(context: APIContext): AuthContext | Response {
  const user = context.locals.user;
  if (!user) {
    return jsonResponse({ error: ERROR_UNAUTHORIZED }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: ERROR_NOT_CONFIGURED }, 500);
  }

  return { supabase, ownerId: user.id };
}

async function resolveBody(context: APIContext): Promise<Record<string, unknown> | Response> {
  const body = await readJsonBody(context.request);
  if (!body) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }
  return body;
}

async function resolveBusinessId(supabase: Supabase, ownerId: string): Promise<string | Response> {
  const business = await getBusinessForOwner(supabase, ownerId);
  if (business.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (business.data === null) {
    return jsonResponse({ error: ERROR_BUSINESS_NOT_FOUND }, 404);
  }
  return business.data.id;
}

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

  const body = await resolveBody(context);
  if (body instanceof Response) {
    return body;
  }

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

export const PUT: APIRoute = async (context) => {
  const resolved = resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId } = resolved;

  const body = await resolveBody(context);
  if (body instanceof Response) {
    return body;
  }

  const assignmentIdResult = parseAssignmentId(body.assignmentId);
  if (assignmentIdResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }

  const employeeIdResult = parseEmployeeId(body.employeeId);
  if (employeeIdResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const assignmentResult = await getAssignmentWithSchedule(supabase, businessId, assignmentIdResult.value);
  if (assignmentResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (assignmentResult.data === null) {
    return jsonResponse({ error: ERROR_ASSIGNMENT_NOT_FOUND }, 404);
  }

  const { assignment, scheduleStatus } = assignmentResult.data;
  if (scheduleStatus !== "draft") {
    return jsonResponse({ error: ERROR_SAVED_SCHEDULE }, 409);
  }

  const employeeResult = await getEmployeeById(supabase, businessId, employeeIdResult.value);
  if (employeeResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (employeeResult.data === null) {
    return jsonResponse({ error: ERROR_EMPLOYEE_NOT_FOUND }, 404);
  }

  const availabilitiesResult = await getAvailabilitiesForWeek(supabase, businessId, weekStartOf(assignment.work_date));
  if (availabilitiesResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  const covered = isFullyCovered(
    availabilitiesResult.data,
    employeeIdResult.value,
    assignment.work_date,
    assignment.start_time,
    assignment.end_time,
  );
  if (!covered) {
    return jsonResponse({ error: ERROR_EMPLOYEE_NOT_AVAILABLE }, 409);
  }

  const result = await updateAssignmentEmployee(supabase, businessId, assignmentIdResult.value, employeeIdResult.value);
  if (result.error !== null) {
    if (result.error.code === "PGRST116") {
      return jsonResponse({ error: ERROR_ASSIGNMENT_NOT_FOUND }, 404);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ assignment: result.data }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const resolved = resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId } = resolved;

  const body = await resolveBody(context);
  if (body instanceof Response) {
    return body;
  }

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

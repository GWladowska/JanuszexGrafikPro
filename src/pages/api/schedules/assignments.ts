import type { APIRoute } from "astro";
import { resolveBusinessId, resolveJsonBody, resolveRequestContext } from "@/lib/api";
import {
  ERROR_ASSIGNMENT_NOT_FOUND,
  ERROR_EMPLOYEE_NOT_FOUND,
  ERROR_INVALID_BODY,
  ERROR_OUTSIDE_OPENING_HOURS,
  ERROR_SAVED_SCHEDULE,
  ERROR_SCHEDULE_NOT_FOUND,
  ERROR_SERVER,
  ERROR_VALIDATION,
  ERROR_WORK_DATE_OUT_OF_WEEK,
  jsonResponse,
} from "@/lib/http";
import { addDays, isoWeekday } from "@/lib/week";
import { getEmployeeById } from "@/lib/services/employee";
import { getOpeningHours } from "@/lib/services/business";
import {
  createAssignment,
  deleteAssignment,
  getAssignmentWithSchedule,
  getScheduleByWeek,
  updateAssignmentEmployee,
  updateAssignmentTimes,
} from "@/lib/services/schedule";
import { isWithinOpeningHours } from "@/lib/services/schedule-generation";
import {
  parseAssignmentId,
  parseEmployeeId,
  parseShiftTime,
  parseWeekStart,
  parseWorkDate,
} from "@/lib/services/schedule-validation";

function fieldErrorResponse(field: string, message: string): Response {
  return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { [field]: message } }, 400);
}

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

  const weekStartResult = parseWeekStart(body.weekStart);
  if (weekStartResult.fieldError !== null) {
    return fieldErrorResponse("weekStart", weekStartResult.fieldError);
  }

  const employeeIdResult = parseEmployeeId(body.employeeId);
  if (employeeIdResult.fieldError !== null) {
    return fieldErrorResponse("employeeId", employeeIdResult.fieldError);
  }

  const workDateResult = parseWorkDate(body.workDate);
  if (workDateResult.fieldError !== null) {
    return fieldErrorResponse("workDate", workDateResult.fieldError);
  }

  const startResult = parseShiftTime(body.startTime);
  if (startResult.fieldError !== null) {
    return fieldErrorResponse("startTime", startResult.fieldError);
  }

  const endResult = parseShiftTime(body.endTime);
  if (endResult.fieldError !== null) {
    return fieldErrorResponse("endTime", endResult.fieldError);
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const scheduleResult = await getScheduleByWeek(supabase, businessId, weekStartResult.value);
  if (scheduleResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (scheduleResult.data === null) {
    return jsonResponse({ error: ERROR_SCHEDULE_NOT_FOUND }, 404);
  }
  if (scheduleResult.data.status !== "draft") {
    return jsonResponse({ error: ERROR_SAVED_SCHEDULE }, 409);
  }

  const weekEnd = addDays(weekStartResult.value, 6);
  if (workDateResult.value < weekStartResult.value || workDateResult.value > weekEnd) {
    return jsonResponse({ error: ERROR_WORK_DATE_OUT_OF_WEEK }, 400);
  }

  const openingHoursResult = await getOpeningHours(supabase, businessId);
  if (openingHoursResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (
    !isWithinOpeningHours(openingHoursResult.data, isoWeekday(workDateResult.value), startResult.value, endResult.value)
  ) {
    return jsonResponse({ error: ERROR_OUTSIDE_OPENING_HOURS }, 400);
  }

  const employeeResult = await getEmployeeById(supabase, businessId, employeeIdResult.value);
  if (employeeResult.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (employeeResult.data === null) {
    return jsonResponse({ error: ERROR_EMPLOYEE_NOT_FOUND }, 404);
  }

  const result = await createAssignment(supabase, businessId, scheduleResult.data.id, {
    employeeId: employeeIdResult.value,
    workDate: workDateResult.value,
    startTime: startResult.value,
    endTime: endResult.value,
  });
  if (result.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ assignment: result.data }, 201);
};

export const PUT: APIRoute = async (context) => {
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

  const assignmentIdResult = parseAssignmentId(body.assignmentId);
  if (assignmentIdResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }

  const employeeIdProvided = body.employeeId !== undefined;
  let employeeId: string | null = null;
  if (employeeIdProvided) {
    const employeeIdResult = parseEmployeeId(body.employeeId);
    if (employeeIdResult.fieldError !== null) {
      return fieldErrorResponse("employeeId", employeeIdResult.fieldError);
    }
    employeeId = employeeIdResult.value;
  }

  const startTimeProvided = body.startTime !== undefined;
  const endTimeProvided = body.endTime !== undefined;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (startTimeProvided) {
    const startResult = parseShiftTime(body.startTime);
    if (startResult.fieldError !== null) {
      return fieldErrorResponse("startTime", startResult.fieldError);
    }
    startTime = startResult.value;
  }
  if (endTimeProvided) {
    const endResult = parseShiftTime(body.endTime);
    if (endResult.fieldError !== null) {
      return fieldErrorResponse("endTime", endResult.fieldError);
    }
    endTime = endResult.value;
  }

  if (!employeeIdProvided && !startTimeProvided && !endTimeProvided) {
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

  if (employeeId !== null) {
    const employeeResult = await getEmployeeById(supabase, businessId, employeeId);
    if (employeeResult.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }
    if (employeeResult.data === null) {
      return jsonResponse({ error: ERROR_EMPLOYEE_NOT_FOUND }, 404);
    }
  }

  const timesProvided = startTimeProvided || endTimeProvided;
  const targetStart = startTime ?? assignment.start_time;
  const targetEnd = endTime ?? assignment.end_time;
  if (timesProvided) {
    const openingHoursResult = await getOpeningHours(supabase, businessId);
    if (openingHoursResult.error !== null) {
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }
    if (!isWithinOpeningHours(openingHoursResult.data, isoWeekday(assignment.work_date), targetStart, targetEnd)) {
      return jsonResponse({ error: ERROR_OUTSIDE_OPENING_HOURS }, 400);
    }
  }

  if (employeeId !== null) {
    const employeeUpdate = await updateAssignmentEmployee(supabase, businessId, assignmentIdResult.value, employeeId);
    if (employeeUpdate.error !== null) {
      if (employeeUpdate.error.code === "PGRST116") {
        return jsonResponse({ error: ERROR_ASSIGNMENT_NOT_FOUND }, 404);
      }
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }
    if (!timesProvided) {
      return jsonResponse({ assignment: employeeUpdate.data }, 200);
    }
  }

  if (timesProvided) {
    const timesUpdate = await updateAssignmentTimes(
      supabase,
      businessId,
      assignmentIdResult.value,
      targetStart,
      targetEnd,
    );
    if (timesUpdate.error !== null) {
      if (timesUpdate.error.code === "PGRST116") {
        return jsonResponse({ error: ERROR_ASSIGNMENT_NOT_FOUND }, 404);
      }
      return jsonResponse({ error: ERROR_SERVER }, 500);
    }
    return jsonResponse({ assignment: timesUpdate.data }, 200);
  }

  return jsonResponse({ error: ERROR_SERVER }, 500);
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

  const assignmentIdResult = parseAssignmentId(body.assignmentId);
  if (assignmentIdResult.fieldError !== null) {
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

  if (assignmentResult.data.scheduleStatus !== "draft") {
    return jsonResponse({ error: ERROR_SAVED_SCHEDULE }, 409);
  }

  const result = await deleteAssignment(supabase, businessId, assignmentIdResult.value);
  if (result.error !== null) {
    if (result.error.code === "PGRST116") {
      return jsonResponse({ error: ERROR_ASSIGNMENT_NOT_FOUND }, 404);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ deleted: true }, 200);
};

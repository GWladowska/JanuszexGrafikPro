import type { APIRoute } from "astro";
import { resolveBusinessId, resolveJsonBody, resolveRequestContext } from "@/lib/api";
import {
  ERROR_AVAILABILITY_NOT_FOUND,
  ERROR_EMPLOYEE_NOT_FOUND,
  ERROR_INVALID_BODY,
  ERROR_OVERLAPPING_AVAILABILITY,
  ERROR_SERVER,
  ERROR_VALIDATION,
  jsonResponse,
} from "@/lib/http";
import type { createClient } from "@/lib/supabase";
import { getEmployeeById } from "@/lib/services/employee";
import {
  createAvailability,
  deleteAvailability,
  findOverlappingAvailability,
  updateAvailability,
} from "@/lib/services/availability";
import type { AvailabilityInput } from "@/lib/services/availability-validation";
import { parseAvailabilityTime, parseWorkDate, validateTimeRange } from "@/lib/services/availability-validation";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAvailabilityId(body: Record<string, unknown>): { id: string } | Response {
  const id = body.id;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }
  return { id };
}

function parseEmployeeId(body: Record<string, unknown>): { employeeId: string } | Response {
  const employeeId = body.employeeId;
  if (typeof employeeId !== "string" || !UUID_PATTERN.test(employeeId)) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { employeeId: "Wybierz pracownika." } }, 400);
  }
  return { employeeId };
}

function parseAvailabilityInput(
  body: Record<string, unknown>,
  employeeId: string,
): { input: AvailabilityInput } | Response {
  const dateResult = parseWorkDate(body.workDate);
  if (dateResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { workDate: dateResult.fieldError } }, 400);
  }

  const startResult = parseAvailabilityTime(body.startTime);
  if (startResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { startTime: startResult.fieldError } }, 400);
  }

  const endResult = parseAvailabilityTime(body.endTime);
  if (endResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { endTime: endResult.fieldError } }, 400);
  }

  const rangeError = validateTimeRange(startResult.value, endResult.value);
  if (rangeError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { endTime: rangeError } }, 400);
  }

  return { input: { employeeId, workDate: dateResult.value, startTime: startResult.value, endTime: endResult.value } };
}

async function resolveEmployeeMembership(
  supabase: Supabase,
  businessId: string,
  employeeId: string,
): Promise<Response | null> {
  const employee = await getEmployeeById(supabase, businessId, employeeId);
  if (employee.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (employee.data === null) {
    return jsonResponse({ error: ERROR_EMPLOYEE_NOT_FOUND }, 404);
  }
  return null;
}

async function resolveOverlapping(
  supabase: Supabase,
  businessId: string,
  employeeId: string,
  input: AvailabilityInput,
  excludeAvailabilityId?: string,
): Promise<Response | null> {
  const overlap = await findOverlappingAvailability(
    supabase,
    businessId,
    employeeId,
    input.workDate,
    input.startTime,
    input.endTime,
    excludeAvailabilityId,
  );
  if (overlap.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (overlap.data !== null) {
    return jsonResponse({ error: ERROR_OVERLAPPING_AVAILABILITY }, 409);
  }
  return null;
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

  const employeeIdResult = parseEmployeeId(body);
  if (employeeIdResult instanceof Response) {
    return employeeIdResult;
  }

  const parsed = parseAvailabilityInput(body, employeeIdResult.employeeId);
  if (parsed instanceof Response) {
    return parsed;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const membershipError = await resolveEmployeeMembership(supabase, businessId, parsed.input.employeeId);
  if (membershipError !== null) {
    return membershipError;
  }

  const overlapError = await resolveOverlapping(supabase, businessId, parsed.input.employeeId, parsed.input);
  if (overlapError !== null) {
    return overlapError;
  }

  const result = await createAvailability(supabase, businessId, parsed.input);
  if (result.error !== null) {
    if (result.error.code === "23P01") {
      return jsonResponse({ error: ERROR_OVERLAPPING_AVAILABILITY }, 409);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ availability: result.data }, 201);
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

  const idResult = parseAvailabilityId(body);
  if (idResult instanceof Response) {
    return idResult;
  }

  const employeeIdResult = parseEmployeeId(body);
  if (employeeIdResult instanceof Response) {
    return employeeIdResult;
  }

  const parsed = parseAvailabilityInput(body, employeeIdResult.employeeId);
  if (parsed instanceof Response) {
    return parsed;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const membershipError = await resolveEmployeeMembership(supabase, businessId, parsed.input.employeeId);
  if (membershipError !== null) {
    return membershipError;
  }

  const overlapError = await resolveOverlapping(
    supabase,
    businessId,
    parsed.input.employeeId,
    parsed.input,
    idResult.id,
  );
  if (overlapError !== null) {
    return overlapError;
  }

  const result = await updateAvailability(supabase, businessId, idResult.id, parsed.input);
  if (result.error !== null) {
    if (result.error.code === "PGRST116") {
      return jsonResponse({ error: ERROR_AVAILABILITY_NOT_FOUND }, 404);
    }
    if (result.error.code === "23P01") {
      return jsonResponse({ error: ERROR_OVERLAPPING_AVAILABILITY }, 409);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ availability: result.data }, 200);
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

  const idResult = parseAvailabilityId(body);
  if (idResult instanceof Response) {
    return idResult;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const result = await deleteAvailability(supabase, businessId, idResult.id);
  if (result.error !== null) {
    if (result.error.code === "PGRST116") {
      return jsonResponse({ error: ERROR_AVAILABILITY_NOT_FOUND }, 404);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ deleted: true }, 200);
};

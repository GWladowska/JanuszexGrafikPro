import type { APIContext, APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import {
  ERROR_BUSINESS_NOT_FOUND,
  ERROR_DUPLICATE_EMPLOYEE,
  ERROR_EMPLOYEE_NOT_FOUND,
  ERROR_INVALID_BODY,
  ERROR_NOT_CONFIGURED,
  ERROR_SERVER,
  ERROR_UNAUTHORIZED,
  ERROR_VALIDATION,
  jsonResponse,
  readJsonBody,
} from "@/lib/http";
import { getBusinessForOwner } from "@/lib/services/business";
import { createEmployee, deleteEmployee, updateEmployee } from "@/lib/services/employee";
import type { EmployeeInput } from "@/lib/services/employee-validation";
import { parseContactEmail, parseEmployeeName } from "@/lib/services/employee-validation";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestContext {
  supabase: Supabase;
  ownerId: string;
  body: Record<string, unknown>;
}

async function resolveRequestContext(context: APIContext): Promise<RequestContext | Response> {
  const user = context.locals.user;
  if (!user) {
    return jsonResponse({ error: ERROR_UNAUTHORIZED }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: ERROR_NOT_CONFIGURED }, 500);
  }

  const body = await readJsonBody(context.request);
  if (!body) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }

  return { supabase, ownerId: user.id, body };
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

function parseEmployeeInput(body: Record<string, unknown>): { input: EmployeeInput } | Response {
  const nameResult = parseEmployeeName(body.name);
  if (nameResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { name: nameResult.fieldError } }, 400);
  }

  const emailResult = parseContactEmail(body.contactEmail);
  if (emailResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { contactEmail: emailResult.fieldError } }, 400);
  }

  return { input: { name: nameResult.value, contactEmail: emailResult.value } };
}

function parseEmployeeId(body: Record<string, unknown>): { id: string } | Response {
  const id = body.id;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }
  return { id };
}

function isDuplicateViolation(error: { code?: string | null }): boolean {
  return error.code === "23505";
}

export const POST: APIRoute = async (context) => {
  const resolved = await resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId, body } = resolved;

  const parsed = parseEmployeeInput(body);
  if (parsed instanceof Response) {
    return parsed;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const result = await createEmployee(supabase, businessId, parsed.input);
  if (result.error !== null) {
    if (isDuplicateViolation(result.error)) {
      return jsonResponse({ error: ERROR_DUPLICATE_EMPLOYEE }, 409);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ employee: result.data }, 201);
};

export const PUT: APIRoute = async (context) => {
  const resolved = await resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId, body } = resolved;

  const idResult = parseEmployeeId(body);
  if (idResult instanceof Response) {
    return idResult;
  }

  const parsed = parseEmployeeInput(body);
  if (parsed instanceof Response) {
    return parsed;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const result = await updateEmployee(supabase, businessId, idResult.id, parsed.input);
  if (result.error !== null) {
    if (result.error.code === "PGRST116") {
      return jsonResponse({ error: ERROR_EMPLOYEE_NOT_FOUND }, 404);
    }
    if (isDuplicateViolation(result.error)) {
      return jsonResponse({ error: ERROR_DUPLICATE_EMPLOYEE }, 409);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ employee: result.data }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const resolved = await resolveRequestContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }
  const { supabase, ownerId, body } = resolved;

  const idResult = parseEmployeeId(body);
  if (idResult instanceof Response) {
    return idResult;
  }

  const businessId = await resolveBusinessId(supabase, ownerId);
  if (businessId instanceof Response) {
    return businessId;
  }

  const result = await deleteEmployee(supabase, businessId, idResult.id);
  if (result.error !== null) {
    if (result.error.code === "PGRST116") {
      return jsonResponse({ error: ERROR_EMPLOYEE_NOT_FOUND }, 404);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ deleted: true }, 200);
};

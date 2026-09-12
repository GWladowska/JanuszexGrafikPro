import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createBusiness, getBusinessForOwner, updateBusinessName } from "@/lib/services/business";
import type { OpeningHoursDay } from "@/lib/services/business-validation";
import { parseBusinessName, parseOpeningWeek } from "@/lib/services/business-validation";

const ERROR_UNAUTHORIZED = "Wymagane zalogowanie.";
const ERROR_NOT_CONFIGURED = "Supabase is not configured";
const ERROR_INVALID_BODY = "Nieprawidłowe dane wejściowe.";
const ERROR_VALIDATION = "Formularz zawiera błędy.";
const ERROR_DUPLICATE_BUSINESS = "Masz już swój biznes";
const ERROR_BUSINESS_NOT_FOUND = "Nie znaleziono biznesu.";
const ERROR_SERVER = "Wystąpił błąd serwera. Spróbuj ponownie.";

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
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

  const nameResult = parseBusinessName(body.name);
  if (nameResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { name: nameResult.fieldError } }, 400);
  }

  let openingHours: OpeningHoursDay[] | undefined;
  if (body.openingHours !== undefined) {
    const weekResult = parseOpeningWeek(body.openingHours);
    if (weekResult.fieldErrors !== null) {
      return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: weekResult.fieldErrors }, 400);
    }
    openingHours = weekResult.value;
  }

  const result = await createBusiness(supabase, user.id, { name: nameResult.value, openingHours });
  if (result.error !== null) {
    if (result.error.code === "23505") {
      return jsonResponse({ error: ERROR_DUPLICATE_BUSINESS }, 409);
    }
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ business: result.data }, 201);
};

export const PUT: APIRoute = async (context) => {
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

  const nameResult = parseBusinessName(body.name);
  if (nameResult.fieldError !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: { name: nameResult.fieldError } }, 400);
  }

  const existing = await getBusinessForOwner(supabase, user.id);
  if (existing.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (existing.data === null) {
    return jsonResponse({ error: ERROR_BUSINESS_NOT_FOUND }, 404);
  }

  const result = await updateBusinessName(supabase, existing.data.id, nameResult.value);
  if (result.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ business: result.data }, 200);
};

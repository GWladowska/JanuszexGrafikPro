import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getBusinessForOwner, toOpeningHoursDays, upsertOpeningWeek } from "@/lib/services/business";
import { parseOpeningWeek } from "@/lib/services/business-validation";

const ERROR_UNAUTHORIZED = "Wymagane zalogowanie.";
const ERROR_NOT_CONFIGURED = "Supabase is not configured";
const ERROR_INVALID_BODY = "Nieprawidłowe dane wejściowe.";
const ERROR_VALIDATION = "Formularz zawiera błędy.";
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

  const weekResult = parseOpeningWeek(body.openingHours);
  if (weekResult.fieldErrors !== null) {
    return jsonResponse({ error: ERROR_VALIDATION, fieldErrors: weekResult.fieldErrors }, 400);
  }

  const existing = await getBusinessForOwner(supabase, user.id);
  if (existing.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (existing.data === null) {
    return jsonResponse({ error: ERROR_BUSINESS_NOT_FOUND }, 404);
  }

  const result = await upsertOpeningWeek(supabase, existing.data.id, weekResult.value);
  if (result.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }

  return jsonResponse({ openingHours: toOpeningHoursDays(result.data) }, 200);
};

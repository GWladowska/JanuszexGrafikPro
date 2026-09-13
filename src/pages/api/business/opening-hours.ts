import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import {
  ERROR_BUSINESS_NOT_FOUND,
  ERROR_INVALID_BODY,
  ERROR_NOT_CONFIGURED,
  ERROR_SERVER,
  ERROR_UNAUTHORIZED,
  ERROR_VALIDATION,
  jsonResponse,
  readJsonBody,
} from "@/lib/http";
import { getBusinessForOwner, toOpeningHoursDays, upsertOpeningWeek } from "@/lib/services/business";
import { parseOpeningWeek } from "@/lib/services/business-validation";

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

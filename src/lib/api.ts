import type { APIContext } from "astro";
import {
  ERROR_BUSINESS_NOT_FOUND,
  ERROR_INVALID_BODY,
  ERROR_NOT_CONFIGURED,
  ERROR_SERVER,
  ERROR_UNAUTHORIZED,
  jsonResponse,
  readJsonBody,
} from "@/lib/http";
import { getBusinessForOwner } from "@/lib/services/business";
import { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export interface RequestAuthContext {
  supabase: Supabase;
  ownerId: string;
}

export function resolveRequestContext(context: APIContext): RequestAuthContext | Response {
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

export async function resolveJsonBody(context: APIContext): Promise<Record<string, unknown> | Response> {
  const body = await readJsonBody(context.request);
  if (!body) {
    return jsonResponse({ error: ERROR_INVALID_BODY }, 400);
  }
  return body;
}

export async function resolveBusinessId(supabase: Supabase, ownerId: string): Promise<string | Response> {
  const business = await getBusinessForOwner(supabase, ownerId);
  if (business.error !== null) {
    return jsonResponse({ error: ERROR_SERVER }, 500);
  }
  if (business.data === null) {
    return jsonResponse({ error: ERROR_BUSINESS_NOT_FOUND }, 404);
  }
  return business.data.id;
}

import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/business", "/employees", "/availabilities", "/schedules"];

const AUTH_ROUTES = ["/auth/signin", "/auth/signup", "/auth/confirm-email", "/api/auth/signin", "/api/auth/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (AUTH_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (context.locals.user) {
      return context.redirect("/dashboard");
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});

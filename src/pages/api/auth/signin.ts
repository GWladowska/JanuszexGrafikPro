import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Błąd konfiguracji serwera.")}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const isCredentialsError = typeof error.status === "number" && error.status >= 400 && error.status < 500;
    const message = isCredentialsError ? error.message : "Serwer logowania chwilowo niedostępny. Spróbuj ponownie.";
    return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/dashboard");
};

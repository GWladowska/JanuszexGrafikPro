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
    const knownMessages: Record<string, string> = {
      "Invalid login credentials": "Nieprawidłowy adres e-mail lub hasło.",
      "Invalid email or password": "Nieprawidłowy adres e-mail lub hasło.",
      "Email not confirmed": "Adres e-mail nie został potwierdzony. Sprawdź swoją skrzynkę.",
      "User not found": "Nie znaleziono konta z tym adresem e-mail.",
    };
    const message = isCredentialsError
      ? (knownMessages[error.message] ?? "Logowanie nie powiodło się. Sprawdź dane i spróbuj ponownie.")
      : "Serwer logowania chwilowo niedostępny. Spróbuj ponownie.";
    return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/dashboard");
};

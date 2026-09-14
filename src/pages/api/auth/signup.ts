import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Błąd konfiguracji serwera.")}`);
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const isClientError = typeof error.status === "number" && error.status >= 400 && error.status < 500;
    const knownMessages: Record<string, string> = {
      "User already registered": "Konto z tym adresem e-mail już istnieje.",
      "Password should be at least 6 characters": "Hasło musi mieć co najmniej 6 znaków.",
      "Unable to validate email address: invalid format": "Podaj prawidłowy adres e-mail.",
    };
    const message = isClientError
      ? (knownMessages[error.message] ?? "Rejestracja nie powiodła się. Sprawdź dane i spróbuj ponownie.")
      : "Serwer rejestracji chwilowo niedostępny. Spróbuj ponownie.";
    return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/auth/confirm-email");
};

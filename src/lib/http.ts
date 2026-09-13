export const ERROR_UNAUTHORIZED = "Wymagane zalogowanie.";
export const ERROR_NOT_CONFIGURED = "Błąd konfiguracji serwera.";
export const ERROR_INVALID_BODY = "Nieprawidłowe dane wejściowe.";
export const ERROR_VALIDATION = "Formularz zawiera błędy.";
export const ERROR_DUPLICATE_BUSINESS = "Masz już swój biznes";
export const ERROR_BUSINESS_NOT_FOUND = "Nie znaleziono biznesu.";
export const ERROR_SERVER = "Wystąpił błąd serwera. Spróbuj ponownie.";

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
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

export function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

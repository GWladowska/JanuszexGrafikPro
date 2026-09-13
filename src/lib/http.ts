export const ERROR_UNAUTHORIZED = "Wymagane zalogowanie.";
export const ERROR_NOT_CONFIGURED = "Błąd konfiguracji serwera.";
export const ERROR_INVALID_BODY = "Nieprawidłowe dane wejściowe.";
export const ERROR_VALIDATION = "Formularz zawiera błędy.";
export const ERROR_DUPLICATE_BUSINESS = "Masz już swój biznes";
export const ERROR_BUSINESS_NOT_FOUND = "Nie znaleziono biznesu.";
export const ERROR_DUPLICATE_EMPLOYEE = "Pracownik o takim imieniu i nazwisku oraz e-mailu już jest na liście.";
export const ERROR_EMPLOYEE_NOT_FOUND = "Nie znaleziono pracownika.";
export const ERROR_AVAILABILITY_NOT_FOUND = "Nie znaleziono wpisu dostępności.";
export const ERROR_OVERLAPPING_AVAILABILITY =
  "Ten pracownik ma już dostępność nakładającą się na ten przedział — zedytuj istniejący wpis.";
export const ERROR_SCHEDULE_EXISTS = "Draft grafiku dla tego tygodnia już istnieje";
export const ERROR_SCHEDULE_NOT_FOUND = "Nie znaleziono grafiku dla tego tygodnia";
export const ERROR_SAVED_SCHEDULE = "Grafik jest już zapisany i nie można go zmieniać";
export const ERROR_SCHEDULE_INCOMPLETE = "Grafik nie jest kompletny — uzupełnij dziury i usuń kolizje przed zapisem.";
export const ERROR_SCHEDULE_NOT_SAVED = "Grafik nie jest zapisany.";
export const ERROR_ASSIGNMENT_NOT_FOUND = "Nie znaleziono przypisania zmiany";
export const ERROR_OUTSIDE_OPENING_HOURS = "Zmiana musi mieścić się w godzinach otwarcia lokalu na wybrany dzień.";
export const ERROR_INVALID_TIME_RANGE = "Godzina „od” musi być wcześniejsza niż „do”.";
export const ERROR_WORK_DATE_OUT_OF_WEEK = "Data zmiany musi należeć do wybranego tygodnia.";
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

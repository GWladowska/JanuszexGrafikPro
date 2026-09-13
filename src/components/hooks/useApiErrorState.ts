import { useState } from "react";

type FieldErrors = Partial<Record<string, string>>;

interface ApiErrorBody {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
}

export const ERROR_SERVER = "Wystąpił błąd serwera. Spróbuj ponownie.";
export const ERROR_NETWORK = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

export function useApiErrorState() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function applyApiError(body: unknown): FieldErrors {
    if (typeof body !== "object" || body === null) {
      setFieldErrors({});
      setServerError(ERROR_SERVER);
      return {};
    }
    const { error, fieldErrors: raw } = body as ApiErrorBody;
    const { form, ...rest } = raw ?? {};
    setFieldErrors(rest);
    setServerError(form ?? error ?? ERROR_SERVER);
    return rest;
  }

  return { serverError, setServerError, fieldErrors, setFieldErrors, applyApiError };
}

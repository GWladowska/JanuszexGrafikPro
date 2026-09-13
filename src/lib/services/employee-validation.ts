const EMPLOYEE_NAME_MAX_LENGTH = 120;
const CONTACT_EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmployeeInput {
  name: string;
  contactEmail: string;
}

export type EmployeeFieldParseResult = { value: string; fieldError: null } | { value: null; fieldError: string };

export function parseEmployeeName(name: unknown): EmployeeFieldParseResult {
  if (typeof name !== "string") {
    return { value: null, fieldError: "Imię i nazwisko pracownika jest wymagane." };
  }
  const value = name.trim();
  if (value.length === 0) {
    return { value: null, fieldError: "Imię i nazwisko pracownika jest wymagane." };
  }
  if (value.length > EMPLOYEE_NAME_MAX_LENGTH) {
    return { value: null, fieldError: "Imię i nazwisko pracownika może mieć najwyżej 120 znaków." };
  }
  return { value, fieldError: null };
}

export function parseContactEmail(email: unknown): EmployeeFieldParseResult {
  if (typeof email !== "string") {
    return { value: null, fieldError: "Adres e-mail pracownika jest wymagany." };
  }
  const value = email.trim();
  if (value.length === 0) {
    return { value: null, fieldError: "Adres e-mail pracownika jest wymagany." };
  }
  if (value.length > CONTACT_EMAIL_MAX_LENGTH) {
    return { value: null, fieldError: "Adres e-mail może mieć najwyżej 254 znaki." };
  }
  if (!EMAIL_PATTERN.test(value)) {
    return { value: null, fieldError: "Podaj poprawny adres e-mail." };
  }
  return { value, fieldError: null };
}

export function normalizeEmployeeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

import { useState } from "react";
import { Check, Store } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { parseBusinessName } from "@/lib/services/business-validation";

const ERROR_SERVER = "Wystąpił błąd serwera. Spróbuj ponownie.";
const ERROR_NETWORK = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

interface ApiErrorBody {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
}

interface BusinessNameFormProps {
  businessId: string;
  currentName: string;
}

export default function BusinessNameForm({ currentName }: BusinessNameFormProps) {
  const [name, setName] = useState(currentName);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function applyServerError(body: unknown) {
    if (typeof body !== "object" || body === null) {
      setServerError(ERROR_SERVER);
      return;
    }
    const { error, fieldErrors } = body as ApiErrorBody;
    const { name: fieldName } = fieldErrors ?? {};
    if (fieldName) {
      setNameError(fieldName);
    }
    setServerError(fieldName ? null : (error ?? ERROR_SERVER));
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const nameResult = parseBusinessName(name);
    const nextNameError = nameResult.fieldError ?? undefined;
    setNameError(nextNameError);
    if (nextNameError) {
      return;
    }

    setPending(true);
    setServerError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameResult.value }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        applyServerError(body);
        return;
      }
      setSaved(true);
    } catch {
      setServerError(ERROR_NETWORK);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormField
        id="business-name"
        label="Nazwa biznesu"
        value={name}
        onChange={(value) => {
          setName(value);
          setNameError(undefined);
          setSaved(false);
        }}
        placeholder="Kawiarnia Januszex"
        error={nameError}
        icon={<Store className="size-4" />}
      />

      <ServerError message={serverError} />

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Zapisywanie..." icon={<Store className="size-4" />} pending={pending}>
          Zapisz nazwę
        </SubmitButton>
        {saved ? (
          <p className="flex items-center gap-1 text-sm text-emerald-300">
            <Check className="size-4" />
            Zapisano
          </p>
        ) : null}
      </div>
    </form>
  );
}

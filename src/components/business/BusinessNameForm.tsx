import { useState } from "react";
import { Check, Store } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ERROR_NETWORK, useApiErrorState } from "@/components/hooks/useApiErrorState";
import { parseBusinessName } from "@/lib/services/business-validation";

interface BusinessNameFormProps {
  currentName: string;
}

export default function BusinessNameForm({ currentName }: BusinessNameFormProps) {
  const [name, setName] = useState(currentName);
  const { serverError, setServerError, fieldErrors, setFieldErrors, applyApiError } = useApiErrorState();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const nameResult = parseBusinessName(name);
    const nextNameError = nameResult.fieldError ?? undefined;
    if (nextNameError) {
      setFieldErrors({ name: nextNameError });
      return;
    }

    setFieldErrors({});
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
        applyApiError(body);
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
          setFieldErrors((prev) => ({ ...prev, name: undefined }));
          setSaved(false);
        }}
        placeholder="Kawiarnia Januszex"
        error={fieldErrors.name}
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

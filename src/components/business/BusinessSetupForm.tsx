import { useState } from "react";
import { CalendarClock, Store } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ERROR_NETWORK, useApiErrorState } from "@/components/hooks/useApiErrorState";
import { OpeningHoursEditor } from "@/components/business/OpeningHoursEditor";
import { defaultWeek } from "@/components/business/opening-hours";
import { parseBusinessName, parseOpeningWeek, type OpeningHoursDay } from "@/lib/services/business-validation";

export default function BusinessSetupForm() {
  const [name, setName] = useState("");
  const [days, setDays] = useState<OpeningHoursDay[]>(defaultWeek());
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const {
    serverError,
    setServerError,
    fieldErrors: dayErrors,
    setFieldErrors: setDayErrors,
    applyApiError,
  } = useApiErrorState();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const nameResult = parseBusinessName(name);
    const nextNameError = nameResult.fieldError ?? undefined;
    if (nextNameError) {
      setNameError(nextNameError);
    }

    const weekResult = parseOpeningWeek(days);
    if (weekResult.fieldErrors !== null) {
      const { form, ...rest } = weekResult.fieldErrors;
      setDayErrors(rest);
      setServerError(form ?? null);
    }

    if (nextNameError || weekResult.fieldErrors !== null) {
      return;
    }

    setPending(true);
    setServerError(null);
    try {
      const response = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameResult.value, openingHours: weekResult.value }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          window.location.assign(`/business?prefill=${encodeURIComponent(JSON.stringify(weekResult.value))}`);
          return;
        }
        const apiFieldErrors = applyApiError(body);
        if (apiFieldErrors.name) {
          setNameError(apiFieldErrors.name);
        }
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setServerError(ERROR_NETWORK);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <FormField
        id="name"
        label="Nazwa biznesu"
        value={name}
        onChange={(value) => {
          setName(value);
          setNameError(undefined);
        }}
        placeholder="Kawiarnia Januszex"
        error={nameError}
        icon={<Store className="size-4" />}
      />

      <div>
        <p className="mb-2 flex items-center gap-2 text-sm text-blue-100/80">
          <CalendarClock className="size-4" />
          Godziny otwarcia
        </p>
        <OpeningHoursEditor
          days={days}
          onChange={(next) => {
            setDays(next);
            setDayErrors({});
          }}
          errors={dayErrors}
        />
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Tworzenie biznesu..." icon={<Store className="size-4" />} pending={pending}>
        Utwórz biznes
      </SubmitButton>
    </form>
  );
}

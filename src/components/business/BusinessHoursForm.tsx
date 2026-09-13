import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ERROR_NETWORK, useApiErrorState } from "@/components/hooks/useApiErrorState";
import { OpeningHoursEditor } from "@/components/business/OpeningHoursEditor";
import { fillClosedDays } from "@/components/business/opening-hours";
import { parseOpeningWeek, type OpeningHoursDay } from "@/lib/services/business-validation";

interface BusinessHoursFormProps {
  initialDays: OpeningHoursDay[];
}

export default function BusinessHoursForm({ initialDays }: BusinessHoursFormProps) {
  const [days, setDays] = useState<OpeningHoursDay[]>(initialDays);
  const {
    serverError,
    setServerError,
    fieldErrors: dayErrors,
    setFieldErrors: setDayErrors,
    applyApiError,
  } = useApiErrorState();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const weekResult = parseOpeningWeek(days);
    if (weekResult.fieldErrors !== null) {
      const { form, ...rest } = weekResult.fieldErrors;
      setDayErrors(rest);
      setServerError(form ?? null);
      setSaved(false);
      return;
    }

    setPending(true);
    setServerError(null);
    setDayErrors({});
    setSaved(false);
    try {
      const response = await fetch("/api/business/opening-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingHours: weekResult.value }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        applyApiError(body);
        return;
      }
      if (typeof body === "object" && body !== null && "openingHours" in body) {
        const { openingHours } = body as { openingHours?: OpeningHoursDay[] };
        if (Array.isArray(openingHours)) {
          setDays(fillClosedDays(openingHours));
        }
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
      <OpeningHoursEditor
        days={days}
        onChange={(next) => {
          setDays(next);
          setDayErrors({});
          setSaved(false);
        }}
        errors={dayErrors}
      />

      <ServerError message={serverError} />

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Zapisywanie..." icon={<CalendarClock className="size-4" />} pending={pending}>
          Zapisz tydzień
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

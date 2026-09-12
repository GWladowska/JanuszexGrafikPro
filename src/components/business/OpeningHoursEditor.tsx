import { useRef } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, WEEKDAYS } from "@/components/business/opening-hours";
import { isOpenDay, type OpeningHoursDay, type Weekday } from "@/lib/services/business-validation";

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";

const timeInputClass =
  "rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:cursor-not-allowed disabled:opacity-40 [color-scheme:dark]";

interface OpeningHoursEditorProps {
  days: OpeningHoursDay[];
  onChange: (days: OpeningHoursDay[]) => void;
  errors?: Record<string, string | undefined>;
}

export function OpeningHoursEditor({ days, onChange, errors }: OpeningHoursEditorProps) {
  const savedTimes = useRef(new Map<Weekday, { opensAt: string; closesAt: string }>());

  function updateDay(weekday: Weekday, next: OpeningHoursDay) {
    onChange(days.map((day) => (day.weekday === weekday ? next : day)));
  }

  function toggleClosed(weekday: Weekday, day: OpeningHoursDay) {
    if (isOpenDay(day)) {
      savedTimes.current.set(weekday, { opensAt: day.opensAt, closesAt: day.closesAt });
      updateDay(weekday, { weekday, closed: true });
      return;
    }
    const saved = savedTimes.current.get(weekday);
    updateDay(weekday, {
      weekday,
      opensAt: saved?.opensAt ?? DEFAULT_OPEN,
      closesAt: saved?.closesAt ?? DEFAULT_CLOSE,
    });
  }

  return (
    <ul className="space-y-2">
      {WEEKDAYS.map((weekday) => {
        const day = days.find((entry) => entry.weekday === weekday) ?? { weekday, closed: true };
        const open = isOpenDay(day);
        const error = errors?.[String(weekday)];

        return (
          <li
            key={weekday}
            className={cn(
              "rounded-lg border p-3",
              error ? "border-red-400/60 bg-red-900/20" : "border-white/10 bg-white/5",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="w-8 text-sm font-semibold text-blue-100">{WEEKDAY_LABELS[weekday]}</span>
              <button
                type="button"
                onClick={() => {
                  toggleClosed(weekday, day);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  open
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                    : "border-white/20 bg-white/10 text-white/50",
                )}
              >
                {open ? "Otwarte" : "Zamknięte"}
              </button>
              <div className="flex items-center gap-2 text-xs text-blue-100/70">
                <span>od</span>
                <input
                  type="time"
                  value={open ? day.opensAt : ""}
                  disabled={!open}
                  onChange={(event) => {
                    updateDay(weekday, {
                      weekday,
                      opensAt: event.target.value,
                      closesAt: open ? day.closesAt : DEFAULT_CLOSE,
                    });
                  }}
                  className={timeInputClass}
                  aria-label={`Godzina otwarcia — ${WEEKDAY_LABELS[weekday]}`}
                />
                <span>do</span>
                <input
                  type="time"
                  value={open ? day.closesAt : ""}
                  disabled={!open}
                  onChange={(event) => {
                    updateDay(weekday, {
                      weekday,
                      opensAt: open ? day.opensAt : DEFAULT_OPEN,
                      closesAt: event.target.value,
                    });
                  }}
                  className={timeInputClass}
                  aria-label={`Godzina zamknięcia — ${WEEKDAY_LABELS[weekday]}`}
                />
              </div>
            </div>
            {error ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-red-300">
                <CircleAlert className="size-3" />
                {error}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

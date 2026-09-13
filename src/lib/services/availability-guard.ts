import type { createClient } from "@/lib/supabase";
import type { ServiceResult } from "@/lib/services/types";
import { currentWeekStart, weekStartOf } from "@/lib/week";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export async function isAvailabilityWeekEditable(
  supabase: Supabase,
  businessId: string,
  workDate: string,
): Promise<ServiceResult<boolean>> {
  const weekStart = weekStartOf(workDate);
  const reference = currentWeekStart();

  if (weekStart < reference) {
    return { data: false, error: null };
  }
  if (weekStart > reference) {
    return { data: true, error: null };
  }

  const { data, error } = await supabase
    .from("schedules")
    .select("status")
    .eq("business_id", businessId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }
  return { data: data?.status !== "saved", error: null };
}

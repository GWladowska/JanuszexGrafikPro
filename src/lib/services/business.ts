import type { Database } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase";
import type { OpeningHoursDay, Weekday } from "@/lib/services/business-validation";
import { isClosedDay, isOpenDay, WEEKDAYS } from "@/lib/services/business-validation";
import type { ServiceResult } from "@/lib/services/types";

export type { ServiceResult };

type Supabase = NonNullable<ReturnType<typeof createClient>>;

type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
type OpeningHourRow = Database["public"]["Tables"]["opening_hours"]["Row"];

export interface BusinessCreationInput {
  name: string;
  openingHours?: OpeningHoursDay[];
}

function normalizeTime(value: string): string {
  return value.length > 5 ? value.slice(0, 5) : value;
}

export function toOpeningHoursDays(rows: OpeningHourRow[]): OpeningHoursDay[] {
  return rows.map((row) => ({
    weekday: row.weekday as Weekday,
    opensAt: normalizeTime(row.opens_at),
    closesAt: normalizeTime(row.closes_at),
  }));
}

export async function getBusinessForOwner(
  supabase: Supabase,
  ownerId: string,
): Promise<ServiceResult<BusinessRow | null>> {
  const { data, error } = await supabase.from("businesses").select("*").eq("owner_id", ownerId).maybeSingle();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

export async function getOpeningHours(
  supabase: Supabase,
  businessId: string,
): Promise<ServiceResult<OpeningHoursDay[]>> {
  const { data, error } = await supabase
    .from("opening_hours")
    .select("*")
    .eq("business_id", businessId)
    .order("weekday", { ascending: true });

  if (error) {
    return { data: null, error };
  }
  return { data: toOpeningHoursDays(data), error: null };
}

export async function createBusiness(
  supabase: Supabase,
  ownerId: string,
  input: BusinessCreationInput,
): Promise<ServiceResult<BusinessRow>> {
  const { data, error } = await supabase
    .from("businesses")
    .insert({ name: input.name, owner_id: ownerId })
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }

  if (input.openingHours && input.openingHours.length > 0) {
    const week = await upsertOpeningWeek(supabase, data.id, input.openingHours);
    if (week.error) {
      return { data: null, error: week.error };
    }
  }

  return { data, error: null };
}

export async function updateBusinessName(
  supabase: Supabase,
  businessId: string,
  name: string,
): Promise<ServiceResult<BusinessRow>> {
  const { data, error } = await supabase.from("businesses").update({ name }).eq("id", businessId).select().single();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

export async function upsertOpeningWeek(
  supabase: Supabase,
  businessId: string,
  days: OpeningHoursDay[],
): Promise<ServiceResult<OpeningHourRow[]>> {
  const openDays = days.filter(isOpenDay);
  const providedWeekdays = new Set(days.map((day) => day.weekday));
  const closedWeekdays = [
    ...days.filter(isClosedDay).map((day) => day.weekday),
    ...WEEKDAYS.filter((weekday) => !providedWeekdays.has(weekday)),
  ];

  if (openDays.length > 0) {
    const { error } = await supabase.from("opening_hours").upsert(
      openDays.map((day) => ({
        business_id: businessId,
        weekday: day.weekday,
        opens_at: day.opensAt,
        closes_at: day.closesAt,
      })),
      { onConflict: "business_id,weekday" },
    );
    if (error) {
      return { data: null, error };
    }
  }

  if (closedWeekdays.length > 0) {
    const { error } = await supabase
      .from("opening_hours")
      .delete()
      .eq("business_id", businessId)
      .in("weekday", closedWeekdays);
    if (error) {
      return { data: null, error };
    }
  }

  const { data: rows, error: selectError } = await supabase
    .from("opening_hours")
    .select("*")
    .eq("business_id", businessId)
    .order("weekday", { ascending: true });

  if (selectError) {
    return { data: null, error: selectError };
  }

  return {
    data: rows.map((row) => ({
      ...row,
      opens_at: normalizeTime(row.opens_at),
      closes_at: normalizeTime(row.closes_at),
    })),
    error: null,
  };
}

import type { Database } from "@/lib/database.types";
import { normalizeTime } from "@/lib/services/business";
import type { createClient } from "@/lib/supabase";
import type { AvailabilityInput } from "@/lib/services/availability-validation";
import { intervalsOverlap } from "@/lib/services/availability-validation";
import type { ServiceResult } from "@/lib/services/types";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

type AvailabilityDbRow = Database["public"]["Tables"]["availabilities"]["Row"];

export type AvailabilityRow = AvailabilityDbRow;

function normalizeAvailabilityRow(row: AvailabilityDbRow): AvailabilityRow {
  return { ...row, start_time: normalizeTime(row.start_time), end_time: normalizeTime(row.end_time) };
}

export async function getAvailabilities(
  supabase: Supabase,
  businessId: string,
): Promise<ServiceResult<AvailabilityRow[]>> {
  const { data, error } = await supabase
    .from("availabilities")
    .select("*")
    .eq("business_id", businessId)
    .order("work_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return { data: null, error };
  }
  return { data: data.map(normalizeAvailabilityRow), error: null };
}

export async function createAvailability(
  supabase: Supabase,
  businessId: string,
  input: AvailabilityInput,
): Promise<ServiceResult<AvailabilityRow>> {
  const { data, error } = await supabase
    .from("availabilities")
    .insert({
      business_id: businessId,
      employee_id: input.employeeId,
      work_date: input.workDate,
      start_time: input.startTime,
      end_time: input.endTime,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data: normalizeAvailabilityRow(data), error: null };
}

export async function updateAvailability(
  supabase: Supabase,
  businessId: string,
  availabilityId: string,
  input: AvailabilityInput,
): Promise<ServiceResult<AvailabilityRow>> {
  const { data, error } = await supabase
    .from("availabilities")
    .update({
      employee_id: input.employeeId,
      work_date: input.workDate,
      start_time: input.startTime,
      end_time: input.endTime,
    })
    .eq("id", availabilityId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data: normalizeAvailabilityRow(data), error: null };
}

export async function deleteAvailability(
  supabase: Supabase,
  businessId: string,
  availabilityId: string,
): Promise<ServiceResult<AvailabilityRow>> {
  const { data, error } = await supabase
    .from("availabilities")
    .delete()
    .eq("id", availabilityId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data: normalizeAvailabilityRow(data), error: null };
}

export async function findOverlappingAvailability(
  supabase: Supabase,
  businessId: string,
  employeeId: string,
  workDate: string,
  startTime: string,
  endTime: string,
  excludeAvailabilityId?: string,
): Promise<ServiceResult<AvailabilityRow | null>> {
  const { data, error } = await supabase
    .from("availabilities")
    .select("*")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .eq("work_date", workDate);

  if (error) {
    return { data: null, error };
  }

  const overlapping = data
    .map(normalizeAvailabilityRow)
    .find(
      (row) => row.id !== excludeAvailabilityId && intervalsOverlap(startTime, endTime, row.start_time, row.end_time),
    );

  return { data: overlapping ?? null, error: null };
}

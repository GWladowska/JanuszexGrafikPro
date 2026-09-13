import type { Database } from "@/lib/database.types";
import { normalizeTime } from "@/lib/services/business";
import type { DraftInput, DraftPiece } from "@/lib/services/schedule-generation";
import type { createClient } from "@/lib/supabase";
import type { ServiceResult } from "@/lib/services/types";
import { addDays } from "@/lib/week";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

type ScheduleDbRow = Database["public"]["Tables"]["schedules"]["Row"];
type AssignmentDbRow = Database["public"]["Tables"]["assignments"]["Row"];
type ScheduleStatus = Database["public"]["Enums"]["schedule_status"];

export type ScheduleRow = ScheduleDbRow;
export type AssignmentRow = AssignmentDbRow;

export interface AssignmentWithScheduleStatus {
  assignment: AssignmentRow;
  scheduleStatus: ScheduleStatus;
}

export interface CreatedSchedule {
  schedule: ScheduleRow;
  assignments: AssignmentRow[];
}

function normalizeAssignmentRow(row: AssignmentDbRow): AssignmentRow {
  return { ...row, start_time: normalizeTime(row.start_time), end_time: normalizeTime(row.end_time) };
}

export async function getScheduleByWeek(
  supabase: Supabase,
  businessId: string,
  weekStart: string,
): Promise<ServiceResult<ScheduleRow | null>> {
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("business_id", businessId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

export async function getAssignments(
  supabase: Supabase,
  businessId: string,
  scheduleId: string,
): Promise<ServiceResult<AssignmentRow[]>> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("business_id", businessId)
    .eq("schedule_id", scheduleId)
    .order("work_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return { data: null, error };
  }
  return { data: data.map(normalizeAssignmentRow), error: null };
}

export async function getAssignmentWithSchedule(
  supabase: Supabase,
  businessId: string,
  assignmentId: string,
): Promise<ServiceResult<AssignmentWithScheduleStatus | null>> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*, schedules(status)")
    .eq("id", assignmentId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }
  if (data === null) {
    return { data: null, error: null };
  }

  const { schedules: schedule, ...assignment } = data as AssignmentDbRow & {
    schedules: { status: ScheduleStatus } | null;
  };
  if (schedule === null) {
    return { data: null, error: null };
  }
  return { data: { assignment: normalizeAssignmentRow(assignment), scheduleStatus: schedule.status }, error: null };
}

export async function getAvailabilitiesForWeek(
  supabase: Supabase,
  businessId: string,
  weekStart: string,
): Promise<ServiceResult<DraftInput["availabilities"]>> {
  const { data, error } = await supabase
    .from("availabilities")
    .select("*")
    .eq("business_id", businessId)
    .gte("work_date", weekStart)
    .lte("work_date", addDays(weekStart, 6))
    .order("work_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return { data: null, error };
  }
  return {
    data: data.map((row) => ({
      employeeId: row.employee_id,
      workDate: row.work_date,
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
    })),
    error: null,
  };
}

export async function createScheduleWithAssignments(
  supabase: Supabase,
  businessId: string,
  weekStart: string,
  pieces: DraftPiece[],
): Promise<ServiceResult<CreatedSchedule>> {
  const scheduleResult = await supabase
    .from("schedules")
    .insert({ business_id: businessId, week_start: weekStart })
    .select()
    .single();

  if (scheduleResult.error) {
    return { data: null, error: scheduleResult.error };
  }
  const schedule = scheduleResult.data;

  if (pieces.length === 0) {
    return { data: { schedule, assignments: [] }, error: null };
  }

  const { data, error } = await supabase
    .from("assignments")
    .insert(
      pieces.map((piece) => ({
        business_id: businessId,
        schedule_id: schedule.id,
        employee_id: piece.employeeId,
        work_date: piece.workDate,
        start_time: piece.startTime,
        end_time: piece.endTime,
      })),
    )
    .select();

  if (error) {
    return { data: null, error };
  }
  return { data: { schedule, assignments: data.map(normalizeAssignmentRow) }, error: null };
}

export async function updateAssignmentEmployee(
  supabase: Supabase,
  businessId: string,
  assignmentId: string,
  employeeId: string,
): Promise<ServiceResult<AssignmentRow>> {
  const { data, error } = await supabase
    .from("assignments")
    .update({ employee_id: employeeId })
    .eq("id", assignmentId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data: normalizeAssignmentRow(data), error: null };
}

export async function deleteSchedule(
  supabase: Supabase,
  businessId: string,
  scheduleId: string,
): Promise<ServiceResult<ScheduleRow>> {
  const { data, error } = await supabase
    .from("schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

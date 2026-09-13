import type { Database } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase";
import type { ServiceResult } from "@/lib/services/types";
import type { EmployeeInput } from "@/lib/services/employee-validation";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];

export type { EmployeeRow };

export async function getEmployees(supabase: Supabase, businessId: string): Promise<ServiceResult<EmployeeRow[]>> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

export async function getEmployeeById(
  supabase: Supabase,
  businessId: string,
  employeeId: string,
): Promise<ServiceResult<{ id: string } | null>> {
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

export async function createEmployee(
  supabase: Supabase,
  businessId: string,
  input: EmployeeInput,
): Promise<ServiceResult<EmployeeRow>> {
  const { data, error } = await supabase
    .from("employees")
    .insert({ business_id: businessId, name: input.name, contact_email: input.contactEmail })
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

export async function updateEmployee(
  supabase: Supabase,
  businessId: string,
  employeeId: string,
  input: EmployeeInput,
): Promise<ServiceResult<EmployeeRow>> {
  const { data, error } = await supabase
    .from("employees")
    .update({ name: input.name, contact_email: input.contactEmail })
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

export async function deleteEmployee(
  supabase: Supabase,
  businessId: string,
  employeeId: string,
): Promise<ServiceResult<EmployeeRow>> {
  const { data, error } = await supabase
    .from("employees")
    .delete()
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }
  return { data, error: null };
}

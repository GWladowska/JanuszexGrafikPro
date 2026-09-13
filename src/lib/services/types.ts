import type { PostgrestError } from "@supabase/supabase-js";

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: PostgrestError };

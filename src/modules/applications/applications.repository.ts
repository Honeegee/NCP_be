import { SupabaseClient } from "@supabase/supabase-js";

export class ApplicationsRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByNurseUserId(userId: string, offset: number, limit: number) {
    const { data, error, count } = await this.supabase
      .from("job_applications")
      .select("*, job:jobs(*)", { count: "exact" })
      .eq("nurse_user_id", userId)
      .order("applied_at", { ascending: false })
      .range(offset, offset + limit - 1);
    return { data, error, count };
  }

  async findById(id: string) {
    return this.supabase
      .from("job_applications")
      .select("*, job:jobs(*)")
      .eq("id", id)
      .single();
  }

  async findExisting(userId: string, jobId: string) {
    return this.supabase
      .from("job_applications")
      .select("id")
      .eq("nurse_user_id", userId)
      .eq("job_id", jobId)
      .single();
  }

  async create(userId: string, jobId: string) {
    return this.supabase
      .from("job_applications")
      .insert({
        nurse_user_id: userId,
        job_id: jobId,
        status: "pending",
      })
      .select("*")
      .single();
  }

  async updateStatus(id: string, status: string) {
    return this.supabase
      .from("job_applications")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
  }

  async findJobById(jobId: string) {
    return this.supabase
      .from("jobs")
      .select("id, is_active")
      .eq("id", jobId)
      .single();
  }

  // Admin: list all applications with pagination and filters
  async findAll(filters: { status?: string; job_id?: string }, offset: number, limit: number) {
    let query = this.supabase
      .from("job_applications")
      .select("*, job:jobs(*)", { count: "exact" });

    if (filters.status) {
      query = query.eq("status", filters.status);
    }
    if (filters.job_id) {
      query = query.eq("job_id", filters.job_id);
    }

    const { data, error, count } = await query
      .order("applied_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return { data, error, count };
  }

  // Fetch nurse profiles by user IDs
  async findNurseProfilesByUserIds(userIds: string[]) {
    if (userIds.length === 0) return { data: [], error: null };
    const { data, error } = await this.supabase
      .from("nurse_profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", userIds);
    return { data, error };
  }
}

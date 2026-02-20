import { SupabaseClient } from "@supabase/supabase-js";

export class JobsRepository {
  constructor(private supabase: SupabaseClient) {}

  async findAll(filters: { location?: string; employment_type?: string; country?: string; include_inactive?: boolean }, offset: number, limit: number) {
    let query = this.supabase
      .from("jobs")
      .select("*", { count: "exact" });

    if (!filters.include_inactive) {
      query = query.eq("is_active", true);
    }

    if (filters.location) {
      query = query.ilike("location", `%${filters.location}%`);
    }
    if (filters.employment_type) {
      query = query.eq("employment_type", filters.employment_type);
    }
    if (filters.country) {
      query = query.eq("country", filters.country);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return { data, error, count };
  }

  async findById(id: string) {
    return this.supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();
  }

  async create(jobData: Record<string, unknown>) {
    return this.supabase
      .from("jobs")
      .insert({ ...jobData, is_active: true })
      .select("*")
      .single();
  }

  async update(id: string, updates: Record<string, unknown>) {
    return this.supabase
      .from("jobs")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
  }

  async softDelete(id: string) {
    return this.supabase
      .from("jobs")
      .update({ is_active: false })
      .eq("id", id)
      .select("*")
      .single();
  }

  async hardDelete(id: string) {
    return this.supabase
      .from("jobs")
      .delete()
      .eq("id", id);
  }

  async createMany(jobs: Record<string, unknown>[]) {
    return this.supabase
      .from("jobs")
      .insert(jobs.map((j) => ({ ...j, is_active: true })))
      .select("*");
  }

  async findAllActive() {
    return this.supabase
      .from("jobs")
      .select("*")
      .eq("is_active", true);
  }
}

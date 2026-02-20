import { SupabaseClient } from "@supabase/supabase-js";

export class ResumesRepository {
  constructor(private supabase: SupabaseClient) {}

  async getNurseId(userId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("nurse_profiles")
      .select("id")
      .eq("user_id", userId)
      .single();
    return data?.id || null;
  }

  async findById(id: string) {
    return this.supabase
      .from("resumes")
      .select("id, file_path, original_filename, file_type, nurse_id, nurse:nurse_profiles!inner(user_id)")
      .eq("id", id)
      .single();
  }

  async findByNurseId(nurseId: string) {
    return this.supabase
      .from("resumes")
      .select("id, file_path")
      .eq("nurse_id", nurseId);
  }

  async create(data: Record<string, unknown>) {
    return this.supabase
      .from("resumes")
      .insert(data)
      .select("id")
      .single();
  }

  async deleteById(id: string) {
    return this.supabase.from("resumes").delete().eq("id", id);
  }

  async deleteByNurseId(nurseId: string) {
    return this.supabase.from("resumes").delete().eq("nurse_id", nurseId);
  }

  async uploadFile(path: string, buffer: Buffer, contentType: string) {
    return this.supabase.storage.from("resumes").upload(path, buffer, {
      contentType,
      upsert: true,
    });
  }

  async createSignedUrl(path: string, expiresIn: number) {
    return this.supabase.storage.from("resumes").createSignedUrl(path, expiresIn);
  }

  async removeFiles(paths: string[]) {
    return this.supabase.storage.from("resumes").remove(paths);
  }

  // Bulk operations for parsed data insertion
  async clearNurseData(nurseId: string) {
    await this.supabase.from("nurse_certifications").delete().eq("nurse_id", nurseId);
    await this.supabase.from("nurse_skills").delete().eq("nurse_id", nurseId);
    await this.supabase.from("nurse_experience").delete().eq("nurse_id", nurseId);
    await this.supabase.from("nurse_education").delete().eq("nurse_id", nurseId);
  }

  async insertCertifications(records: Record<string, unknown>[]) {
    return this.supabase.from("nurse_certifications").insert(records);
  }

  async insertSkills(records: Record<string, unknown>[]) {
    return this.supabase.from("nurse_skills").insert(records);
  }

  async insertExperience(records: Record<string, unknown>[]) {
    return this.supabase.from("nurse_experience").insert(records);
  }

  async insertEducation(records: Record<string, unknown>[]) {
    return this.supabase.from("nurse_education").insert(records);
  }

  async getNurseProfile(nurseId: string) {
    return this.supabase
      .from("nurse_profiles")
      .select("bio, address, graduation_year, years_of_experience")
      .eq("id", nurseId)
      .single();
  }

  async updateNurseProfile(nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_profiles")
      .update(data)
      .eq("id", nurseId);
  }
}

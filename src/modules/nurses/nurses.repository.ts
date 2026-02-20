import { SupabaseClient } from "@supabase/supabase-js";
import { NURSE_FULL_PROFILE_SELECT } from "../../shared/helpers";

export class NursesRepository {
  constructor(private supabase: SupabaseClient) {}

  // --- Profile ---

  async findAllProfiles(offset: number, limit: number) {
    const { data, error, count } = await this.supabase
      .from("nurse_profiles")
      .select(NURSE_FULL_PROFILE_SELECT, { count: "exact" })
      .range(offset, offset + limit - 1)
      .order("updated_at", { ascending: false });
    return { data, error, count };
  }

  async findProfileByUserId(userId: string) {
    return this.supabase
      .from("nurse_profiles")
      .select(NURSE_FULL_PROFILE_SELECT)
      .eq("user_id", userId)
      .single();
  }

  async findProfileById(profileId: string) {
    return this.supabase
      .from("nurse_profiles")
      .select(NURSE_FULL_PROFILE_SELECT)
      .eq("id", profileId)
      .single();
  }

  async findProfileOwner(profileId: string) {
    return this.supabase
      .from("nurse_profiles")
      .select("id, user_id")
      .eq("id", profileId)
      .single();
  }

  async getNurseId(userId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("nurse_profiles")
      .select("id")
      .eq("user_id", userId)
      .single();
    return data?.id || null;
  }

  async updateProfile(profileId: string, updates: Record<string, unknown>) {
    return this.supabase
      .from("nurse_profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", profileId)
      .select("*")
      .single();
  }

  // --- Experience ---

  async createExperience(nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_experience")
      .insert({ nurse_id: nurseId, ...data })
      .select()
      .single();
  }

  async updateExperience(id: string, nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_experience")
      .update(data)
      .eq("id", id)
      .eq("nurse_id", nurseId)
      .select()
      .single();
  }

  async deleteExperience(id: string, nurseId: string) {
    return this.supabase
      .from("nurse_experience")
      .delete()
      .eq("id", id)
      .eq("nurse_id", nurseId);
  }

  async clearAllExperience(nurseId: string) {
    return this.supabase
      .from("nurse_experience")
      .delete()
      .eq("nurse_id", nurseId);
  }

  async getExperienceDates(nurseId: string) {
    return this.supabase
      .from("nurse_experience")
      .select("start_date, end_date")
      .eq("nurse_id", nurseId);
  }

  // --- Education ---

  async createEducation(nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_education")
      .insert({ nurse_id: nurseId, ...data })
      .select()
      .single();
  }

  async updateEducation(id: string, nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_education")
      .update(data)
      .eq("id", id)
      .eq("nurse_id", nurseId)
      .select()
      .single();
  }

  async deleteEducation(id: string, nurseId: string) {
    return this.supabase
      .from("nurse_education")
      .delete()
      .eq("id", id)
      .eq("nurse_id", nurseId);
  }

  async clearAllEducation(nurseId: string) {
    return this.supabase
      .from("nurse_education")
      .delete()
      .eq("nurse_id", nurseId);
  }

  // --- Skills ---

  async createSkill(nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_skills")
      .insert({ nurse_id: nurseId, ...data })
      .select()
      .single();
  }

  async updateSkill(id: string, nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_skills")
      .update(data)
      .eq("id", id)
      .eq("nurse_id", nurseId)
      .select()
      .single();
  }

  async deleteSkill(id: string, nurseId: string) {
    return this.supabase
      .from("nurse_skills")
      .delete()
      .eq("id", id)
      .eq("nurse_id", nurseId);
  }

  async clearAllSkills(nurseId: string) {
    return this.supabase
      .from("nurse_skills")
      .delete()
      .eq("nurse_id", nurseId);
  }

  // --- Certifications ---

  async createCertification(nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_certifications")
      .insert({ nurse_id: nurseId, ...data })
      .select()
      .single();
  }

  async updateCertification(id: string, nurseId: string, data: Record<string, unknown>) {
    return this.supabase
      .from("nurse_certifications")
      .update(data)
      .eq("id", id)
      .eq("nurse_id", nurseId)
      .select()
      .single();
  }

  async deleteCertification(id: string, nurseId: string) {
    return this.supabase
      .from("nurse_certifications")
      .delete()
      .eq("id", id)
      .eq("nurse_id", nurseId);
  }

  async clearAllCertifications(nurseId: string) {
    return this.supabase
      .from("nurse_certifications")
      .delete()
      .eq("nurse_id", nurseId);
  }

  // --- Profile Picture ---

  async uploadProfilePicture(bucket: string, path: string, file: Buffer, contentType: string) {
    return this.supabase.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: true });
  }

  async getPublicUrl(bucket: string, path: string) {
    return this.supabase.storage.from(bucket).getPublicUrl(path);
  }

  async deleteStorageFile(bucket: string, paths: string[]) {
    return this.supabase.storage.from(bucket).remove(paths);
  }
}

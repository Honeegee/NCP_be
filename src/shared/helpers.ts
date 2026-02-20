import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get nurse profile ID from user ID.
 * Used across experience, education, skills, certifications modules.
 */
export async function getNurseId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("nurse_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  return data?.id || null;
}

/**
 * Recalculate years_of_experience from nurse_experience entries.
 * Called after any experience CRUD operation.
 */
export async function recalculateYearsOfExperience(
  supabase: SupabaseClient,
  nurseId: string
): Promise<void> {
  const { data: experiences } = await supabase
    .from("nurse_experience")
    .select("start_date, end_date")
    .eq("nurse_id", nurseId);

  if (!experiences || experiences.length === 0) {
    await supabase
      .from("nurse_profiles")
      .update({ years_of_experience: 0, updated_at: new Date().toISOString() })
      .eq("id", nurseId);
    return;
  }

  let totalMonths = 0;
  for (const exp of experiences) {
    if (!exp.start_date) continue;
    const start = new Date(exp.start_date);
    if (isNaN(start.getTime())) continue;
    const end =
      !exp.end_date || /present|current/i.test(exp.end_date)
        ? new Date()
        : new Date(exp.end_date);
    if (isNaN(end.getTime())) continue;
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    totalMonths += Math.max(0, months);
  }

  const years = Math.floor(totalMonths / 12);
  await supabase
    .from("nurse_profiles")
    .update({ years_of_experience: years, updated_at: new Date().toISOString() })
    .eq("id", nurseId);
}

/**
 * Full nurse profile select query with all relations.
 * Eliminates the duplicated select string across routes.
 */
export const NURSE_FULL_PROFILE_SELECT = `
  *,
  user:users(email, role),
  experience:nurse_experience(*),
  certifications:nurse_certifications(*),
  education:nurse_education(*),
  skills:nurse_skills(*),
  resumes(*)
`;

/**
 * Get a full nurse profile by user_id.
 */
export async function getNurseFullProfile(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("nurse_profiles")
    .select(NURSE_FULL_PROFILE_SELECT)
    .eq("user_id", userId)
    .single();

  return { data, error };
}

/**
 * Get a full nurse profile by nurse profile id.
 */
export async function getNurseFullProfileById(
  supabase: SupabaseClient,
  nurseId: string
) {
  const { data, error } = await supabase
    .from("nurse_profiles")
    .select(NURSE_FULL_PROFILE_SELECT)
    .eq("id", nurseId)
    .single();

  return { data, error };
}

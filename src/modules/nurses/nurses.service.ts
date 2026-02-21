import { createServerSupabase } from "../../shared/database";
import { recalculateYearsOfExperience } from "../../shared/helpers";
import { NotFoundError, ForbiddenError } from "../../shared/errors";
import { NursesRepository } from "./nurses.repository";

function getRepo() {
  return new NursesRepository(createServerSupabase());
}

// --- Profile ---

export async function listNurses(offset: number, limit: number) {
  const repo = getRepo();
  const { data, error, count } = await repo.findAllProfiles(offset, limit);
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0 };
}

export async function getMyProfile(userId: string) {
  const repo = getRepo();
  const { data, error } = await repo.findProfileByUserId(userId);
  if (error || !data) throw new NotFoundError("Profile not found");
  return data;
}

export async function getProfileById(profileId: string, requesterId: string, requesterRole: string) {
  const repo = getRepo();
  const { data, error } = await repo.findProfileById(profileId);
  if (error || !data) throw new NotFoundError("Nurse profile not found");

  if (requesterRole !== "admin" && data.user_id !== requesterId) {
    throw new ForbiddenError();
  }
  return data;
}

export async function updateProfile(profileId: string, requesterId: string, requesterRole: string, updates: Record<string, unknown>) {
  const repo = getRepo();
  const { data: existing, error: fetchErr } = await repo.findProfileOwner(profileId);
  if (fetchErr || !existing) throw new NotFoundError("Nurse profile not found");

  if (requesterRole !== "admin" && existing.user_id !== requesterId) {
    throw new ForbiddenError();
  }

  const { data, error } = await repo.updateProfile(profileId, updates);
  if (error) throw new Error(error.message);
  return data;
}

// --- Experience ---

async function requireNurseId(userId: string): Promise<string> {
  const repo = getRepo();
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");
  return nurseId;
}

export async function addExperience(userId: string, body: Record<string, unknown>) {
  const supabase = createServerSupabase();
  const repo = new NursesRepository(supabase);
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  const { data, error } = await repo.createExperience(nurseId, {
    employer: body.employer || "Unknown",
    position: body.position || "Nurse",
    type: body.type || "employment",
    department: body.department || null,
    location: body.location || null,
    description: body.description || null,
    start_date: body.start_date,
    end_date: body.end_date || null,
  });
  if (error) throw new Error(error.message);

  await recalculateYearsOfExperience(supabase, nurseId);
  return data;
}

export async function updateExperience(userId: string, expId: string, body: Record<string, unknown>) {
  const supabase = createServerSupabase();
  const repo = new NursesRepository(supabase);
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  const { data, error } = await repo.updateExperience(expId, nurseId, {
    employer: body.employer,
    position: body.position,
    type: body.type || "employment",
    department: body.department || null,
    location: body.location || null,
    description: body.description || null,
    start_date: body.start_date,
    end_date: body.end_date || null,
  });
  if (error) throw new Error(error.message);

  await recalculateYearsOfExperience(supabase, nurseId);
  return data;
}

export async function deleteExperience(userId: string, expId: string) {
  const supabase = createServerSupabase();
  const repo = new NursesRepository(supabase);
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  const { error } = await repo.deleteExperience(expId, nurseId);
  if (error) throw new Error(error.message);

  await recalculateYearsOfExperience(supabase, nurseId);
}

export async function clearExperience(userId: string) {
  const supabase = createServerSupabase();
  const repo = new NursesRepository(supabase);
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  const { error } = await repo.clearAllExperience(nurseId);
  if (error) throw new Error(error.message);

  await recalculateYearsOfExperience(supabase, nurseId);
}

// --- Education ---

export async function addEducation(userId: string, body: Record<string, unknown>) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { data, error } = await repo.createEducation(nurseId, body);
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEducation(userId: string, eduId: string, body: Record<string, unknown>) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { data, error } = await repo.updateEducation(eduId, nurseId, body);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEducation(userId: string, eduId: string) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { error } = await repo.deleteEducation(eduId, nurseId);
  if (error) throw new Error(error.message);
}

export async function clearEducation(userId: string) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { error } = await repo.clearAllEducation(nurseId);
  if (error) throw new Error(error.message);
}

// --- Skills ---

export async function addSkill(userId: string, body: Record<string, unknown>) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { data, error } = await repo.createSkill(nurseId, body);
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSkill(userId: string, skillId: string, body: Record<string, unknown>) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { data, error } = await repo.updateSkill(skillId, nurseId, body);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSkill(userId: string, skillId: string) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { error } = await repo.deleteSkill(skillId, nurseId);
  if (error) throw new Error(error.message);
}

export async function clearSkills(userId: string) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { error } = await repo.clearAllSkills(nurseId);
  if (error) throw new Error(error.message);
}

// --- Certifications ---

export async function addCertification(userId: string, body: Record<string, unknown>) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { data, error } = await repo.createCertification(nurseId, body);
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCertification(userId: string, certId: string, body: Record<string, unknown>) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { data, error } = await repo.updateCertification(certId, nurseId, body);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCertification(userId: string, certId: string) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { error } = await repo.deleteCertification(certId, nurseId);
  if (error) throw new Error(error.message);
}

export async function clearCertifications(userId: string) {
  const nurseId = await requireNurseId(userId);
  const repo = getRepo();
  const { error } = await repo.clearAllCertifications(nurseId);
  if (error) throw new Error(error.message);
}

// --- Profile Picture ---

export async function uploadProfilePicture(userId: string, file: Express.Multer.File) {
  const repo = getRepo();
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  const ext = file.originalname.split(".").pop() || "jpg";
  const path = `${userId}/profile.${ext}`;
  const timestamp = Date.now();

  const { error: uploadErr } = await repo.uploadProfilePicture(
    "profile-pictures",
    path,
    file.buffer,
    file.mimetype
  );

  if (uploadErr) {
    // Fallback to resumes bucket
    const fallbackPath = `profile-images/${userId}/profile.${ext}`;
    const { error: fallbackErr } = await repo.uploadProfilePicture(
      "resumes",
      fallbackPath,
      file.buffer,
      file.mimetype
    );
    if (fallbackErr) throw new Error("Failed to upload profile picture");

    const { data: urlData } = await repo.getPublicUrl("resumes", fallbackPath);
    // Add cache-busting query parameter
    const cachedUrl = `${urlData.publicUrl}?t=${timestamp}`;
    await repo.updateProfile(nurseId, { profile_picture_url: cachedUrl } as Record<string, unknown>);
    return cachedUrl;
  }

  const { data: urlData } = await repo.getPublicUrl("profile-pictures", path);
  const supabase = createServerSupabase();
  // Add cache-busting query parameter to ensure browser loads new image
  const cachedUrl = `${urlData.publicUrl}?t=${timestamp}`;
  await supabase
    .from("nurse_profiles")
    .update({ profile_picture_url: cachedUrl, updated_at: new Date().toISOString() })
    .eq("id", nurseId);

  return cachedUrl;
}

export async function deleteProfilePicture(userId: string) {
  const supabase = createServerSupabase();
  const repo = new NursesRepository(supabase);
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  // Get the current profile to find the storage path
  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("profile_picture_url")
    .eq("id", nurseId)
    .single();

  if (profile?.profile_picture_url) {
    // Try to delete from profile-pictures bucket
    const path = `${userId}/profile.`;
    await repo.deleteStorageFile("profile-pictures", [path + "jpg", path + "jpeg", path + "png", path + "gif", path + "webp"]).catch(() => {
      // Ignore errors - file might not exist
    });
    
    // Try to delete from resumes bucket (fallback)
    const fallbackPath = `profile-images/${userId}/profile.`;
    await repo.deleteStorageFile("resumes", [fallbackPath + "jpg", fallbackPath + "jpeg", fallbackPath + "png", fallbackPath + "gif", fallbackPath + "webp"]).catch(() => {
      // Ignore errors - file might not exist
    });
  }

  await supabase
    .from("nurse_profiles")
    .update({ profile_picture_url: null, updated_at: new Date().toISOString() })
    .eq("id", nurseId);
}

// --- Stats ---

export async function getNurseStats() {
  const supabase = createServerSupabase();
  
  // Get total nurses
  const { count: totalNurses, error: totalError } = await supabase
    .from("nurse_profiles")
    .select("*", { count: "exact", head: true });
  if (totalError) throw new Error(totalError.message);

  // Get complete profiles (profile_complete = true)
  const { count: completeProfiles, error: completeError } = await supabase
    .from("nurse_profiles")
    .select("*", { count: "exact", head: true })
    .eq("profile_complete", true);
  if (completeError) throw new Error(completeError.message);

  // Get registrations for last 7 days - fetch all nurse profiles to get user_id
  const { data: nurseProfiles, error: profilesError } = await supabase
    .from("nurse_profiles")
    .select("user_id");
  if (profilesError) throw new Error(profilesError.message);

  // Extract user IDs
  const userIds = nurseProfiles?.map((p) => p.user_id).filter(Boolean) || [];

  // Get user creation dates
  let userCreatedAtMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, created_at")
      .in("id", userIds);
    if (usersError) throw new Error(usersError.message);
    
    users?.forEach((user) => {
      userCreatedAtMap[user.id] = user.created_at;
    });
  }

  // Process registrations per day
  const registrationsPerDay: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    registrationsPerDay.push({ date: dateStr, count: 0 });
  }

  nurseProfiles?.forEach((profile) => {
    const createdAt = userCreatedAtMap[profile.user_id];
    if (createdAt) {
      const day = new Date(createdAt).toISOString().slice(0, 10);
      const slot = registrationsPerDay.find((d) => d.date === day);
      if (slot) slot.count++;
    }
  });

  return {
    totalNurses: totalNurses || 0,
    completeProfiles: completeProfiles || 0,
    incompleteProfiles: (totalNurses || 0) - (completeProfiles || 0),
    registrationsPerDay,
  };
}

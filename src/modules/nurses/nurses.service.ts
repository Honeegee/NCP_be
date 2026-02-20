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
    await repo.updateProfile(nurseId, { profile_picture_url: urlData.publicUrl } as Record<string, unknown>);
    return urlData.publicUrl;
  }

  const { data: urlData } = await repo.getPublicUrl("profile-pictures", path);
  const supabase = createServerSupabase();
  await supabase
    .from("nurse_profiles")
    .update({ profile_picture_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", nurseId);

  return urlData.publicUrl;
}

export async function deleteProfilePicture(userId: string) {
  const supabase = createServerSupabase();
  const repo = new NursesRepository(supabase);
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  await supabase
    .from("nurse_profiles")
    .update({ profile_picture_url: null, updated_at: new Date().toISOString() })
    .eq("id", nurseId);
}

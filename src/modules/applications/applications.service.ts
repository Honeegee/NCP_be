import { createServerSupabase } from "../../shared/database";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../../shared/errors";
import { ApplicationsRepository } from "./applications.repository";

function getRepo() {
  return new ApplicationsRepository(createServerSupabase());
}

export async function listMyApplications(userId: string, offset: number, limit: number) {
  const repo = getRepo();
  const { data, error, count } = await repo.findByNurseUserId(userId, offset, limit);
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0 };
}

export async function listAllApplications(
  filters: { status?: string; job_id?: string },
  offset: number,
  limit: number
) {
  const repo = getRepo();
  const { data, error, count } = await repo.findAll(filters, offset, limit);
  if (error) throw new Error(error.message);

  // Fetch nurse profiles separately (no direct FK from job_applications to nurse_profiles)
  const nurseUserIds = [...new Set((data || []).map((a: { nurse_user_id: string }) => a.nurse_user_id))];
  const { data: nurses } = await repo.findNurseProfilesByUserIds(nurseUserIds);
  const nurseMap = new Map((nurses || []).map((n: { user_id: string; first_name: string; last_name: string }) => [n.user_id, n]));

  const enriched = (data || []).map((app: { nurse_user_id: string }) => ({
    ...app,
    nurse: nurseMap.get(app.nurse_user_id) || null,
  }));

  return { data: enriched, total: count || 0 };
}

export async function getApplication(id: string, userId: string, userRole: string) {
  const repo = getRepo();
  const { data, error } = await repo.findById(id);
  if (error || !data) throw new NotFoundError("Application not found");

  if (userRole !== "admin" && data.nurse_user_id !== userId) {
    throw new ForbiddenError();
  }
  return data;
}

export async function applyToJob(userId: string, jobId: string) {
  const repo = getRepo();

  // Verify job exists and is active
  const { data: job, error: jobError } = await repo.findJobById(jobId);
  if (jobError || !job) throw new NotFoundError("Job not found");
  if (!job.is_active) throw new BadRequestError("Job is no longer active");

  // Check for existing application
  const { data: existing } = await repo.findExisting(userId, jobId);
  if (existing) throw new ConflictError("Already applied to this job");

  const { data, error } = await repo.create(userId, jobId);
  if (error) {
    if (error.code === "23505") throw new ConflictError("Already applied to this job");
    throw new Error(error.message);
  }
  return data;
}

export async function updateApplicationStatus(id: string, status: string) {
  const repo = getRepo();
  const { data: existing, error: fetchErr } = await repo.findById(id);
  if (fetchErr || !existing) throw new NotFoundError("Application not found");

  const { data, error } = await repo.updateStatus(id, status);
  if (error) throw new Error(error.message);
  return data;
}

// --- Stats ---

export async function getApplicationStats() {
  const supabase = createServerSupabase();

  // Get total applications
  const { count: totalApplications, error: totalError } = await supabase
    .from("job_applications")
    .select("*", { count: "exact", head: true });
  if (totalError) throw new Error(totalError.message);

  // Get applications by status
  const { data: statusCounts, error: statusError } = await supabase
    .from("job_applications")
    .select("status");
  if (statusError) throw new Error(statusError.message);

  const counts = {
    pending: 0,
    accepted: 0,
    rejected: 0,
  };

  statusCounts?.forEach((app) => {
    const status = app.status as keyof typeof counts;
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  });

  return {
    totalApplications: totalApplications || 0,
    ...counts,
  };
}

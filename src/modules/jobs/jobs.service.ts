import { parse } from "csv-parse/sync";
import { createServerSupabase } from "../../shared/database";
import { getNurseFullProfile } from "../../shared/helpers";
import { matchJobs } from "../../shared/job-matcher";
import { matchJobsWithAI } from "../../shared/ai-job-matcher";
import { isAIMatchingAvailable } from "../../shared/openai-client";
import { getNovu } from "../../shared/novu";
import { NotFoundError, BadRequestError } from "../../shared/errors";
import { JobsRepository } from "./jobs.repository";
import type { NurseFullProfile, Job } from "../../shared/types";
import { TriggerRecipientsTypeEnum } from "@novu/node";

function getRepo() {
  return new JobsRepository(createServerSupabase());
}

export async function listJobs(
  filters: { location?: string; employment_type?: string; country?: string; include_inactive?: boolean },
  offset: number,
  limit: number
) {
  const repo = getRepo();
  const { data, error, count } = await repo.findAll(filters, offset, limit);
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0 };
}

export async function getJob(id: string) {
  const repo = getRepo();
  const { data, error } = await repo.findById(id);
  if (error || !data) throw new NotFoundError("Job not found");
  return data;
}

export async function createJob(jobData: Record<string, unknown>) {
  const repo = getRepo();
  const { data, error } = await repo.create(jobData);
  if (error) throw new Error(error.message);

  // Notify all nurses via Novu
  const novu = getNovu();
  if (novu && data) {
    try {
      await novu.trigger("new-job-posted", {
        to: [{ type: TriggerRecipientsTypeEnum.TOPIC, topicKey: "nurses" }],
        payload: {
          jobTitle: data.title,
          facility: data.facility_name,
          location: data.location,
          jobId: data.id,
        },
      });
    } catch (err) {
      console.error("Novu new-job-posted trigger failed:", err);
    }
  }

  return data;
}

export async function updateJob(id: string, updates: Record<string, unknown>) {
  const repo = getRepo();
  // Verify exists
  const { data: existing, error: fetchErr } = await repo.findById(id);
  if (fetchErr || !existing) throw new NotFoundError("Job not found");

  const { data, error } = await repo.update(id, updates);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteJob(id: string) {
  const repo = getRepo();
  const { data: existing, error: fetchErr } = await repo.findById(id);
  if (fetchErr || !existing) throw new NotFoundError("Job not found");

  const { data, error } = await repo.softDelete(id);
  if (error) throw new Error(error.message);
  return data;
}

export async function permanentlyDeleteJob(id: string) {
  const repo = getRepo();
  const { data: existing, error: fetchErr } = await repo.findById(id);
  if (fetchErr || !existing) throw new NotFoundError("Job not found");

  const { error } = await repo.hardDelete(id);
  if (error) throw new Error(error.message);
  return { message: "Job permanently deleted" };
}

const VALID_EMPLOYMENT_TYPES = ["full-time", "part-time", "contract"];

export async function bulkCreateJobs(csvBuffer: Buffer) {
  let records: Record<string, string>[];
  try {
    records = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new BadRequestError("Invalid CSV format. Please check your file and try again.");
  }

  if (records.length === 0) {
    throw new BadRequestError("CSV file is empty.");
  }

  if (records.length > 200) {
    throw new BadRequestError("Maximum 200 jobs per upload. Please split your file.");
  }

  const errors: { row: number; message: string }[] = [];
  const validJobs: Record<string, unknown>[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // +2 for header row + 0-index

    // Validate required fields
    if (!row.title?.trim()) {
      errors.push({ row: rowNum, message: "Missing required field: title" });
      continue;
    }
    if (!row.description?.trim()) {
      errors.push({ row: rowNum, message: "Missing required field: description" });
      continue;
    }
    if (!row.location?.trim()) {
      errors.push({ row: rowNum, message: "Missing required field: location" });
      continue;
    }
    if (!row.facility_name?.trim()) {
      errors.push({ row: rowNum, message: "Missing required field: facility_name" });
      continue;
    }

    const employmentType = (row.employment_type || "full-time").trim().toLowerCase();
    if (!VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
      errors.push({ row: rowNum, message: `Invalid employment_type: "${row.employment_type}". Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}` });
      continue;
    }

    const minExp = parseInt(row.min_experience_years || "0", 10);
    if (isNaN(minExp) || minExp < 0) {
      errors.push({ row: rowNum, message: "min_experience_years must be a non-negative number" });
      continue;
    }

    const salaryMin = row.salary_min ? parseFloat(row.salary_min) : null;
    const salaryMax = row.salary_max ? parseFloat(row.salary_max) : null;
    if (row.salary_min && (salaryMin === null || isNaN(salaryMin))) {
      errors.push({ row: rowNum, message: "salary_min must be a valid number" });
      continue;
    }
    if (row.salary_max && (salaryMax === null || isNaN(salaryMax))) {
      errors.push({ row: rowNum, message: "salary_max must be a valid number" });
      continue;
    }

    validJobs.push({
      title: row.title.trim(),
      description: row.description.trim(),
      location: row.location.trim(),
      facility_name: row.facility_name.trim(),
      employment_type: employmentType,
      min_experience_years: minExp,
      required_certifications: row.required_certifications
        ? row.required_certifications.split(";").map((s: string) => s.trim()).filter(Boolean)
        : [],
      required_skills: row.required_skills
        ? row.required_skills.split(";").map((s: string) => s.trim()).filter(Boolean)
        : [],
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: (row.salary_currency || "USD").trim(),
      country: (row.country || "Philippines").trim(),
    });
  }

  let created = 0;
  if (validJobs.length > 0) {
    const repo = getRepo();
    const { data, error } = await repo.createMany(validJobs);
    if (error) {
      throw new Error(`Database insert failed: ${error.message}`);
    }
    created = data?.length || validJobs.length;
  }

  return { created, errors, total: records.length };
}

export async function getJobMatchesForNurse(nurseProfileId: string) {
  const supabase = createServerSupabase();

  const { getNurseFullProfileById } = await import("../../shared/helpers");
  const { data: profile, error: profileError } = await getNurseFullProfileById(supabase, nurseProfileId);
  if (profileError || !profile) {
    throw new NotFoundError("Nurse profile not found.");
  }

  const repo = new JobsRepository(supabase);
  const { data: jobs, error: jobsError } = await repo.findAllActive();
  if (jobsError) throw new Error("Failed to fetch jobs");

  if (!jobs || jobs.length === 0) return [];

  let matches;
  if (isAIMatchingAvailable()) {
    try {
      matches = await matchJobsWithAI(profile as NurseFullProfile, jobs as Job[]);
    } catch (err) {
      console.warn("[JobMatching] AI matching failed, falling back to rule-based:", err);
      matches = matchJobs(profile as NurseFullProfile, jobs as Job[]);
    }
  } else {
    matches = matchJobs(profile as NurseFullProfile, jobs as Job[]);
  }

  return matches;
}

export async function getJobMatches(userId: string) {
  const supabase = createServerSupabase();

  const { data: profile, error: profileError } = await getNurseFullProfile(supabase, userId);
  if (profileError || !profile) {
    throw new NotFoundError("Nurse profile not found. Please complete your profile first.");
  }

  const repo = new JobsRepository(supabase);
  const { data: jobs, error: jobsError } = await repo.findAllActive();
  if (jobsError) throw new Error("Failed to fetch jobs");

  if (!jobs || jobs.length === 0) return [];

  let matches;
  if (isAIMatchingAvailable()) {
    try {
      matches = await matchJobsWithAI(profile as NurseFullProfile, jobs as Job[]);
      console.log("[JobMatching] Using AI-enhanced matching");
    } catch (err) {
      console.warn("[JobMatching] AI matching failed, falling back to rule-based:", err);
      matches = matchJobs(profile as NurseFullProfile, jobs as Job[]);
    }
  } else {
    matches = matchJobs(profile as NurseFullProfile, jobs as Job[]);
  }

  // Notify for top match if score >= 70
  const novu = getNovu();
  if (novu && matches.length > 0 && matches[0].match_score >= 70) {
    try {
      await novu.trigger("job-match-found", {
        to: { subscriberId: userId },
        payload: {
          score: matches[0].match_score,
          jobTitle: matches[0].job.title,
          facility: matches[0].job.facility_name,
          jobId: matches[0].job.id,
        },
      });
    } catch (err) {
      console.error("Novu job-match-found trigger failed:", err);
    }
  }

  return matches;
}

import { Request, Response, NextFunction } from "express";
import { paginatedResponse } from "../../middleware/pagination";
import * as nursesService from "./nurses.service";

// --- Profile ---

export async function listNurses(req: Request, res: Response, next: NextFunction) {
  try {
    const { offset, limit, page } = req.pagination!;
    const { data, total } = await nursesService.listNurses(offset, limit);
    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) { next(err); }
}

export async function getMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await nursesService.getMyProfile(req.user!.id);
    res.json({ data: profile });
  } catch (err) { next(err); }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await nursesService.getProfileById(req.params.id, req.user!.id, req.user!.role);
    res.json({ data: profile });
  } catch (err) { next(err); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await nursesService.updateProfile(req.params.id, req.user!.id, req.user!.role, req.body);
    res.json({ data: profile });
  } catch (err) { next(err); }
}

// --- Experience ---

export async function addExperience(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.addExperience(req.user!.id, req.body);
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

export async function updateExperience(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.updateExperience(req.user!.id, req.params.itemId, req.body);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function deleteExperience(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.deleteExperience(req.user!.id, req.params.itemId);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

export async function clearExperience(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.clearExperience(req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

// --- Education ---

export async function addEducation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.addEducation(req.user!.id, req.body);
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

export async function updateEducation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.updateEducation(req.user!.id, req.params.itemId, req.body);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function deleteEducation(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.deleteEducation(req.user!.id, req.params.itemId);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

export async function clearEducation(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.clearEducation(req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

// --- Skills ---

export async function addSkill(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.addSkill(req.user!.id, req.body);
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

export async function updateSkill(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.updateSkill(req.user!.id, req.params.itemId, req.body);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function deleteSkill(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.deleteSkill(req.user!.id, req.params.itemId);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

export async function clearSkills(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.clearSkills(req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

// --- Certifications ---

export async function addCertification(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.addCertification(req.user!.id, req.body);
    res.status(201).json({ data });
  } catch (err) { next(err); }
}

export async function updateCertification(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await nursesService.updateCertification(req.user!.id, req.params.itemId, req.body);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function deleteCertification(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.deleteCertification(req.user!.id, req.params.itemId);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

export async function clearCertifications(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.clearCertifications(req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

// --- Matches ---

export async function getNurseMatches(req: Request, res: Response, next: NextFunction) {
  try {
    const { getJobMatchesForNurse } = await import("../jobs/jobs.service");
    const matches = await getJobMatchesForNurse(req.params.id);
    res.json({ data: matches });
  } catch (err) { next(err); }
}

// --- Profile Picture ---

export async function uploadProfilePicture(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const url = await nursesService.uploadProfilePicture(req.user!.id, req.file);
    res.json({ data: { profile_picture_url: url } });
  } catch (err) { next(err); }
}

export async function deleteProfilePicture(req: Request, res: Response, next: NextFunction) {
  try {
    await nursesService.deleteProfilePicture(req.user!.id);
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
}

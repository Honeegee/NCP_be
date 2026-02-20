import { Request, Response, NextFunction } from "express";
import { paginatedResponse } from "../../middleware/pagination";
import * as jobsService from "./jobs.service";

export async function listJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { offset, limit, page } = req.pagination!;
    const filters = {
      location: req.query.location as string | undefined,
      employment_type: req.query.employment_type as string | undefined,
      country: req.query.country as string | undefined,
      include_inactive: req.query.include_inactive === "true",
    };
    const { data, total } = await jobsService.listJobs(filters, offset, limit);
    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) { next(err); }
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await jobsService.getJob(req.params.id);
    res.json({ data: job });
  } catch (err) { next(err); }
}

export async function createJob(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await jobsService.createJob(req.body);
    res.status(201).json({ data: job });
  } catch (err) { next(err); }
}

export async function updateJob(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await jobsService.updateJob(req.params.id, req.body);
    res.json({ data: job });
  } catch (err) { next(err); }
}

export async function deleteJob(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await jobsService.deleteJob(req.params.id);
    res.json({ data: { message: "Job deactivated successfully", job } });
  } catch (err) { next(err); }
}

export async function permanentlyDeleteJob(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await jobsService.permanentlyDeleteJob(req.params.id);
    res.json({ data: result });
  } catch (err) { next(err); }
}

export async function bulkUploadJobs(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No CSV file provided" });
      return;
    }
    const result = await jobsService.bulkCreateJobs(req.file.buffer);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
}

export async function getMatches(req: Request, res: Response, next: NextFunction) {
  try {
    const matches = await jobsService.getJobMatches(req.user!.id);
    res.json({ data: matches });
  } catch (err) { next(err); }
}

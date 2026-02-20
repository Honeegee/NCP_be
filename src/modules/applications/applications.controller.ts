import { Request, Response, NextFunction } from "express";
import { paginatedResponse } from "../../middleware/pagination";
import * as applicationsService from "./applications.service";

export async function listMyApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const { offset, limit, page } = req.pagination!;
    const { data, total } = await applicationsService.listMyApplications(req.user!.id, offset, limit);
    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) { next(err); }
}

export async function listAllApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const { offset, limit, page } = req.pagination!;
    const filters = {
      status: req.query.status as string | undefined,
      job_id: req.query.job_id as string | undefined,
    };
    const { data, total } = await applicationsService.listAllApplications(filters, offset, limit);
    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) { next(err); }
}

export async function getApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const application = await applicationsService.getApplication(req.params.id, req.user!.id, req.user!.role);
    res.json({ data: application });
  } catch (err) { next(err); }
}

export async function applyToJob(req: Request, res: Response, next: NextFunction) {
  try {
    const application = await applicationsService.applyToJob(req.user!.id, req.params.jobId);
    res.status(201).json({ data: application });
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const application = await applicationsService.updateApplicationStatus(req.params.id, req.body.status);
    res.json({ data: application });
  } catch (err) { next(err); }
}

import { Request, Response, NextFunction } from "express";
import * as resumesService from "./resumes.service";

export async function uploadResume(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const result = await resumesService.uploadResume(req.user!.id, req.file);
    res.json({ data: { message: "Resume uploaded and processed successfully", ...result } });
  } catch (err) { next(err); }
}

export async function getResumeUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await resumesService.getResumeUrl(req.params.id, req.user!.id, req.user!.role);
    res.json({ data: result });
  } catch (err) { next(err); }
}

export async function deleteResume(req: Request, res: Response, next: NextFunction) {
  try {
    await resumesService.deleteResume(req.params.id, req.user!.id);
    res.json({ data: { message: "Resume deleted successfully" } });
  } catch (err) { next(err); }
}

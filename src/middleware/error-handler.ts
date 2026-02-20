import { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Check by statusCode property (more reliable than instanceof across module boundaries)
  if ("statusCode" in err && "code" in err) {
    const appErr = err as AppError;
    res.status(appErr.statusCode).json({
      error: appErr.message,
      code: appErr.code,
      ...(appErr.details ? { details: appErr.details } : {}),
    });
    return;
  }

  // Unexpected errors
  console.error("[Unhandled Error]", err.message || err);
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}

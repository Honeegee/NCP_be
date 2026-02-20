import { Request, Response, NextFunction } from "express";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Middleware: parses ?page= and ?limit= from query params.
 * Attaches req.pagination = { page, limit, offset }.
 */
export function paginate(req: Request, _res: Response, next: NextFunction): void {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  req.pagination = { page, limit, offset };
  next();
}

/**
 * Helper to build a paginated response envelope.
 */
export function paginatedResponse<T>(data: T[], total: number, pagination: { page: number; limit: number }) {
  return {
    data,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}

import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ValidationError } from "../shared/errors";

/**
 * Middleware factory: validates req.body against a Zod schema.
 * Returns 400 with validation details on failure.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const flat = result.error.flatten();
      const fieldMessages = Object.values(flat.fieldErrors).flat();
      const allMessages = [...flat.formErrors, ...fieldMessages];
      const message = allMessages[0] || "Validation failed";
      return next(
        new ValidationError(message, flat)
      );
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates query parameters against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(
        new ValidationError("Invalid query parameters", result.error.flatten())
      );
    }
    req.query = result.data;
    next();
  };
}

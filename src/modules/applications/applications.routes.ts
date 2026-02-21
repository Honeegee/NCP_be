import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/roles";
import { validate } from "../../middleware/validate";
import { paginate } from "../../middleware/pagination";
import { applicationStatusSchema } from "../../shared/validators";
import * as controller from "./applications.controller";

const router = Router();

router.use(authenticate);

// Nurse: list my applications
router.get("/me", paginate, controller.listMyApplications);

// Admin: list all applications (filterable by status, job_id)
router.get("/", requireRole("admin"), paginate, controller.listAllApplications);
router.get("/stats", requireRole("admin"), controller.getApplicationStats);

// Get single application (owner or admin)
router.get("/:id", controller.getApplication);

// Nurse: apply to a job
router.post("/jobs/:jobId/apply", requireRole("nurse"), controller.applyToJob);

// Admin: update application status
router.put("/:id/status", requireRole("admin"), validate(applicationStatusSchema), controller.updateStatus);

export { router as applicationsRoutes };

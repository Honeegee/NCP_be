import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/roles";
import { validate } from "../../middleware/validate";
import { paginate } from "../../middleware/pagination";
import { jobSchema } from "../../shared/validators";
import * as controller from "./jobs.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

const router = Router();

router.use(authenticate);

router.get("/", paginate, controller.listJobs);
router.get("/stats", requireRole("admin"), controller.getJobStats);
router.get("/matches", controller.getMatches);
router.get("/:id", controller.getJob);
router.post("/", requireRole("admin"), validate(jobSchema), controller.createJob);
router.post("/bulk-upload", requireRole("admin"), upload.single("file"), controller.bulkUploadJobs);
router.put("/:id", requireRole("admin"), controller.updateJob);
router.delete("/:id", requireRole("admin"), controller.deleteJob);
router.delete("/:id/permanent", requireRole("admin"), controller.permanentlyDeleteJob);

export { router as jobsRoutes };

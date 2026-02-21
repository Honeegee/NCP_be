import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/roles";
import { validate } from "../../middleware/validate";
import { paginate } from "../../middleware/pagination";
import {
  profileUpdateSchema,
  experienceSchema,
  educationSchema,
  skillSchema,
  certificationSchema,
} from "../../shared/validators";
import * as controller from "./nurses.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// All nurse routes require authentication
router.use(authenticate);

// --- Profile ---
router.get("/", requireRole("admin"), paginate, controller.listNurses);
router.get("/stats", requireRole("admin"), controller.getNurseStats);
router.get("/me", controller.getMyProfile);
router.get("/:id/matches", requireRole("admin"), controller.getNurseMatches);
router.get("/:id", controller.getProfile);
router.put("/:id", validate(profileUpdateSchema), controller.updateProfile);

// --- Profile Picture ---
router.post("/me/profile-picture", upload.single("file"), controller.uploadProfilePicture);
router.delete("/me/profile-picture", controller.deleteProfilePicture);

// --- Experience ---
router.post("/me/experience", validate(experienceSchema), controller.addExperience);
router.put("/me/experience/:itemId", validate(experienceSchema), controller.updateExperience);
router.delete("/me/experience/:itemId", controller.deleteExperience);
router.delete("/me/experience", controller.clearExperience);

// --- Education ---
router.post("/me/education", validate(educationSchema), controller.addEducation);
router.put("/me/education/:itemId", validate(educationSchema), controller.updateEducation);
router.delete("/me/education/:itemId", controller.deleteEducation);
router.delete("/me/education", controller.clearEducation);

// --- Skills ---
router.post("/me/skills", validate(skillSchema), controller.addSkill);
router.put("/me/skills/:itemId", validate(skillSchema), controller.updateSkill);
router.delete("/me/skills/:itemId", controller.deleteSkill);
router.delete("/me/skills", controller.clearSkills);

// --- Certifications ---
router.post("/me/certifications", validate(certificationSchema), controller.addCertification);
router.put("/me/certifications/:itemId", validate(certificationSchema), controller.updateCertification);
router.delete("/me/certifications/:itemId", controller.deleteCertification);
router.delete("/me/certifications", controller.clearCertifications);

export { router as nursesRoutes };

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { passport } from "./config/passport";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";

// Module routes
import { authRoutes } from "./modules/auth/auth.routes";
import { nursesRoutes } from "./modules/nurses/nurses.routes";
import { jobsRoutes } from "./modules/jobs/jobs.routes";
import { resumesRoutes } from "./modules/resumes/resumes.routes";
import { applicationsRoutes } from "./modules/applications/applications.routes";

const app = express();

// --- Global Middleware ---
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// --- Health Check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- API v1 Routes ---
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/nurses", nursesRoutes);
app.use("/api/v1/jobs", jobsRoutes);
app.use("/api/v1/resumes", resumesRoutes);
app.use("/api/v1/applications", applicationsRoutes);

// --- 404 Handler ---
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// --- Global Error Handler (must be last) ---
app.use(errorHandler);

export { app };

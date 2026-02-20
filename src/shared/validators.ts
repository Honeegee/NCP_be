import { z } from "zod";

const strongPasswordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain at least one special character")
  .refine((password) => !/(.)\1\1\1/.test(password), "Password cannot contain 4 or more consecutive identical characters")
  .refine((password) => {
    const weakPasswords = [
      'password', 'password123', '12345678', '123456789', '1234567890',
      'qwerty', 'qwerty123', 'admin', 'admin123', 'letmein', 'welcome',
      'monkey', 'dragon', 'baseball', 'football', 'superman', 'iloveyou',
    ];
    return !weakPasswords.includes(password.toLowerCase());
  }, "Password is too common or easily guessable");

export const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const checkEmailSchema = z.object({
  email: z.string().email("Valid email is required"),
});

export const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: strongPasswordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const resendVerificationSchema = z.object({
  email: z.string().email("Valid email is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email is required"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: strongPasswordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: strongPasswordSchema,
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password must be different from current password",
  path: ["newPassword"],
});

export const profileUpdateSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().max(20).optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  graduation_year: z.coerce.number().nullable().optional(),
  bio: z.string().optional(),
  professional_status: z.enum(["registered_nurse", "nursing_student"]).nullable().optional(),
});

export const experienceSchema = z.object({
  employer: z.string().min(1, "Employer name is required"),
  position: z.string().min(1, "Position is required"),
  type: z.enum(["employment", "clinical_placement", "ojt", "volunteer"]).default("employment"),
  department: z.string().optional().default(""),
  location: z.string().optional().default(""),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().optional().default(""),
  description: z.string().optional().default(""),
});

export const certificationSchema = z.object({
  cert_type: z.string().min(1, "Certification type is required"),
  cert_number: z.string().optional().default(""),
  score: z.string().optional().default(""),
  issue_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  verified: z.boolean().default(false),
});

export const educationSchema = z.object({
  institution: z.string().min(1, "Institution name is required"),
  degree: z.string().min(1, "Degree is required"),
  field_of_study: z.string().optional().default(""),
  graduation_year: z.string().optional().default(""),
  institution_location: z.string().optional().default(""),
  start_date: z.string().optional().default(""),
  end_date: z.string().optional().default(""),
  status: z.string().optional().default(""),
});

export const skillSchema = z.object({
  skill_name: z.string().min(1, "Skill name is required"),
  proficiency: z.enum(["basic", "intermediate", "advanced"]).default("basic"),
});

export const jobSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  description: z.string().min(1, "Description is required"),
  location: z.string().min(1, "Location is required"),
  facility_name: z.string().min(1, "Facility name is required"),
  employment_type: z.enum(["full-time", "part-time", "contract"]),
  min_experience_years: z.coerce.number().min(0),
  required_certifications: z.array(z.string()).default([]),
  required_skills: z.array(z.string()).default([]),
  salary_min: z.coerce.number().nullable().optional(),
  salary_max: z.coerce.number().nullable().optional(),
  salary_currency: z.string().default("PHP"),
  country: z.string().optional().default("Philippines"),
});

export const applicationStatusSchema = z.object({
  status: z.enum(["pending", "reviewed", "accepted", "rejected"]),
});

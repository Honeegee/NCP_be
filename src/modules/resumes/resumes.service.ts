import { createServerSupabase } from "../../shared/database";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../shared/errors";
import { ResumesRepository } from "./resumes.repository";

// Dynamic imports for CJS packages
async function getTextExtractors() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const pdfParse = require("pdf-parse");
  const mammoth = require("mammoth");
  const WordExtractor = require("word-extractor");
  return { pdfParse, mammoth, WordExtractor };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function getRepo() {
  return new ResumesRepository(createServerSupabase());
}

/** Convert "June 2020" or "May 2020" to "2020-06-01" for PostgreSQL DATE */
function toDateString(dateStr: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const months: Record<string, string> = {
    jan: "01", january: "01", feb: "02", february: "02",
    mar: "03", march: "03", apr: "04", april: "04",
    may: "05", jun: "06", june: "06", jul: "07", july: "07",
    aug: "08", august: "08", sep: "09", september: "09",
    oct: "10", october: "10", nov: "11", november: "11",
    dec: "12", december: "12",
  };

  const match = dateStr.match(
    /(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*)?(\d{4})/i
  );
  if (!match) return null;

  const year = match[2];
  const monthStr = match[1]?.toLowerCase();
  const month = monthStr ? (months[monthStr] || "01") : "01";
  return `${year}-${month}-01`;
}

export async function uploadResume(userId: string, file: Express.Multer.File) {
  const repo = getRepo();
  const nurseId = await repo.getNurseId(userId);
  if (!nurseId) throw new NotFoundError("Profile not found");

  const fileExt = file.originalname.split(".").pop()?.toLowerCase();
  if (!fileExt || !["pdf", "docx", "doc"].includes(fileExt)) {
    throw new BadRequestError("Only PDF, DOCX, and DOC files are supported");
  }

  const fileName = `${nurseId}/${Date.now()}.${fileExt}`;

  // Upload to storage
  const { error: uploadError } = await repo.uploadFile(fileName, file.buffer, file.mimetype);
  if (uploadError) throw new Error("Failed to upload file to storage");

  // Extract text
  let extractedText = "";
  let parseWarning = "";
  try {
    const { pdfParse, mammoth, WordExtractor } = await getTextExtractors();
    if (fileExt === "pdf") {
      const result = typeof pdfParse === "function" ? await pdfParse(file.buffer) : await pdfParse.default(file.buffer);
      extractedText = result.text || "";
    } else if (fileExt === "docx") {
      const result = await mammoth.convertToHtml({ buffer: file.buffer });
      // Replace block-level tags with newlines, but simply remove inline tags to preserve line structure
      // This prevents "Employer • Location" from being split across lines
      extractedText = result.value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote|section|article|header|footer|ul|ol|table|thead|tbody|tfoot)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } else if (fileExt === "doc") {
      const extractor = new (WordExtractor.default || WordExtractor)();
      const doc = await extractor.extract(file.buffer);
      extractedText = doc.getBody() || "";
    }
  } catch (err) {
    parseWarning = `Text extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`;
  }

  // Parse structured data (dynamic import to avoid bundling issues)
  let parsedData = null;
  if (extractedText) {
    try {
      const { extractResumeDataHybrid } = require("../../shared/data-extractor");
      parsedData = await extractResumeDataHybrid(extractedText);
    } catch (err) {
      console.error("Data extraction failed:", err);
    }
  }

  // Delete existing resumes
  const { data: existingResumes } = await repo.findByNurseId(nurseId);
  if (existingResumes && existingResumes.length > 0) {
    const paths = existingResumes.map((r) => r.file_path).filter(Boolean);
    if (paths.length > 0) await repo.removeFiles(paths);
    await repo.deleteByNurseId(nurseId);
  }

  // Save resume record
  const { data: resume, error: dbError } = await repo.create({
    nurse_id: nurseId,
    file_path: fileName,
    original_filename: file.originalname,
    file_type: fileExt,
    extracted_text: extractedText || null,
    parsed_data: parsedData,
  });
  if (dbError) throw new Error("Failed to save resume record");

  // Insert parsed structured data
  if (parsedData) {
    await repo.clearNurseData(nurseId);

    if (parsedData.certifications?.length > 0) {
      await repo.insertCertifications(
        parsedData.certifications.map((c: { type: string; number?: string; score?: string }) => ({
          nurse_id: nurseId,
          cert_type: c.type,
          cert_number: c.number || null,
          score: c.score || null,
        }))
      );
    }

    if (parsedData.skills?.length > 0) {
      await repo.insertSkills(
        parsedData.skills.map((s: string) => ({
          nurse_id: nurseId,
          skill_name: s,
          proficiency: "basic",
        }))
      );
    }

    if (parsedData.experience?.length > 0) {
      const validTypes = ["employment", "clinical_placement", "ojt", "volunteer"];
      const looksLikeSentence = (text: string) =>
        text.split(/\s+/).length > 8 ||
        (/\b(that|which|are|was|were|has|had|have|been|being|is)\b/i.test(text) && text.split(/\s+/).length > 5) ||
        /[.!]$/.test(text.trim());

      const expRecords = parsedData.experience
        .filter((e: { employer?: string; position?: string }) => e.employer && e.position && !looksLikeSentence(e.employer!))
        .map((e: { employer?: string; position?: string; type?: string; department?: string; description?: string; location?: string; start_date?: string; end_date?: string }) => ({
          nurse_id: nurseId,
          employer: e.employer,
          position: e.position,
          type: validTypes.includes(e.type || "") ? e.type : "employment",
          department: e.department || null,
          description: e.description || null,
          location: e.location || null,
          start_date: toDateString(e.start_date || "") || "1900-01-01",
          end_date: !e.end_date || /present|current/i.test(e.end_date) ? null : toDateString(e.end_date),
        }));
      if (expRecords.length > 0) await repo.insertExperience(expRecords);
    }

    if (parsedData.education?.length > 0) {
      const eduRecords = parsedData.education
        .filter((e: { degree?: string; institution?: string }) => e.degree || e.institution)
        .map((e: { institution?: string; degree?: string; field_of_study?: string; year?: number; institution_location?: string; start_date?: string; end_date?: string; status?: string }) => {
          let gradYear: number | null = null;
          if (e.year && typeof e.year === "number") gradYear = e.year;
          else if (e.year && /^\d{4}$/.test(String(e.year))) gradYear = parseInt(String(e.year), 10);

          return {
            nurse_id: nurseId,
            institution: e.institution || "Unknown",
            degree: e.degree || "Bachelor of Science in Nursing",
            field_of_study: e.field_of_study || null,
            graduation_year: gradYear,
            institution_location: e.institution_location || null,
            start_date: e.start_date ? toDateString(e.start_date) : null,
            end_date: e.end_date ? toDateString(e.end_date) : null,
            status: e.status || null,
          };
        });
      if (eduRecords.length > 0) await repo.insertEducation(eduRecords);
    }

    // Populate nurse profile fields (only fill empty fields)
    const { data: currentProfile } = await repo.getNurseProfile(nurseId);
    if (currentProfile) {
      const updates: Record<string, unknown> = {};
      if (!currentProfile.bio && parsedData.summary) {
        updates.bio = parsedData.summary;
      }
      if (!currentProfile.address && parsedData.address) {
        updates.address = parsedData.address;
      }
      if (!currentProfile.graduation_year && parsedData.graduation_year) {
        updates.graduation_year = parsedData.graduation_year;
      }
      if (!currentProfile.years_of_experience && parsedData.years_of_experience) {
        updates.years_of_experience = parsedData.years_of_experience;
      }
      if (Object.keys(updates).length > 0) {
        await repo.updateNurseProfile(nurseId, updates);
      }
    }
  }

  return {
    resume_id: resume.id,
    extracted_text: !!extractedText,
    parsed_data: parsedData,
    warning: parseWarning || undefined,
  };
}

export async function getResumeUrl(resumeId: string, userId: string, userRole: string) {
  const repo = getRepo();
  const { data: resume, error } = await repo.findById(resumeId);
  if (error || !resume) throw new NotFoundError("Resume not found");

  const nurse = resume.nurse as unknown as { user_id: string };
  if (userRole !== "admin" && nurse.user_id !== userId) {
    throw new ForbiddenError();
  }

  const { data: signedData, error: signError } = await repo.createSignedUrl(resume.file_path, 3600);
  if (signError || !signedData) throw new Error("Failed to generate download URL");

  return {
    url: signedData.signedUrl,
    filename: resume.original_filename,
    file_type: resume.file_type,
  };
}

export async function deleteResume(resumeId: string, userId: string) {
  const repo = getRepo();
  const { data: resume, error } = await repo.findById(resumeId);
  if (error || !resume) throw new NotFoundError("Resume not found");

  const nurse = resume.nurse as unknown as { user_id: string };
  if (nurse.user_id !== userId) throw new ForbiddenError();

  await repo.removeFiles([resume.file_path]);
  const { error: deleteError } = await repo.deleteById(resumeId);
  if (deleteError) throw new Error("Failed to delete resume");
}

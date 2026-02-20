import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedResumeData } from "./types";

const RESUME_EXTRACTION_PROMPT = `You are a resume parser. Extract structured data from the following resume text and return valid JSON.

IMPORTANT RULES:
- Return ONLY valid JSON, no markdown or explanation
- CRITICAL: If the resume text has words merged together without spaces (e.g., "assessmentsofpostoperativepatients"), you MUST fix the spacing and produce properly spaced, readable text in your output (e.g., "assessments of postoperative patients").
- For dates, use "Month Year" format (e.g., "January 2020", "March 2023"). If a date contains a placeholder like "20XX" or "XXXX", omit it or use the best available date.
- For end dates that are current/ongoing, use "Present"
- For experience descriptions, format each responsibility as a separate bullet point prefixed with "• " and joined by newlines
- For skills, extract individual skill names (not sentences)
- graduation_year should be the most recent nursing degree graduation year
- years_of_experience should be calculated from work experience dates
- Only include hospitals/medical facilities that appear as employers or placement sites
- IMPORTANT: Include clinical placements, OJT (on-the-job training), internships, and volunteer work as experience entries. Set the "type" field to categorize each entry.
- Include ALL levels of education: elementary/primary school, secondary/high school, vocational/technical, college/university, and postgraduate. Use the appropriate degree name (e.g., "High School Diploma", "Elementary Education", "Bachelor of Science in Nursing").
- For US-based resumes, extract state RN license numbers (e.g., "CA-RN-492817", "RN-785234") and all nursing certifications including PALS, TNCC, CCRN, NIH Stroke Scale, Chemotherapy & Biotherapy Provider, CEN, ENPC.
- When employer names include location separators (pipe "|" or bullet "•"), split them: employer name goes in "employer" and city/state goes in "location".
- IMPORTANT: Distinguish between employer and department. Lines like "Pain Management", "Cardiovascular ICU", "Emergency Department", "Oncology Unit" are departments/units, NOT employers. The employer is the hospital/company name (e.g., "Cedars-Sinai Medical Center", "UCLA Medical Center"). Do NOT put the employer name or location in the description bullets.

JSON Schema:
{
  "summary": "2-4 sentence professional summary or objective",
  "experience": [
    {
      "employer": "Company/Hospital name (NOT a department like 'Pain Management', 'Cardiovascular ICU', etc.)",
      "position": "Job title (do NOT append type labels like 'Clinical Placement' here)",
      "type": "employment | clinical_placement | ojt | volunteer",
      "department": "Department/Unit name if mentioned (e.g., 'Pain Management', 'Emergency Department', 'Cardiovascular ICU')",
      "start_date": "Month Year",
      "end_date": "Month Year or Present",
      "description": "• First responsibility\\n• Second responsibility (do NOT include the employer name, address, or department here)",
      "location": "City, Country (if mentioned)"
    }
  ],
  "education": [
    {
      "institution": "University/School name",
      "degree": "Full degree name (e.g., Bachelor of Science in Nursing)",
      "field_of_study": "Major/Specialization if separate from degree",
      "year": 2020,
      "start_date": "YYYY-MM-DD (if available)",
      "end_date": "YYYY-MM-DD (if available)",
      "institution_location": "City, Country (if mentioned)",
      "status": "Graduated/In Progress (if mentioned)"
    }
  ],
  "certifications": [
    {
      "type": "Certification name (e.g., BLS, ACLS, PALS, TNCC, CCRN, CEN, ENPC, PRC License, RN License, NCLEX, NLE, IELTS, NIH Stroke Scale, Chemotherapy & Biotherapy Provider)",
      "number": "License/cert number if mentioned (e.g., CA-RN-492817, RN-785234, CCRN-2020-8547)",
      "score": "Score/rating if mentioned"
    }
  ],
  "skills": ["Skill 1", "Skill 2"],
  "hospitals": ["Hospital/Medical facility names mentioned"],
  "address": "Full address from resume header",
  "graduation_year": 2020,
  "years_of_experience": 3
}

Resume text:
---
`;

/**
 * Score how confident we are in the regex parser's output.
 * Returns 0-100. Below 55 = poor, should use AI fallback.
 */
export function scoreParseConfidence(
  result: ParsedResumeData,
  rawText?: string
): number {
  let score = 0;

  // Experience with position AND employer (+30), with quality checks
  if (result.experience && result.experience.length > 0) {
    const goodEntries = result.experience.filter(
      (e) =>
        e.position &&
        e.employer &&
        e.start_date &&
        (e.position.length < 60) && // Position shouldn't have embedded dates/locations
        (e.employer.split(/\s+/).length <= 8) && // Employer shouldn't be a sentence
        !/[.!]$/.test((e.employer || "").trim()) // Employer shouldn't end with period
    );
    if (goodEntries.length > 0) score += 30;
    else score += 5; // Very low credit for garbage entries

    // Penalty: many entries missing employer or position
    const total = result.experience.length;
    const incomplete = result.experience.filter((e) => !e.position || !e.employer).length;
    if (total > 0 && incomplete / total > 0.5) score -= 15;
  }

  // Education with degree AND institution (+25)
  if (result.education && result.education.length > 0) {
    const hasGoodEducation = result.education.some(
      (e) => e.degree && e.institution && e.institution.length < 80
    );
    if (hasGoodEducation) score += 25;
    else score += 8; // Partial credit
  }

  // Summary present (+10)
  if (result.summary && result.summary.length > 30) score += 10;

  // Certifications found (+10)
  if (result.certifications && result.certifications.length > 0) score += 10;

  // Skills found (3+) (+10)
  if (result.skills && result.skills.length >= 3) score += 10;

  // Address found (+5)
  if (result.address) score += 5;

  // Experience descriptions present (+10)
  if (result.experience && result.experience.some((e) => e.description)) {
    score += 10;
  }

  // Penalty: text mentions work/employment but no experience was extracted (-15)
  if (rawText && (!result.experience || result.experience.length === 0)) {
    const hasWorkKeywords =
      /\b(experience|employment|work history|professional|hospital|nurse at|staff nurse|registered nurse)\b/i.test(
        rawText
      );
    if (hasWorkKeywords) score -= 15;
  }

  // Penalty: text has clinical placements/volunteer sections but none extracted with correct type (-15)
  if (rawText && result.experience) {
    const hasPlacementSection = /\b(clinical\s+placement|clinical\s+rotation|consolidation.*hours|pre-consolidation)/i.test(rawText);
    const hasPlacementEntries = result.experience.some((e) => e.type === "clinical_placement");
    if (hasPlacementSection && !hasPlacementEntries) score -= 15;
  }

  return Math.max(0, score);
}

/**
 * Extract resume data using Google Gemini AI.
 * Uses gemini-2.0-flash-lite for cost efficiency (~$0.0003/resume).
 */
export async function extractResumeDataAI(
  text: string
): Promise<ParsedResumeData> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    console.warn("GOOGLE_AI_API_KEY not set, skipping AI parsing");
    return {};
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const prompt = RESUME_EXTRACTION_PROMPT + text + "\n---";
    const result = await model.generateContent(prompt);
    const response = result.response;
    const jsonText = response.text();

    const parsed = JSON.parse(jsonText);

    // Map AI response to ParsedResumeData format
    const data: ParsedResumeData = {};

    if (parsed.summary) data.summary = parsed.summary;
    if (parsed.address) data.address = parsed.address;
    if (parsed.graduation_year) data.graduation_year = parsed.graduation_year;
    if (parsed.years_of_experience != null)
      data.years_of_experience = parsed.years_of_experience;

    // Map experience
    if (Array.isArray(parsed.experience) && parsed.experience.length > 0) {
      data.experience = parsed.experience.map(
        (e: {
          employer?: string;
          position?: string;
          type?: string;
          start_date?: string;
          end_date?: string;
          description?: string;
          location?: string;
          department?: string;
        }) => ({
          employer: e.employer || undefined,
          position: e.position || undefined,
          type: e.type || "employment",
          start_date: e.start_date || undefined,
          end_date: e.end_date || undefined,
          description: e.description || undefined,
          location: e.location || undefined,
          department: e.department || undefined,
        })
      );
    }

    // Map education
    if (Array.isArray(parsed.education) && parsed.education.length > 0) {
      data.education = parsed.education.map(
        (e: {
          institution?: string;
          degree?: string;
          field_of_study?: string;
          year?: number;
          institution_location?: string;
          start_date?: string;
          end_date?: string;
          status?: string;
        }) => ({
          institution: e.institution || undefined,
          degree: e.degree || undefined,
          field_of_study: e.field_of_study || undefined,
          year: e.year || undefined,
          institution_location: e.institution_location || undefined,
          start_date: e.start_date || undefined,
          end_date: e.end_date || undefined,
          status: e.status || undefined,
        })
      );
    }

    // Map certifications
    if (
      Array.isArray(parsed.certifications) &&
      parsed.certifications.length > 0
    ) {
      data.certifications = parsed.certifications.map(
        (c: { type?: string; number?: string; score?: string }) => ({
          type: c.type || "Unknown",
          number: c.number || undefined,
          score: c.score || undefined,
        })
      );
    }

    // Map skills
    if (Array.isArray(parsed.skills) && parsed.skills.length > 0) {
      data.skills = parsed.skills.filter(
        (s: unknown) => typeof s === "string" && s.length > 0
      );
    }

    // Map hospitals
    if (Array.isArray(parsed.hospitals) && parsed.hospitals.length > 0) {
      data.hospitals = parsed.hospitals.filter(
        (h: unknown) => typeof h === "string" && h.length > 0
      );
    }

    return data;
  } catch (error) {
    console.error("AI resume parsing failed:", error);
    return {};
  }
}

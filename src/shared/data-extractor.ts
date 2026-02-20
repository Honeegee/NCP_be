import type { ParsedResumeData } from "./types";
import { scoreParseConfidence, extractResumeDataAI } from "./ai-resume-parser";

// Feature scoring system for resume extraction
interface ScoredCandidate {
  text: string;
  score: number;
  lineIndex: number;
}

function scorePositionCandidate(text: string, context: {
  isBeforeDate: boolean;
  distanceFromDate: number;
  hasPositionKeywords: boolean;
  startsWithCapital: boolean;
  length: number;
}): number {
  let score = 0;

  // Positive scoring
  if (context.hasPositionKeywords) score += 40; // Strong indicator
  if (context.isBeforeDate) score += 20; // Positions usually before dates
  if (context.startsWithCapital) score += 10;
  if (context.length > 10 && context.length < 60) score += 15; // Good length range

  // Distance scoring (closer to date is better)
  if (context.distanceFromDate === 1) score += 25;
  else if (context.distanceFromDate === 2) score += 15;
  else if (context.distanceFromDate === 3) score += 5;

  // Negative scoring
  if (text.toLowerCase() === 'unknown') score -= 50;
  if (text.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company)\b/i)) score -= 30; // Likely employer
  if (text.match(/^[\w\s]+,\s+[\w\s]+$/)) score -= 30; // Likely location
  if (context.length < 5 || context.length > 80) score -= 20; // Too short/long
  if (text.match(/^[A-Z][A-Z\s]+$/)) score -= 15; // All caps (might be header)

  return score;
}

function scoreEmployerCandidate(text: string, context: {
  isBeforeDate: boolean;
  distanceFromDate: number;
  hasCompanyKeywords: boolean;
  length: number;
  isKnownHospital: boolean;
}): number {
  let score = 0;

  // Positive scoring
  if (context.isKnownHospital) score += 50; // Very strong indicator
  if (context.hasCompanyKeywords) score += 35; // Strong indicator
  if (context.isBeforeDate) score += 20;
  if (context.length > 5 && context.length < 100) score += 10;

  // Distance scoring
  if (context.distanceFromDate === 1) score += 20;
  else if (context.distanceFromDate === 2) score += 10;
  else if (context.distanceFromDate === 3) score += 5;

  // Negative scoring
  if (text.toLowerCase() === 'unknown') score -= 50;
  if (text.match(/^[\w\s]+,\s+[\w\s]+$/)) score -= 30; // Likely location
  if (text.match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Technician|Supervisor)/i)) score -= 25; // Likely position
  if (context.length < 3 || context.length > 150) score -= 20;

  // Penalize sentence-like text (descriptions, not employer names)
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 8) score -= 40; // Too many words for an employer name
  if (/\b(that|which|with|from|this|the|are|was|were|has|had|have|been|being|is)\b/i.test(text) && wordCount > 5) score -= 50;
  if (/[.!]$/.test(text.trim())) score -= 30; // Ends with period/exclamation — likely a sentence
  return score;
}

// Known hospitals (Philippines + major US hospitals)
const KNOWN_HOSPITALS = [
  // Philippines
  "St. Luke's Medical Center",
  "St. Luke's",
  "Makati Medical Center",
  "The Medical City",
  "Philippine General Hospital",
  "PGH",
  "Philippine Heart Center",
  "National Kidney Institute",
  "Veterans Memorial Medical Center",
  "East Avenue Medical Center",
  "Quezon City General Hospital",
  "Manila Doctors Hospital",
  "Asian Hospital",
  "Cardinal Santos Medical Center",
  "Chong Hua Hospital",
  "Cebu Doctors",
  "Cebu Doctors' University Hospital",
  "Vicente Sotto Memorial Medical Center",
  "Davao Doctors Hospital",
  "Southern Philippines Medical Center",
  "Baguio General Hospital",
  "Jose B. Lingad Memorial",
  "Ospital ng Maynila",
  "UP-PGH",
  "UST Hospital",
  "FEU-NRMF Medical Center",
  // Major US hospitals
  "Memorial Hermann Hospital",
  "Memorial Hermann",
  "Houston Methodist Hospital",
  "Houston Methodist",
  "St. Luke's Health System",
  "Cedars-Sinai Medical Center",
  "Cedars-Sinai",
  "UCLA Medical Center",
  "Kaiser Permanente",
  "Mayo Clinic",
  "Cleveland Clinic",
  "Johns Hopkins Hospital",
  "Massachusetts General Hospital",
  "Mount Sinai Hospital",
  "NewYork-Presbyterian Hospital",
  "Stanford Health Care",
  "UCSF Medical Center",
  "Duke University Hospital",
  "Northwestern Memorial Hospital",
  "Brigham and Women's Hospital",
  "NYU Langone",
  "Emory University Hospital",
  "Vanderbilt University Medical Center",
  "Rush University Medical Center",
  "Barnes-Jewish Hospital",
  "Tampa General Hospital",
  "AdventHealth",
  "HCA Healthcare",
];

// Common nursing skills keywords
const SKILL_KEYWORDS = [
  "Patient Assessment",
  "IV Therapy",
  "Medication Administration",
  "Wound Care",
  "Vital Signs",
  "Patient Education",
  "Critical Care",
  "Emergency Response",
  "Infection Control",
  "Documentation",
  "Perioperative Nursing",
  "Geriatric Care",
  "Pediatric Nursing",
  "Obstetric Nursing",
  "Psychiatric Nursing",
  "Surgical Nursing",
  "Cardiac Monitoring",
  "Ventilator Management",
  "Hemodynamic Monitoring",
  "Tracheostomy Care",
  "Blood Transfusion",
  "Catheterization",
  "CPR",
  "BLS",
  "ACLS",
  "Sterile Technique",
  "Chemotherapy Administration",
  "Dialysis",
  "Triage",
  "Health Assessment",
  "Care Planning",
  "Discharge Planning",
  "Patient Advocacy",
  "Clinical Documentation",
  "EHR",
  "Electronic Health Records",
  "Telemetry",
  // Additional clinical skills
  "Pain Management",
  "Post-Operative Care",
  "Crisis Management",
  "Crisis Intervention",
  "Quality Improvement",
  "Quality Assurance",
  "Phlebotomy",
  "Wound Care Management",
  "Emergency Trauma Care",
  "Trauma Care",
  "Staff Mentoring",
  "Patient & Family Education",
  "Team Leadership",
  "Clinical Assessment",
  "Medication Management",
  "Infection Prevention",
  "Sepsis Protocols",
  "Sepsis Management",
  "PICC Line",
  "Central Line Care",
  "Mechanical Ventilation",
  "ECMO",
  "Oncology Nursing",
  "Palliative Care",
  "End-of-Life Care",
  "EHR Documentation",
  "Epic",
  "Cerner",
  "Meditech",
  "Arrhythmia Management",
  "Cardiac Care",
  "Heart Failure Management",
  "Diabetes Management",
  "Chronic Disease Management",
];

export function extractResumeData(text: string): ParsedResumeData {
  const result: ParsedResumeData = {};

  result.summary = extractSummary(text);
  result.graduation_year = extractGraduationYear(text);
  result.certifications = extractCertifications(text);
  result.hospitals = extractHospitals(text);
  result.skills = extractSkills(text);
  result.salary = extractSalary(text);
  result.experience = extractExperience(text);
  result.education = extractEducation(text);
  result.years_of_experience = calculateYearsOfExperience(result.experience || []);
  result.address = extractAddress(text);

  return result;
}

function extractSummary(text: string): string | undefined {
  // Look for various summary section headers
  const headerPattern =
    /(?:PROFESSIONAL\s+SUMMARY|CAREER\s+SUMMARY|EXECUTIVE\s+SUMMARY|SUMMARY|CAREER\s+OBJECTIVES?|OBJECTIVES?|ABOUT\s+ME|PROFESSIONAL\s+PROFILE|PROFILE|PERSONAL\s+STATEMENT|OVERVIEW)[\s:]*/i;
  const headerMatch = headerPattern.exec(text);

  if (!headerMatch) return undefined;

  // Get text after the header
  const afterHeader = text.substring(headerMatch.index + headerMatch[0].length);

  // Find the next ALL-CAPS section header (may end with colon, e.g., "PERSONAL BACKGROUND:")
  const nextSectionMatch = afterHeader.match(/\n([A-Z][A-Z\s&]{3,}):?\s*\n/);
  const sectionText = nextSectionMatch
    ? afterHeader.substring(0, nextSectionMatch.index)
    : afterHeader.substring(0, 600); // Increased from 500 to capture more

  // Clean up: join lines, remove excess whitespace
  const summary = sectionText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.match(/^[A-Z\s&]{4,}$/)) // Remove any accidental section headers
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (summary.length > 20 && summary.length < 1500) {
    return summary;
  }

  return undefined;
}

function extractGraduationYear(text: string): number | undefined {
  // Look for graduation year near education-related keywords
  const educationKeywords =
    /(?:graduat|Bachelor|Master|Doctorate|Ph\.?D|degree|diploma|university|college|B\.S|M\.S|MBA|B\.A|M\.A)/i;

  const lines = text.split("\n");
  const currentYear = new Date().getFullYear();

  for (const line of lines) {
    if (educationKeywords.test(line)) {
      const yearMatch = line.match(/\b(19[6-9]\d|20[0-2]\d)\b/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1]);
        if (year >= 1960 && year <= currentYear + 6) { // Allow future years for expected graduation
          return year;
        }
      }
    }
  }

  // Fallback: look for year near "graduated" keyword within a few lines
  for (let i = 0; i < lines.length; i++) {
    if (/graduat/i.test(lines[i])) {
      const searchRange = lines.slice(Math.max(0, i - 1), i + 3).join(" ");
      const yearMatch = searchRange.match(/\b(19[6-9]\d|20[0-2]\d)\b/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1]);
        if (year >= 1960 && year <= currentYear + 6) {
          return year;
        }
      }
    }
  }

  return undefined;
}

function extractCertifications(
  text: string
): { type: string; number?: string; score?: string }[] {
  const certs: { type: string; number?: string; score?: string }[] = [];
  const textUpper = text.toUpperCase();

  // NCLEX
  if (/NCLEX/i.test(text)) {
    const nclex: { type: string; number?: string } = { type: "NCLEX" };
    // Try to find license number
    const ncNum = text.match(/NCLEX[\s-]*(?:RN)?[\s:]*(?:#?\s*)?(\d{6,})/i);
    if (ncNum) nclex.number = ncNum[1];
    certs.push(nclex);
  }

  // IELTS
  if (/IELTS/i.test(text)) {
    const ielts: { type: string; score?: string } = { type: "IELTS" };
    // Try to find score
    const scoreMatch = text.match(
      /IELTS[\s\S]{0,50}?(?:score|band|overall|result)?[\s:]*(\d+\.?\d*)/i
    );
    if (scoreMatch) ielts.score = scoreMatch[1];
    certs.push(ielts);
  }

  // PRC License
  if (/PRC/i.test(text) || /Professional Regulation Commission/i.test(text)) {
    const prc: { type: string; number?: string } = { type: "PRC License" };
    const prcNum = text.match(
      /PRC[\s-]*(?:License|Board|Registration)?[\s#:]*(\d{5,})/i
    );
    if (prcNum) prc.number = prcNum[1];
    certs.push(prc);
  }

  // BLS
  if (textUpper.includes("BLS") || /Basic Life Support/i.test(text)) {
    if (!certs.find((c) => c.type === "BLS")) {
      certs.push({ type: "BLS" });
    }
  }

  // ACLS
  if (textUpper.includes("ACLS") || /Advanced Cardiac Life Support/i.test(text)) {
    if (!certs.find((c) => c.type === "ACLS")) {
      certs.push({ type: "ACLS" });
    }
  }

  // OSCE
  if (/OSCE/i.test(text)) {
    certs.push({ type: "OSCE" });
  }

  // NLE (Nurse Licensure Examination)
  if (/NLE/i.test(text) || /Nurse Licensure Examination/i.test(text)) {
    if (!certs.find((c) => c.type === "NLE")) {
      certs.push({ type: "NLE" });
    }
  }

  // PALS (Pediatric Advanced Life Support)
  if (textUpper.includes("PALS") || /Pediatric Advanced Life Support/i.test(text)) {
    if (!certs.find((c) => c.type === "PALS")) {
      certs.push({ type: "PALS" });
    }
  }

  // TNCC (Trauma Nursing Core Course)
  if (textUpper.includes("TNCC") || /Trauma Nursing Core Course/i.test(text)) {
    if (!certs.find((c) => c.type === "TNCC")) {
      certs.push({ type: "TNCC" });
    }
  }

  // CCRN (Critical Care Registered Nurse)
  if (textUpper.includes("CCRN") || /Critical Care Registered Nurse/i.test(text)) {
    if (!certs.find((c) => c.type === "CCRN")) {
      const ccrnNum = text.match(/CCRN[\s\-]*(?:Certification)?[\s#:]*(?:Number)?[\s#:]*([A-Z0-9\-]{5,})/i);
      certs.push({ type: "CCRN", number: ccrnNum ? ccrnNum[1] : undefined });
    }
  }

  // NIH Stroke Scale Certification
  if (/NIH Stroke Scale/i.test(text) || /NIHSS/i.test(text)) {
    if (!certs.find((c) => c.type === "NIH Stroke Scale")) {
      certs.push({ type: "NIH Stroke Scale" });
    }
  }

  // Chemotherapy & Biotherapy Provider
  if (/Chemotherapy\s*(?:&|and)\s*Biotherapy/i.test(text)) {
    if (!certs.find((c) => c.type === "Chemotherapy & Biotherapy Provider")) {
      certs.push({ type: "Chemotherapy & Biotherapy Provider" });
    }
  }

  // RN License (state-based, e.g., "Registered Nurse (RN) - Texas", "CA-RN-492817")
  const rnLicenseMatch = text.match(
    /(?:Registered\s+Nurse\s*\(RN\)|RN\s+License)[\s\-,]*(?:[A-Z]{2})?[\s\-]*(?:License\s*)?#?\s*([A-Z]{0,3}[\-]?RN[\-]?\d{4,})/i
  );
  if (rnLicenseMatch) {
    if (!certs.find((c) => c.type === "RN License")) {
      certs.push({ type: "RN License", number: rnLicenseMatch[1] });
    }
  } else {
    // Fallback: match patterns like "CA-RN-492817" or "License #RN-785234"
    const rnNumMatch = text.match(/(?:License\s*#?\s*)?([A-Z]{0,3}[\-]?RN[\-]\d{4,})/i);
    if (rnNumMatch && !certs.find((c) => c.type === "RN License")) {
      certs.push({ type: "RN License", number: rnNumMatch[1] });
    }
  }

  // ENPC (Emergency Nursing Pediatric Course)
  if (textUpper.includes("ENPC") || /Emergency Nursing Pediatric/i.test(text)) {
    if (!certs.find((c) => c.type === "ENPC")) {
      certs.push({ type: "ENPC" });
    }
  }

  // CEN (Certified Emergency Nurse)
  if (textUpper.includes("CEN") && /Certified Emergency Nurse|Emergency\s+Nurse.*Certif/i.test(text)) {
    if (!certs.find((c) => c.type === "CEN")) {
      certs.push({ type: "CEN" });
    }
  }

  return certs;
}

function extractHospitals(text: string): string[] {
  const found: string[] = [];

  for (const hospital of KNOWN_HOSPITALS) {
    if (text.toLowerCase().includes(hospital.toLowerCase())) {
      // Use the canonical name
      if (!found.includes(hospital)) {
        found.push(hospital);
      }
    }
  }

  // Also try to find "Hospital" or "Medical Center" mentions not in the list
  // Match proper nouns (capitalized words) followed by Hospital/Medical Center etc.
  const hospitalPattern =
    /(?:[A-Z][a-z]+(?:[^\S\n]+(?:of|de|ng|and|&)[^\S\n]+)?(?:[A-Z][a-z.']+[^\S\n]*)*(?:Hospital|Medical Center|Health Center|Medical Centre))/g;
  const matches = text.match(hospitalPattern);
  if (matches) {
    for (const match of matches) {
      const cleaned = match.trim();
      if (
        cleaned.length > 10 &&
        cleaned.length < 80 &&
        !found.some((f) => f.toLowerCase() === cleaned.toLowerCase())
      ) {
        found.push(cleaned);
      }
    }
  }

  return found;
}

function extractSkills(text: string): string[] {
  const found: string[] = [];
  const textLower = text.toLowerCase();

  // First, check for nursing-specific keywords (for nursing resumes)
  for (const skill of SKILL_KEYWORDS) {
    if (textLower.includes(skill.toLowerCase())) {
      if (!found.some((f) => f.toLowerCase() === skill.toLowerCase())) {
        found.push(skill);
      }
    }
  }

  // Try to find a skills section and parse individual items
  const skillsSectionMatch = text.match(
    /(?:SKILLS|TECHNICAL SKILLS|PROFESSIONAL SKILLS|CORE COMPETENCIES|CLINICAL SKILLS|KEY SKILLS|COMPETENCIES|EXPERTISE|CORE SKILLS|TECHNOLOGIES|PROFICIENCIES)[\s:]*\n([\s\S]*?)(?:\n\s*\n\s*\n|\n[A-Z][A-Z\s&]{3,}\n|$)/i
  );

  if (skillsSectionMatch) {
    const skillsText = skillsSectionMatch[1];
    // Split bullet lines, then split each by comma/semicolon
    const lines = skillsText.split(/\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Skip if line looks like a section header
      if (line.match(/^[A-Z][A-Z\s&]{3,}$/)) continue;

      // Remove bullet prefix
      const cleaned = line.replace(/^[•\-\*▪●◦➤→]\s*/, "").replace(/^\d+[.)]\s*/, "");

      // Check if line has a category label (e.g., "Programming: Python, Java, C++")
      const categoryMatch = cleaned.match(/^([A-Za-z\s&]+?):\s*(.+)$/);
      if (categoryMatch) {
        // Extract skills from the category
        const skillsPart = categoryMatch[2];
        const items = skillsPart
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1 && s.length < 60);

        for (const item of items) {
          if (!found.some((f) => f.toLowerCase() === item.toLowerCase())) {
            found.push(item);
          }
        }
      } else {
        // No category, split by comma/semicolon
        const items = cleaned
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1 && s.length < 60);

        for (const item of items) {
          // Skip if it's too generic or looks like a sentence
          if (item.split(/\s+/).length > 6) continue; // Skip long sentences
          if (!found.some((f) => f.toLowerCase() === item.toLowerCase())) {
            found.push(item);
          }
        }
      }
    }
  }

  // Also look for common technical skills patterns anywhere in resume
  const techSkillPatterns = [
    // Programming languages
    /\b(?:JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Go|Rust|SQL|HTML|CSS|React|Vue|Angular|Node\.js|Django|Flask|Spring|\.NET)\b/gi,
    // Tools and platforms
    /\b(?:Git|Docker|Kubernetes|AWS|Azure|GCP|Jenkins|CI\/CD|Jira|Agile|Scrum)\b/gi,
  ];

  for (const pattern of techSkillPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const skill = match[0];
      if (!found.some((f) => f.toLowerCase() === skill.toLowerCase())) {
        found.push(skill);
      }
    }
  }

  return found;
}

function extractSalary(text: string): string | undefined {
  const salaryPatterns = [
    /(?:salary|compensation|pay|wage)[\s:]*(?:PHP|₱|Php)\s*[\d,]+/i,
    /(?:PHP|₱)\s*[\d,]+(?:\s*[-–]\s*(?:PHP|₱)?\s*[\d,]+)?/i,
    /(?:USD|\$)\s*[\d,]+(?:\s*[-–]\s*(?:USD|\$)?\s*[\d,]+)?/i,
  ];

  for (const pattern of salaryPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}

function extractExperience(
  text: string
): { employer?: string; position?: string; start_date?: string; end_date?: string; department?: string; description?: string; location?: string }[] {
  const experiences: { employer?: string; position?: string; start_date?: string; end_date?: string; department?: string; description?: string; location?: string }[] = [];

  // Identify and exclude non-experience sections from experience parsing
  // These sections often contain date ranges that would be falsely matched as work experience
  const sectionsToExclude = [
    /\n(EDUCATION(?:\s*&\s*CERTIFICATIONS?)?|ACADEMIC BACKGROUND|EDUCATIONAL BACKGROUND|EDUCATIONAL ATTAINMENT)[\s:]*\n/i,
    /\n(HONORS[,\s]*AWARDS?[,\s&]*SCHOLARSHIPS?|AWARDS?\s+AND\s+HONORS?|HONORS?\s+AND\s+AWARDS?|HONORS?\s*,\s*AWARDS?|AWARDS?\s*&\s*HONORS?)[\s:]*\n/i,
    /\n(SEMINARS?\s+AND\s+TRAININGS?\s+ATTENDED|SEMINARS?\s+AND\s+TRAININGS?|TRAININGS?\s+AND\s+SEMINARS?|SEMINARS?\s+ATTENDED|TRAININGS?\s+ATTENDED)[\s:]*\n/i,
    /\n(CLINICAL\s+INTERNSHIP|INTERNSHIPS?|CLINICAL\s+ROTATIONS?|RELATED\s+LEARNING\s+EXPERIENCE)[\s:]*\n/i,
    /\n(PERSONAL\s+INFORMATION|PERSONAL\s+BACKGROUND|PERSONAL\s+DATA)[\s:]*\n/i,
    /\n(CHARACTER\s+REFERENCES?|REFERENCES?)[\s:]*\n/i,
    /\n(QUALIFICATIONS?\s+AND\s+MEMBERSHIP|MEMBERSHIPS?|AFFILIATIONS?|PROFESSIONAL\s+MEMBERSHIPS?|PROFESSIONAL\s+AFFILIATIONS?)[\s:]*\n/i,
    /\n(LICENSES?\s*&\s*CERTIFICATIONS?|CERTIFICATIONS?\s*&\s*LICENSES?|CERTIFICATIONS?)[\s:]*\n/i,
    /\n(CONTINUING\s+EDUCATION|PROFESSIONAL\s+DEVELOPMENT)[\s:]*\n/i,
    /\n(ADDITIONAL\s+INFORMATION|ADDITIONAL\s+QUALIFICATIONS?)[\s:]*\n/i,
  ];

  let experienceText = text;

  for (const sectionPattern of sectionsToExclude) {
    const sectionMatch = experienceText.match(sectionPattern);
    if (sectionMatch && sectionMatch.index !== undefined) {
      const sectionStart = sectionMatch.index;
      const afterSection = experienceText.substring(sectionStart + sectionMatch[0].length);

      // Find the next major section header (all caps, at least 8 chars)
      const nextSectionMatch = afterSection.match(/\n([A-Z][A-Z\s&,]{7,})\n/);

      if (nextSectionMatch && nextSectionMatch.index !== undefined) {
        const sectionEnd = sectionStart + sectionMatch[0].length + nextSectionMatch.index;
        experienceText = experienceText.substring(0, sectionStart) + '\n\n' + experienceText.substring(sectionEnd);
      } else {
        // No next section — remove from this section to end of text
        experienceText = experienceText.substring(0, sectionStart);
      }
    }
  }

  // Pattern: Date range on a line - handles both "Month Year - Month Year" and "Year - Year"
  // Updated to handle:
  // 1. Month Year - Month Year (e.g., "March 2023 - October 2023")
  // 2. Year - Year (e.g., "2016 - 2018")
  // 3. Abbreviated months with periods and day numbers (e.g., "Sept. 1, 2010 to Feb. 7, 2011")
  const dateRangePattern =
    /(?:(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*(?:\d{1,2}\s*[,.]?\s*)?)?(\d{4}))\s*(?:[-–—‐‑‒−]+|\bto\b)\s*(?:(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*(?:\d{1,2}\s*[,.]?\s*)?)?(\d{4})|Present|Current)/gi;

  const lines = experienceText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    dateRangePattern.lastIndex = 0; // Always reset before exec to prevent stale lastIndex
    const dateMatch = dateRangePattern.exec(line);
    if (dateMatch) {
      // Skip academic calendar patterns (e.g., "1st Semester 2004-2005")
      if (line.match(/\b(?:1st|2nd|3rd|4th)\s+Semester\b/i)) continue;
      // Skip lines that look like seminar/training entries (date followed by quoted text)
      if (line.match(/^\w+\s+\d{1,2}[,-]\s*\d{1,2},?\s+\d{4}\s+".+"/)) continue;
      // Skip bullet point lines — they are descriptions, not experience entries
      // This prevents matching year ranges inside bullet text (e.g., "...quarters in 2023-2024")
      if (/^[•\-\*▪●◦■▸►‣⁃]/.test(line.trim())) continue;

      const entry: { employer?: string; position?: string; start_date?: string; end_date?: string; department?: string; description?: string; location?: string } = {};

      // Check if there's text BEFORE the date on the same line (US format: "Senior ICU Registered Nurse Jan 2020 - Present")
      const textBeforeDate = line.substring(0, dateMatch.index).trim();
      if (textBeforeDate.length > 3 && textBeforeDate.length < 100) {
        // Text before date is likely the position title (common US resume format)
        const hasPositionKeywords = textBeforeDate.match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Lead|Senior|Junior|Consultant|Officer|Administrator|Executive|Supervisor|Head|Chief|Technician|Nurse|RN|Staff|Clerk)/i) !== null;
        if (hasPositionKeywords) {
          entry.position = textBeforeDate;
        }
      }

      // Check if there's text after the date on the same line (e.g., "July 2009 – Jan 2010 Quezon City General Hospital")
      const textAfterDate = line.substring(dateMatch.index + dateMatch[0].length).trim();
      if (textAfterDate.length > 3 && textAfterDate.length < 100) {
        // Text after date is likely the employer
        entry.employer = textAfterDate;
      }

      // Parse start date
      if (dateMatch[1] && dateMatch[2]) {
        // Has month and year
        entry.start_date = `${dateMatch[1]} ${dateMatch[2]}`;
      } else if (dateMatch[2]) {
        // Year only
        entry.start_date = `January ${dateMatch[2]}`;
      }

      // Parse end date
      if (/present|current/i.test(dateMatch[0])) {
        entry.end_date = "Present";
      } else if (dateMatch[3] && dateMatch[4]) {
        // Has month and year
        entry.end_date = `${dateMatch[3]} ${dateMatch[4]}`;
      } else if (dateMatch[4]) {
        // Year only
        entry.end_date = `December ${dateMatch[4]}`;
      }

      // Track whether position was found on the same line as the date (high confidence)
      const positionFromSameLine = !!entry.position;

      // Use feature scoring to find the best position candidate
      // Look at 3 lines before the date
      const beforeLines = lines.slice(Math.max(0, i - 3), i);
      const positionCandidates: ScoredCandidate[] = [];

      // Only search before-lines for position if we didn't find one on the same line
      if (!positionFromSameLine) {
        // Collect all potential position candidates
        for (let j = 0; j < beforeLines.length; j++) {
          const candidateLine = beforeLines[j].trim();
          if (!candidateLine || candidateLine.length < 3) continue;
          if (candidateLine.match(/^[A-Z\s&]{4,}$/)) continue; // section header
          if (candidateLine.match(/^[\d\s\-•\*]+$/)) continue; // just numbers/bullets
          if (candidateLine.toLowerCase().includes('page ')) continue;
          if (candidateLine.match(/^-+\s*\d+/)) continue; // page number

          let textToScore = candidateLine;
          let extractedLocation = '';

          // Check if line has pipe separator (Position | Location format)
          if (candidateLine.includes('|')) {
            const parts = candidateLine.split('|').map(p => p.trim());
            textToScore = parts[0];
            extractedLocation = parts[1] || '';
          }

          const hasPositionKeywords = textToScore.match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Lead|Senior|Junior|Consultant|Officer|Administrator|Executive|Supervisor|Head|Chief|Technician|Translator|Owner|Crew|Nurse|RN|Staff|Clerk|Admin|Sorting|Control|Treatment|Process|Testing|Trainee|Intern|Volunteer|Instructor|Duty)/i) !== null;

          // Skip obvious locations — but NOT if the line has position keywords (e.g., "Private Duty nurse, Part time job")
          if (!hasPositionKeywords && textToScore.match(/^[\w\s]+,\s+[\w\s]+(?:,\s+[\w\s]+)?$/)) continue;
          // Skip person names
          if (textToScore.match(/^(?:Mr\.|Mrs\.|Ms\.|Dr\.)\s+[\w\s]+$/) && textToScore.split(/\s+/).length <= 4) continue;

          const score = scorePositionCandidate(textToScore, {
            isBeforeDate: true,
            distanceFromDate: beforeLines.length - j,
            hasPositionKeywords,
            startsWithCapital: /^[A-Z][a-z]/.test(textToScore),
            length: textToScore.length,
          });

          positionCandidates.push({
            text: textToScore,
            score,
            lineIndex: j,
          });

          // Store location if found from pipe
          if (extractedLocation && extractedLocation.length < 80 && !entry.location) {
            entry.location = extractedLocation;
          }
        }

        // Pick the highest scoring position from before-date candidates
        if (positionCandidates.length > 0) {
          positionCandidates.sort((a, b) => b.score - a.score);
          if (positionCandidates[0].score > 0) {
            entry.position = positionCandidates[0].text;
          }
        }
      } else {
        // Even when position was found on same line, still scan beforeLines for location (pipe format)
        for (let j = 0; j < beforeLines.length; j++) {
          const candidateLine = beforeLines[j].trim();
          if (candidateLine && candidateLine.includes('|') && !entry.location) {
            const parts = candidateLine.split('|').map(p => p.trim());
            if (parts[1] && parts[1].length < 80) {
              entry.location = parts[1];
            }
          }
        }
      }

      // Also score position candidates AFTER the date line and compare
      // Skip this if position was already found on the same line (high confidence)
      if (!positionFromSameLine) {
        const afterPositionCandidates: ScoredCandidate[] = [];
        for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
          const candidateLine = lines[j].trim();
          if (!candidateLine) continue;

          // Stop at another date, section header, or bullet
          dateRangePattern.lastIndex = 0;
          if (dateRangePattern.test(candidateLine)) { dateRangePattern.lastIndex = 0; break; }
          if (/^[A-Z][A-Z\s&]{3,}$/.test(candidateLine)) break;
          if (/^[•\-\*▪●◦]/.test(candidateLine) || /^\d+[.)]\s/.test(candidateLine)) break;

          // Skip location-like lines
          if (candidateLine.match(/^[\w\s]+,\s+[\w\s]+(?:,\s+[\w\s]+)?$/)) continue;

          const hasPositionKeywords = candidateLine.match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Lead|Senior|Junior|Consultant|Officer|Administrator|Executive|Supervisor|Head|Chief|Technician|Translator|Owner|Crew|Nurse|RN|Staff|Clerk|Admin|Sorting|Control|Treatment|Process|Testing|Trainee|Intern|Volunteer|Instructor)/i) !== null;

          if (!hasPositionKeywords) continue;

          const score = scorePositionCandidate(candidateLine, {
            isBeforeDate: false,
            distanceFromDate: j - i,
            hasPositionKeywords,
            startsWithCapital: /^[A-Z][a-z]/.test(candidateLine),
            length: candidateLine.length,
          });

          afterPositionCandidates.push({ text: candidateLine, score: score + 10, lineIndex: j });
        }

        // Compare best before-date vs best after-date candidates
        if (afterPositionCandidates.length > 0) {
          afterPositionCandidates.sort((a, b) => b.score - a.score);
          const bestBefore = positionCandidates.length > 0 && positionCandidates[0].score > 0 ? positionCandidates[0] : null;
          const bestAfter = afterPositionCandidates[0];

          if (!bestBefore || bestAfter.score > bestBefore.score) {
            entry.position = bestAfter.text;
          }
        }
      }

      // If position is "Unknown" or similar placeholder, try to find real position in description area
      if (!entry.position || entry.position.toLowerCase() === 'unknown' || entry.position.toLowerCase() === 'n/a') {
        // Look in lines AFTER the date for position (first non-bullet line)
        for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
          const candidateLine = lines[j].trim();

          // Skip empty lines
          if (!candidateLine) continue;

          // Skip if it's another date or section header
          if (dateRangePattern.test(candidateLine)) { dateRangePattern.lastIndex = 0; continue; }
          if (/^[A-Z][A-Z\s&]{3,}$/.test(candidateLine)) continue;
          dateRangePattern.lastIndex = 0;

          // Skip bullet points - those are descriptions, not position
          if (/^[•\-\*▪●◦]/.test(candidateLine) || /^\d+[.)]\s/.test(candidateLine)) continue;

          // Skip if it looks like employer or location
          if (entry.employer && candidateLine === entry.employer) continue;
          if (entry.location && candidateLine === entry.location) continue;
          if (candidateLine.match(/^[\w\s]+,\s+[\w\s]+$/)) continue; // Location pattern

          // Look for position with pipe format
          if (candidateLine.includes('|')) {
            const parts = candidateLine.split('|').map(p => p.trim());
            if (parts[0].match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Lead|Senior|Junior|Consultant|Officer|Administrator|Executive|Supervisor|Head|Chief|Technician|Translator|Owner|Crew|Nurse|RN|Staff|Clerk|Admin|Supervisor|Sorting|Control)/i)) {
              entry.position = parts[0];
              break;
            }
          }

          // Look for position keywords (expanded list)
          if (candidateLine.match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Lead|Senior|Junior|Consultant|Officer|Administrator|Executive|Supervisor|Head|Chief|Technician|Translator|Owner|Crew|Nurse|RN|Staff|Clerk|Admin|Sorting|Control|Treatment|Process|Testing)/i) &&
              candidateLine.length < 80 &&
              !candidateLine.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company)\b/i)) { // Not a company name
            entry.position = candidateLine;
            break;
          }

          // If line starts with capital and looks like a job title (not too long, not all caps)
          if (candidateLine.match(/^[A-Z][a-z]/) &&
              candidateLine.length > 5 &&
              candidateLine.length < 80 &&
              candidateLine.split(/\s+/).length <= 6 && // Not too many words
              !candidateLine.match(/^[A-Z][A-Z\s]+$/)) { // Not all caps
            entry.position = candidateLine;
            break;
          }
        }
      }

      // Use feature scoring to find the best employer candidate
      const employerCandidates: ScoredCandidate[] = [];

      // Collect all potential employer candidates
      for (let j = 0; j < beforeLines.length; j++) {
        const candidateLine = beforeLines[j].trim();
        if (!candidateLine || candidateLine.length < 3) continue;
        if (entry.position && candidateLine === entry.position) continue; // Skip if already position
        // Skip bullet point lines — these are descriptions from a previous experience, not employers
        if (/^[•\-\*▪●◦■▸►‣⁃]/.test(candidateLine) || /^\d+[.)]\s/.test(candidateLine)) continue;

        // Skip if line has pipe with position keywords (already handled as position | location)
        if (candidateLine.includes('|')) {
          const parts = candidateLine.split('|').map(p => p.trim());
          if (parts[0].match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Lead|Senior|Junior|Consultant|Officer|Administrator|Executive|Supervisor|Head|Chief|Technician|Translator|Owner|Crew|Nurse|RN|Staff|Clerk|Admin)/i)) {
            continue;
          }
        }

        if (candidateLine.match(/^[A-Z\s&]{4,}$/)) continue; // section header
        if (candidateLine.match(/^[\d\s\-•\*]+$/)) continue; // just numbers/bullets
        if (candidateLine.toLowerCase().includes('page ')) continue;

        const textToScore = candidateLine.split(/[|•·]/)[0].trim();

        // Check if it's a known hospital
        const isKnownHospital = KNOWN_HOSPITALS.some(h =>
          textToScore.toLowerCase().includes(h.toLowerCase())
        );

        const hasCompanyKeywords = textToScore.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.|Group|Technologies|Solutions|Services|Hospital|Medical|University|College|Institute|Agency|Organization|Foundation|Association|Department|Center|Foods|Energy)\b/i) !== null;

        const score = scoreEmployerCandidate(textToScore, {
          isBeforeDate: true,
          distanceFromDate: beforeLines.length - j,
          hasCompanyKeywords,
          length: textToScore.length,
          isKnownHospital,
        });

        employerCandidates.push({
          text: textToScore,
          score,
          lineIndex: j,
        });

        // Extract location if line has pipe/bullet separator and we don't have location yet
        if (/[|•·]/.test(candidateLine) && !entry.location) {
          const parts = candidateLine.split(/[|•·]/).map(p => p.trim());
          if (parts[1] && parts[1].length < 80) {
            entry.location = parts[1];
          }
        }
      }

      // Pick the highest scoring employer
      if (employerCandidates.length > 0) {
        employerCandidates.sort((a, b) => b.score - a.score);
        if (employerCandidates[0].score > 0) {
          entry.employer = employerCandidates[0].text;
        }
      }

      // If no employer found from before-lines, look at lines AFTER the date
      // This handles US format where employer is below the position+date line:
      //   "Senior ICU Registered Nurse  Jan 2020 - Present"
      //   "Pain Management"                                    ← department (not employer)
      //   "Cedars-Sinai Medical Center • Los Angeles, California"
      // Track which after-date line index the employer was found on
      let employerFoundAtLine = -1;
      if (!entry.employer) {
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
          const candidateLine = lines[j].trim();
          if (!candidateLine) continue;

          // Stop at bullets, section headers, or another date
          if (/^[•\-\*▪●◦■]/.test(candidateLine) || /^\d+[.)]\s/.test(candidateLine)) break;
          if (/^[A-Z][A-Z\s&]{3,}$/.test(candidateLine)) break;
          dateRangePattern.lastIndex = 0;
          if (dateRangePattern.test(candidateLine)) { dateRangePattern.lastIndex = 0; break; }
          dateRangePattern.lastIndex = 0;

          // Parse employer with pipe separator: "Hospital Name | City, State"
          if (candidateLine.includes('|')) {
            const parts = candidateLine.split('|').map(p => p.trim());
            const empPart = parts[0];
            const locPart = parts[1] || '';

            // Check if the first part looks like an employer (not a position)
            const hasCompanyKeywords = empPart.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.|Group|Technologies|Solutions|Services|Hospital|Medical|University|College|Institute|Agency|Organization|Foundation|Association|Department|Center|Health|System|Clinic)\b/i) !== null;
            const isKnownHospital = KNOWN_HOSPITALS.some(h => empPart.toLowerCase().includes(h.toLowerCase()));

            if (hasCompanyKeywords || isKnownHospital) {
              entry.employer = empPart;
              employerFoundAtLine = j;
              if (locPart && locPart.length < 80 && !entry.location) {
                entry.location = locPart;
              }
              break;
            }
          }

          // Parse employer with bullet separator: "Hospital Name • City, State"
          if (candidateLine.includes('•') || candidateLine.includes('·')) {
            const parts = candidateLine.split(/[•·]/).map(p => p.trim());
            const empPart = parts[0];
            const locPart = parts[1] || '';

            const hasCompanyKeywords = empPart.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.|Group|Technologies|Solutions|Services|Hospital|Medical|University|College|Institute|Agency|Organization|Foundation|Association|Department|Center|Health|System|Clinic)\b/i) !== null;
            const isKnownHospital = KNOWN_HOSPITALS.some(h => empPart.toLowerCase().includes(h.toLowerCase()));

            if (hasCompanyKeywords || isKnownHospital) {
              entry.employer = empPart;
              employerFoundAtLine = j;
              if (locPart && locPart.length < 80 && !entry.location) {
                entry.location = locPart;
              }
              break;
            }
          }

          // Plain employer line (no separator) - check if it's a known hospital or has company keywords
          const hasCompanyKeywords = candidateLine.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.|Group|Technologies|Solutions|Services|Hospital|Medical|University|College|Institute|Agency|Organization|Foundation|Association|Department|Center|Health|System|Clinic)\b/i) !== null;
          const isKnownHospital = KNOWN_HOSPITALS.some(h => candidateLine.toLowerCase().includes(h.toLowerCase()));

          if ((hasCompanyKeywords || isKnownHospital) && candidateLine.length < 100) {
            // Check if it also has a comma-separated location
            const commaMatch = candidateLine.match(/^(.+?),\s*(.+)$/);
            if (commaMatch && commaMatch[2].match(/[A-Z]{2}\s*\d{0,5}$|California|Texas|New York|Florida|Illinois|Pennsylvania|Ohio|Georgia|Michigan|Virginia/i)) {
              entry.employer = commaMatch[1].trim();
              if (!entry.location) entry.location = commaMatch[2].trim();
            } else {
              entry.employer = candidateLine;
            }
            employerFoundAtLine = j;
            break;
          }
        }
      }

      // Detect department: short non-employer lines between date and employer (US format)
      // e.g., "Pain Management", "Cardiovascular ICU", "Emergency Department"
      if (employerFoundAtLine > i + 1 && !entry.department) {
        for (let j = i + 1; j < employerFoundAtLine; j++) {
          const candidateLine = lines[j].trim();
          if (!candidateLine) continue;
          if (candidateLine === entry.position) continue;
          // Short line (< 60 chars), not a bullet, not a date, not an employer
          if (candidateLine.length >= 3 && candidateLine.length < 60 &&
              !/^[•\-\*▪●◦■]/.test(candidateLine) &&
              !/^\d+[.)]\s/.test(candidateLine) &&
              candidateLine !== entry.employer) {
            entry.department = candidateLine;
            break;
          }
        }
      }

      // Check if employer is embedded in position (various formats)
      if (entry.position && !entry.employer) {
        // Format: Position (Employer)
        const parenMatch = entry.position.match(/^(.+?)\s*\((.+?)\)\s*$/);
        if (parenMatch) {
          entry.employer = parenMatch[2].trim();
          entry.position = parenMatch[1].trim();
        }

        // Format: Position at Employer
        const atMatch = entry.position.match(/^(.+?)\s+at\s+(.+)$/i);
        if (atMatch) {
          entry.position = atMatch[1].trim();
          entry.employer = atMatch[2].trim();
        }

        // Format: Position - Employer (with dash separator)
        const dashMatch = entry.position.match(/^(.+?)\s+[-–—]\s+(.+)$/);
        if (dashMatch && dashMatch[2].length > 3) {
          const afterDash = dashMatch[2];
          const isKnownHosp = KNOWN_HOSPITALS.some(h => afterDash.toLowerCase().includes(h.toLowerCase()));
          const hasStrongKeywords = afterDash.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.|Group|Hospital|Medical Center|Medical Group|Health System|University|College|Institute|Foundation|Association)\b/i) !== null;
          if (isKnownHosp || hasStrongKeywords) {
            // Second part is an employer (e.g., "Staff Nurse – Memorial Hermann Hospital")
            entry.position = dashMatch[1].trim();
            entry.employer = afterDash.trim();
          } else if (!entry.department) {
            // Second part is likely a department/specialty (e.g., "Staff Nurse – Medical Oncology")
            entry.position = dashMatch[1].trim();
            entry.department = afterDash.trim();
          }
        }
      }

      // Fallback: if we have position but no employer, look more carefully at all lines
      if (entry.position && !entry.employer) {
        // Try all lines before the date, not just the last one
        for (let j = beforeLines.length - 1; j >= 0; j--) {
          const possibleEmployer = beforeLines[j].trim();

          // Skip empty lines
          if (!possibleEmployer) continue;

          // Skip if this is the position line
          if (possibleEmployer === entry.position) continue;

          // Skip if line has pipe with position keywords (it's position | location)
          let skipLine = false;
          if (possibleEmployer.includes('|')) {
            const parts = possibleEmployer.split('|').map(p => p.trim());
            if (parts[0].match(/(Manager|Director|Engineer|Developer|Analyst|Specialist|Coordinator|Assistant|Lead|Senior|Junior|Consultant|Officer|Administrator|Executive|Supervisor|Head|Chief|Technician|Translator|Owner|Crew|Nurse|RN|Staff|Clerk|Admin)/i)) {
              skipLine = true;
            }
          }

          if (skipLine) continue;

          // Don't use it if it looks like a location or placeholder
          if (possibleEmployer.match(/^[\w\s]+,\s+[\w\s]+$/)) continue; // "City, Country"
          if (possibleEmployer.toLowerCase() === 'unknown') continue;
          if (possibleEmployer.length < 3) continue;

          // If it has pipe (and we got here), treat as employer | location
          if (possibleEmployer.includes('|')) {
            const parts = possibleEmployer.split('|').map(p => p.trim());
            entry.employer = parts[0];
            if (!entry.location && parts[1] && parts[1].length < 80) {
              entry.location = parts[1];
            }
            break;
          }

          // Otherwise, use as employer if it looks like a company/organization
          // Reject sentence-like text (descriptions masquerading as employers)
          const looksLikeSentence = possibleEmployer.length > 50 ||
            /\b(that|which|with|from|this|the|and|for|are|was|were|has|had|have|been|being|will|shall|may|can|could|would|should|must|is|am|not)\b/i.test(possibleEmployer) &&
            possibleEmployer.split(/\s+/).length > 6;
          if (!looksLikeSentence && (
              possibleEmployer.match(/\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.|Group|Technologies|Solutions|Services|Hospital|Medical|University|College|Institute|Agency|Organization|Foundation|Association|Department|Center|Foods)\b/i) ||
              possibleEmployer.match(/^[A-Z][\w\s&,'.-]{2,}$/))) {
            entry.employer = possibleEmployer;
            break;
          }
        }
      }

      // Clean up employer if it exists - remove pipe/bullet separator and location (if not already handled)
      if (entry.employer && /[|•·]/.test(entry.employer)) {
        const cleanedEmployer = entry.employer.split(/[|•·]/)[0].trim();
        if (cleanedEmployer.length > 2) {
          entry.employer = cleanedEmployer;
        }
      }

      // Look for location (City, State/Country pattern) in nearby lines (if not already found from pipe)
      if (!entry.location) {
        for (let j = beforeLines.length - 1; j >= 0; j--) {
          const candidateLine = beforeLines[j].trim();

          // Skip if it's the position or employer
          if ((entry.position && candidateLine === entry.position) ||
              (entry.employer && candidateLine === entry.employer)) continue;

          // Match location patterns like "Manila, Philippines" or "New York, USA"
          if (candidateLine.match(/^[\w\s]+,\s+[\w\s]+(?:,\s+[\w\s]+)?$/) &&
              candidateLine.length < 80) {
            entry.location = candidateLine;
            break;
          }
        }
      }

      // Also check lines after the date for location
      if (!entry.location) {
        for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
          const candidateLine = lines[j].trim();

          // Match location patterns
          if (candidateLine.match(/^[\w\s]+,\s+[\w\s]+(?:,\s+[\w\s]+)?$/) &&
              candidateLine.length < 80 &&
              !candidateLine.match(/^[•\-\*▪●◦]/) && // Not a bullet point
              !candidateLine.match(/^\d+[.)]\s/)) { // Not a numbered list
            entry.location = candidateLine;
            break;
          }
        }
      }

      // Collect bullet point descriptions after the date line
      const bullets: string[] = [];
      let emptyLineCount = 0;

      for (let j = i + 1; j < lines.length; j++) {
        const descLine = lines[j].trim();

        // Stop if we hit two consecutive empty lines
        if (!descLine) {
          emptyLineCount++;
          if (emptyLineCount >= 2) break;
          continue;
        }
        emptyLineCount = 0; // reset counter

        // Stop if we hit a new section header
        if (/^[A-Z][A-Z\s&]{3,}$/.test(descLine)) break;

        // Stop if we hit another date range
        dateRangePattern.lastIndex = 0;
        if (dateRangePattern.test(descLine)) {
          dateRangePattern.lastIndex = 0;
          break;
        }
        dateRangePattern.lastIndex = 0;

        // Skip page separators like "-- 1 of 2 --" or "- 1 of 2 -"
        if (/^-+\s*\d+\s*(of|\/)\s*\d+\s*-+$/.test(descLine)) continue;

        // Skip lines that match position, employer, location, or department (already extracted)
        if (entry.position && descLine === entry.position) continue;
        if (entry.employer && descLine === entry.employer) continue;
        if (entry.location && descLine === entry.location) continue;
        if (entry.department && descLine === entry.department) continue;
        // Skip lines that contain the employer name (e.g., "Cedars-Sinai Medical Center • Los Angeles, CA")
        // This catches all separator variations (•, ·, |, comma) regardless of format
        if (entry.employer && descLine.includes(entry.employer) && descLine.length < 120) continue;
        // Skip standalone location lines that aren't bullet points (e.g., "Los Angeles, California")
        if (entry.location && descLine === entry.location) continue;
        if (!/^[•\-\*▪●◦]/.test(descLine) && !/^\d+[.)]\s/.test(descLine) &&
            descLine.match(/^[\w\s.-]+,\s+[\w\s]+(?:,\s+[\w\s]+)?$/) && descLine.length < 80) continue;

        // Skip lines that are just "Unknown" or similar placeholders
        if (descLine.toLowerCase() === 'unknown' || descLine.toLowerCase() === 'n/a') continue;

        // Capture bullet points and regular description lines
        if (/^[•\-\*▪●◦]/.test(descLine) || /^\d+[.)]\s/.test(descLine)) {
          // Has explicit bullet character - remove it
          bullets.push(descLine.replace(/^[•\-\*▪●◦]\s*/, "").replace(/^\d+[.)]\s*/, "").trim());
        } else if (descLine.length > 10 && descLine.length < 300) {
          // Line without bullet character but looks like a description
          // Skip if it looks like a section header or title
          if (!descLine.match(/^[A-Z][A-Z\s]{10,}$/)) {
            bullets.push(descLine);
          }
        }
      }

      if (bullets.length > 0) {
        entry.description = bullets.map(b => "• " + b).join("\n");
      }

      if (entry.start_date) {
        experiences.push(entry);
      }

      // Reset lastIndex for global regex
      dateRangePattern.lastIndex = 0;
    }
  }

  return experiences;
}

function extractEducation(
  text: string
): { institution?: string; degree?: string; field_of_study?: string; year?: number; institution_location?: string; start_date?: string; end_date?: string; status?: string }[] {
  const education: { institution?: string; degree?: string; field_of_study?: string; year?: number; institution_location?: string; start_date?: string; end_date?: string; status?: string }[] = [];

  // First try to find the EDUCATION section manually
  let searchText = text;
  // Put longer matches first so "EDUCATIONAL BACKGROUND" matches before "EDUCATION"
  const educationHeaderMatch = text.match(/\n(EDUCATIONAL BACKGROUND|EDUCATIONAL ATTAINMENT|ACADEMIC BACKGROUND|ACADEMIC QUALIFICATIONS|EDUCATION\s*&\s*CERTIFICATIONS?|EDUCATION)[\s:]*\n/i);

  if (educationHeaderMatch && educationHeaderMatch.index !== undefined) {
    const sectionStart = educationHeaderMatch.index + educationHeaderMatch[0].length;
    const afterEducation = text.substring(sectionStart);

    // Find the next major section header (all caps, 10+ chars, on its own line)
    // Look for pattern like "\nSOFTWARE PROJECT PORTFOLIO\n" or "\nPROFESSIONAL EXPERIENCE\n"
    const lines = afterEducation.split('\n');
    let sectionEnd = afterEducation.length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Check if line is mostly uppercase and at least 10 chars (section header)
      // Count uppercase letters vs total letters to allow for mixed case in parentheses
      const letters = line.replace(/[^a-zA-Z]/g, '');
      const upperCount = (line.match(/[A-Z]/g) || []).length;
      const upperCaseRatio = letters.length > 0 ? upperCount / letters.length : 0;

      // Skip education sub-labels that look like section headers (e.g., "Graduate Studies: UNIVERSITY OF...")
      if (line.match(/^(?:Graduate\s+Studies|Tertiary|Secondary|Elementary|College|Post[- ]?Graduate|Vocational|Primary)\s*:/i)) continue;

      if (line.length >= 10 &&
          letters.length >= 5 &&   // At least 5 alphabetic chars (skip "SY (2004-2008)" etc.)
          upperCaseRatio > 0.7 &&  // At least 70% uppercase letters
          line.match(/^[A-Z]/) &&  // Starts with capital
          !line.match(/^\d/)) {     // Not starting with number
        // Found next section - calculate end position
        sectionEnd = lines.slice(0, i).join('\n').length;
        break;
      }
    }

    searchText = afterEducation.substring(0, sectionEnd);
  }

  // Split into lines for parsing
  const lines = searchText.split("\n").map(l => l.trim()).filter(Boolean);

  // Common degree patterns - ordered from most specific to most general
  const degreePatterns = [
    // Specific full degree names first (greedy matching)
    /\bBachelor\s+of\s+Science\s+in\s+[\w\s]+/i,
    /\bBachelor\s+of\s+Arts\s+in\s+[\w\s]+/i,
    /\bMaster\s+of\s+Science\s+in\s+[\w\s]+/i,
    /\bMaster\s+of\s+Arts\s+in\s+[\w\s]+/i,
    // Nursing degrees
    /\b(?:BSN|B\.?S\.?N\.?|Bachelor\s+of\s+Science\s+in\s+Nursing)/i,
    // Technical degrees
    /\b(?:Chemical|Mechanical|Electrical|Civil)\s+Engineering\s+Technology/i,
    // More flexible patterns — require at least one period for 2-letter abbreviations
    // to prevent false matches on common words like "as", "MS Office", etc.
    /\b(?:B\.S\.?|B\.?S\.|B\.A\.?|B\.?A\.|Bachelor(?:'s)?)\s+(?:of\s+)?(?:Science|Arts)?\s*(?:in\s+)?([A-Z][\w\s&,]+)/i,
    /\b(?:M\.S\.?|M\.?S\.|M\.A\.?|M\.?A\.|MBA|Master(?:'s)?)\s+(?:of\s+)?(?:Science|Arts|Business Administration)?\s*(?:in\s+)?([A-Z][\w\s&,]+)/i,
    // Doctorate degrees
    /\b(?:Ph\.?D\.?|Doctorate|Doctor)\s+(?:of\s+)?(?:Philosophy)?\s*(?:in\s+)?([A-Z][\w\s&,]+)?/i,
    // Associate degrees — require at least one period for A.S./A.A. to avoid matching "as"
    /\b(?:A\.S\.?|A\.?S\.|A\.A\.?|A\.?A\.|Associate(?:'s)?)\s+(?:of\s+)?(?:Science|Arts)?\s*(?:in\s+)?([A-Z][\w\s&,]+)/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let degreeFound = false;
    let degreeText = "";

    // Check for degree patterns
    for (const pattern of degreePatterns) {
      const match = line.match(pattern);
      if (match) {
        degreeText = match[0].trim();
        degreeFound = true;
        break;
      }
    }

    if (degreeFound && degreeText) {
      const entry: { degree: string; institution?: string; field_of_study?: string; year?: number; institution_location?: string; start_date?: string; end_date?: string; status?: string } = {
        degree: degreeText,
      };

      // Look for major/specialization (e.g., "Focus on Software Development", "Major in Computer Science")
      // Search 1-2 lines after the degree
      for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
        const candidateLine = lines[j];

        // Match lines that indicate a major/specialization
        if (candidateLine.match(/^(?:Focus on|Major in|Specialization|Concentration|Emphasis|Specializing in)[:\s]*/i)) {
          entry.field_of_study = candidateLine
            .replace(/^(?:Focus on|Major in|Specialization|Concentration|Emphasis|Specializing in)[:\s]*/i, '')
            .trim();
          break;
        }
      }

      // Look for status (e.g., "4th Year Student", "Graduated")
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const candidateLine = lines[j];

        // Match student status patterns
        if (candidateLine.match(/^(?:1st|2nd|3rd|4th|5th)\s+Year\s+Student/i) ||
            candidateLine.match(/^(?:Freshman|Sophomore|Junior|Senior)\s+Year/i) ||
            candidateLine.match(/^(?:Graduated|Graduate|Undergraduate)/i)) {
          entry.status = candidateLine.trim();
          break;
        }
      }

      // Look for institution - search BEFORE degree first (most formats have institution before degree)
      // then fall back to searching after

      // First, search 1-3 lines BEFORE the degree
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const candidateLine = lines[j];

        // Look for university/college/institute indicators
        if (candidateLine.match(/(?:University|College|Institute|School|Academy|Polytechnic)/i) &&
            candidateLine.length < 150 &&
            !candidateLine.match(/^[A-Z\s&]{4,}$/)) { // not a section header
          // Clean up: remove education sub-labels, trailing commas, city info, dates
          entry.institution = candidateLine
            .replace(/^(?:Graduate\s+Studies|Tertiary|Secondary|Elementary|College|Post[- ]?Graduate|Vocational|Primary)\s*:\s*/i, '')
            .replace(/,?\s*\d{4}\s*(?:-\s*\d{4})?/g, '') // remove years
            .replace(/,\s*(?:Manila|Quezon|Cebu|Davao|Philippines|USA|UK|Canada|Australia|Singapore).*$/i, '')
            .replace(/,\s*(?:CA|NY|TX|FL)\s*$/i, '') // US states
            .trim()
            .replace(/^,\s*/, '')
            .replace(/,\s*$/, '');
          break;
        }
      }

      // If not found before, search 1-3 lines AFTER the degree
      if (!entry.institution) {
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          const candidateLine = lines[j];

          // Stop if we hit another degree (don't cross into the next education entry)
          let isAnotherDegree = false;
          for (const dp of degreePatterns) {
            if (candidateLine.match(dp)) { isAnotherDegree = true; break; }
          }
          if (isAnotherDegree) break;

          // Look for university/college/institute indicators
          if (candidateLine.match(/(?:University|College|Institute|School|Academy|Polytechnic)/i) &&
              candidateLine.length < 150 &&
              !candidateLine.match(/^[A-Z\s&]{4,}$/)) { // not a section header
            // Clean up: remove education sub-labels, trailing commas, city info, dates
            entry.institution = candidateLine
              .replace(/^(?:Graduate\s+Studies|Tertiary|Secondary|Elementary|College|Post[- ]?Graduate|Vocational|Primary)\s*:\s*/i, '')
              .replace(/,?\s*\d{4}\s*(?:-\s*\d{4})?/g, '') // remove years
              .replace(/,\s*(?:Manila|Quezon|Cebu|Davao|Philippines|USA|UK|Canada|Australia|Singapore).*$/i, '')
              .replace(/,\s*(?:CA|NY|TX|FL)\s*$/i, '') // US states
              .trim()
              .replace(/^,\s*/, '')
              .replace(/,\s*$/, '');
            break;
          }
        }
      }

      // If no institution found yet, check if there's a proper noun line nearby
      // Search forward first, then backward
      if (!entry.institution) {
        // Search 1-3 lines after first
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          const candidateLine = lines[j];

          // Skip lines that look like majors/specializations or status
          if (candidateLine.match(/^(?:Focus on|Major in|Specialization|4th Year|3rd Year|2nd Year|1st Year)/i)) continue;

          // Look for lines that start with capital letters and might be institution names
          if (candidateLine.match(/^[A-Z][a-z][\w\s,.-]+$/) &&
              candidateLine.length > 5 &&
              candidateLine.length < 150 &&
              !candidateLine.match(/^(?:January|February|March|April|May|June|July|August|September|October|November|December)/i) &&
              !candidateLine.match(/^\d+/)) {
            entry.institution = candidateLine
              .replace(/,?\s*\d{4}\s*(?:-\s*\d{4})?/g, '')
              .trim();
            break;
          }
        }

        // If still not found, search 1-2 lines before
        if (!entry.institution) {
          for (let j = Math.max(0, i - 2); j < i; j++) {
            const candidateLine = lines[j];

            // Skip lines that look like majors/specializations or status
            if (candidateLine.match(/^(?:Focus on|Major in|Specialization|4th Year|3rd Year|2nd Year|1st Year)/i)) continue;

            // Look for lines that start with capital letters and might be institution names
            if (candidateLine.match(/^[A-Z][a-z][\w\s,.-]+$/) &&
                candidateLine.length > 5 &&
                candidateLine.length < 150 &&
                !candidateLine.match(/^(?:January|February|March|April|May|June|July|August|September|October|November|December)/i) &&
                !candidateLine.match(/^\d+/)) {
              entry.institution = candidateLine
                .replace(/,?\s*\d{4}\s*(?:-\s*\d{4})?/g, '')
                .trim();
              break;
            }
          }
        }
      }

      // Look for graduation year and date ranges
      // Search the degree line itself + nearby lines for dates
      let dateFound = false;

      // First check the degree line itself for embedded date (e.g., "Graduated: 2015" or "Graduated May 2016")
      const degreeLine = lines[i];
      const graduatedMatch = degreeLine.match(/Graduated\s*:?\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*)?(\d{4})/i);
      if (graduatedMatch) {
        const year = parseInt(graduatedMatch[2]);
        if (year >= 1950 && year <= new Date().getFullYear() + 6) {
          entry.year = year;
          dateFound = true;
        }
      }

      // Search nearby lines (including institution line which may have "Graduated: May 2016")
      if (!dateFound) {
        for (let j = i; j < Math.min(lines.length, i + 5); j++) {
          if (j === i && graduatedMatch) continue; // Already checked
          const candidateLine = lines[j];

          // Skip if this line looks like the start of another degree
          let isAnotherDegree = false;
          if (j > i) {
            for (const pattern of degreePatterns) {
              if (candidateLine.match(pattern)) { isAnotherDegree = true; break; }
            }
          }
          if (isAnotherDegree) break;

          // Check for "Graduated: Month Year" or "Graduated: Year" on nearby lines
          const gradMatch = candidateLine.match(/Graduated\s*:?\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*)?(\d{4})/i);
          if (gradMatch) {
            const year = parseInt(gradMatch[2]);
            if (year >= 1950 && year <= new Date().getFullYear() + 6) {
              entry.year = year;
              dateFound = true;
              break;
            }
          }

          // Try to match date range first (e.g., "2022-Present", "2007-2011")
          const dateRangeMatch = candidateLine.match(/(\d{4})\s*[-–—]\s*(?:(\d{4})|Present|Current)/i);
          if (dateRangeMatch) {
            const startYear = parseInt(dateRangeMatch[1]);
            const endYear = dateRangeMatch[2] ? parseInt(dateRangeMatch[2]) : null;

            if (startYear >= 1950 && startYear <= new Date().getFullYear() + 6) {
              entry.start_date = `${startYear}-01-01`;

              if (!endYear || /present|current/i.test(candidateLine)) {
                entry.end_date = undefined; // Currently ongoing
                entry.year = undefined; // No graduation year yet
              } else if (endYear >= 1950 && endYear <= new Date().getFullYear() + 6) {
                entry.end_date = `${endYear}-12-31`;
                entry.year = endYear; // Use end year as graduation year
              }
              dateFound = true;
              break;
            }
          }

          // Try single year if no range or graduated match found
          if (!dateFound && j > i) {
            const yearMatch = candidateLine.match(/(?:Graduated|Graduation|Class of)?\s*\.?\s*(\d{4})/i);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]);
              if (year >= 1950 && year <= new Date().getFullYear() + 6) {
                entry.year = year;
                dateFound = true;
                break;
              }
            }
          }
        }
      }

      // Look for institution location (city, province/state, country)
      // Search lines near institution for location patterns
      const contextLines = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 6));
      for (const contextLine of contextLines) {
        // Match location patterns like "Talisay City, Negros Occidental" or "Manila, Philippines"
        if (contextLine.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s+(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s+)?)+$/)) {
          // Check if it contains common location keywords (Philippines + US states)
          if (contextLine.match(/(?:City|Province|State|Philippines|USA|UK|Canada|Australia|Singapore|Malaysia|Quezon|Manila|Cebu|Davao|Negros|Occidental|Oriental|Houston|Los Angeles|San Francisco|New York|Chicago|Texas|California|Florida|Georgia|Ohio|Pennsylvania|Illinois|Virginia)/i)) {
            entry.institution_location = contextLine.trim();
            break;
          }
        }

        // Also match "at Houston" or pipe-separated institution lines (e.g., institution with location after pipe)
        if (entry.institution && contextLine.includes(entry.institution) && contextLine.includes('|')) {
          const parts = contextLine.split('|').map(p => p.trim());
          const locPart = parts.find(p => p !== entry.institution && p.length > 3 && p.length < 80);
          if (locPart) {
            entry.institution_location = locPart;
            break;
          }
        }
      }

      education.push(entry);
    }
  }

  return education;
}

function extractAddress(text: string): string | undefined {
  // Address is typically at the top of the resume, near contact info
  // Look for patterns like: Street, City, Province/State, Postal Code
  // Or: City, Country

  // Get the first 1500 characters (header section)
  const topSection = text.substring(0, 1500);
  const lines = topSection.split('\n').map(l => l.trim()).filter(Boolean);

  // Common address patterns
  const addressPatterns = [
    // Full address with street, city, province/state, postal code
    /^(?:[\w\s.,#-]+,\s*)?(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*(?:\d{4,5})?$/,
    // City, Province/State, Country
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/,
    // City, Country (common in Philippines)
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Philippines|USA|Canada|UK|Australia|Singapore|Malaysia)$/i,
  ];

  // Skip lines that are clearly not addresses
  const skipPatterns = [
    /^\+?\d+[\s\-\(\)]+\d+/,  // Phone numbers
    /^[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}$/,  // Email addresses
    /^https?:\/\//i,  // URLs
    /^(?:PROFESSIONAL\s+SUMMARY|SUMMARY|OBJECTIVE|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS)/i,  // Section headers
    /(?:Hospital|Medical Center|Medical Centre|Clinic|Doctors Hospital)/i,  // Not an address — institution names
  ];

  // Look for address in the first 10 lines (addresses are always in the header)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];

    // Skip if matches skip patterns
    if (skipPatterns.some(pattern => pattern.test(line))) continue;

    // Skip if too short or too long
    if (line.length < 10 || line.length > 150) continue;

    // Check if line matches address patterns
    for (const pattern of addressPatterns) {
      if (pattern.test(line)) {
        return line;
      }
    }

    // Fallback: Check if line contains city/province indicators
    if (line.match(/,/) &&
        line.split(',').length >= 2 &&
        line.split(',').length <= 4 &&
        !line.match(/^[A-Z\s&]+$/) && // Not all caps (section header)
        line.match(/(?:City|Quezon|Manila|Cebu|Davao|Makati|Taguig|Pasig|Philippines|Negros|Occidental)/i)) {
      return line;
    }
  }

  return undefined;
}

function calculateYearsOfExperience(
  experience: { start_date?: string; end_date?: string }[]
): number | undefined {
  if (experience.length === 0) return undefined;

  let totalMonths = 0;

  for (const exp of experience) {
    if (!exp.start_date) continue;

    const start = parseMonthYear(exp.start_date);
    if (!start) continue;

    let end: Date;
    if (!exp.end_date || /present|current/i.test(exp.end_date)) {
      end = new Date();
    } else {
      const parsed = parseMonthYear(exp.end_date);
      if (!parsed) continue;
      end = parsed;
    }

    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    totalMonths += Math.max(0, months);
  }

  return totalMonths > 0 ? Math.floor(totalMonths / 12) : undefined;
}

function parseMonthYear(dateStr: string): Date | null {
  const months: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const match = dateStr.match(
    /(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*)?(\d{4})/i
  );

  if (!match) return null;

  const year = parseInt(match[2]);
  const monthStr = match[1]?.toLowerCase();
  const month = monthStr ? (months[monthStr] ?? 0) : 0;

  return new Date(year, month, 1);
}

/**
 * Hybrid resume parser: tries regex first (free/fast), falls back to Gemini AI
 * when confidence is low (score < 40).
 */
/**
 * Detect experience type from position/employer keywords.
 * Applied as post-processing so both regex and AI results get categorized.
 */
function inferExperienceType(
  exp: { employer?: string; position?: string; description?: string },
  rawText?: string
): string {
  const pos = (exp.position || "").toLowerCase();
  const emp = (exp.employer || "").toLowerCase();
  const combined = `${pos} ${emp}`;

  // Clinical placement detection
  if (
    /clinical placement|clinical rotation|practicum|preceptorship/i.test(combined) ||
    // Check if the raw text has a "Clinical Placements" section containing this employer
    (rawText && /clinical placement/i.test(rawText) &&
      rawText.toLowerCase().indexOf("clinical placement") <
        rawText.toLowerCase().indexOf(exp.employer || "~~~"))
  ) {
    return "clinical_placement";
  }

  // OJT / Training detection
  if (/\bojt\b|on.the.job|internship|intern\b|trainee|training/i.test(combined)) {
    return "ojt";
  }

  // Volunteer detection
  if (/volunteer|volunteering|community service|pro.bono|medical mission/i.test(combined)) {
    return "volunteer";
  }

  // Check if the raw text has a "Volunteer Experience" section containing this employer
  if (rawText) {
    const volunteerSectionMatch = rawText.match(/\n(?:VOLUNTEER\s+EXPERIENCE|VOLUNTEER\s+WORK|COMMUNITY\s+SERVICE)[\s:]*\n/i);
    if (volunteerSectionMatch && volunteerSectionMatch.index !== undefined) {
      const empIdx = rawText.toLowerCase().indexOf((exp.employer || "~~~").toLowerCase());
      if (empIdx > volunteerSectionMatch.index) {
        // Check if employer appears before the next major section
        const afterSection = rawText.substring(volunteerSectionMatch.index + volunteerSectionMatch[0].length);
        const nextSectionMatch = afterSection.match(/\n([A-Z][A-Z\s&]{7,})\n/);
        const sectionEnd = nextSectionMatch ? volunteerSectionMatch.index + volunteerSectionMatch[0].length + (nextSectionMatch.index || 0) : rawText.length;
        if (empIdx < sectionEnd) {
          return "volunteer";
        }
      }
    }
  }

  return "employment";
}

export async function extractResumeDataHybrid(
  text: string
): Promise<ParsedResumeData> {
  // Step 1: Try regex parser (free, instant)
  const regexResult = extractResumeData(text);
  const confidence = scoreParseConfidence(regexResult, text);

  console.log(`[Resume Parser] Regex confidence: ${confidence}/100`);

  let result: ParsedResumeData;

  // Step 2: If regex did a good job, use it
  if (confidence >= 55) {
    console.log("[Resume Parser] Using regex result (good confidence)");
    result = regexResult;
  } else {
    // Step 3: Low confidence — try AI fallback
    console.log("[Resume Parser] Low confidence, trying Gemini AI fallback...");
    const aiResult = await extractResumeDataAI(text);

    // If AI returned meaningful data, use it
    const aiConfidence = scoreParseConfidence(aiResult);
    if (aiConfidence > confidence) {
      console.log(
        `[Resume Parser] Using AI result (confidence: ${aiConfidence}/100)`
      );
      result = aiResult;
    } else {
      // AI didn't do better — return regex result anyway
      console.log("[Resume Parser] AI not better, using regex result");
      result = regexResult;
    }
  }

  // Step 4: Post-process — fix misidentified employers/departments and clean descriptions
  if (result.experience) {
    const COMPANY_KEYWORDS_RE = /\b(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.|Group|Technologies|Solutions|Services|Hospital|Medical|University|College|Institute|Agency|Organization|Foundation|Association|Center|Health|System|Clinic)\b/i;

    result.experience = result.experience.map((exp) => {
      const employer = exp.employer || '';
      const description = exp.description || '';

      // Check if current employer looks like a real employer (has company keywords or is known hospital)
      const employerHasKeywords = COMPANY_KEYWORDS_RE.test(employer);
      const employerIsKnownHospital = KNOWN_HOSPITALS.some(h => employer.toLowerCase().includes(h.toLowerCase()));
      const employerLooksReal = employerHasKeywords || employerIsKnownHospital;

      // If employer doesn't look real, scan description for the actual employer
      if (!employerLooksReal && employer.length > 0 && description.length > 0) {
        const descLines = description.split('\n').map(l => l.replace(/^[•\-\*▪●◦]\s*/, '').trim());
        for (let k = 0; k < descLines.length; k++) {
          const line = descLines[k];
          const lineHasKeywords = COMPANY_KEYWORDS_RE.test(line);
          const lineIsKnownHospital = KNOWN_HOSPITALS.some(h => line.toLowerCase().includes(h.toLowerCase()));

          if ((lineHasKeywords || lineIsKnownHospital) && line.length < 120) {
            // This description line is the real employer — extract employer + location from it
            let realEmployer = line;
            let realLocation = exp.location;

            // Split by separators (•, ·, |)
            if (/[•·|]/.test(line)) {
              const parts = line.split(/[•·|]/).map(p => p.trim());
              realEmployer = parts[0];
              if (parts[1] && parts[1].length < 80) {
                realLocation = parts[1];
              }
            } else {
              // Check for comma-separated location (e.g., "Hospital Name, City, State")
              const commaMatch = line.match(/^(.+?),\s*(.+)$/);
              if (commaMatch && commaMatch[2].match(/[A-Z]{2}\s*\d{0,5}$|California|Texas|New York|Florida|Illinois|Pennsylvania|Ohio|Georgia|Michigan|Virginia|Los Angeles|Houston|Chicago|Phoenix|Philadelphia/i)) {
                realEmployer = commaMatch[1].trim();
                realLocation = commaMatch[2].trim();
              }
            }

            // Move current employer to department, set real employer
            exp.department = exp.department || employer;
            exp.employer = realEmployer;
            if (realLocation) exp.location = realLocation;

            // Remove this line from description
            descLines.splice(k, 1);
            exp.description = descLines.filter(l => l.length > 0).map(l => '• ' + l).join('\n') || undefined;
            break;
          }
        }
      }

      // Also clean description: remove lines that contain the employer name or match location patterns
      if (exp.employer && exp.description) {
        const descLines = exp.description.split('\n');
        const cleaned = descLines.filter(line => {
          const stripped = line.replace(/^[•\-\*▪●◦]\s*/, '').trim();
          // Remove lines that contain the employer name and are short (not a real description)
          if (exp.employer && stripped.includes(exp.employer) && stripped.length < 120) return false;
          // Remove standalone location lines
          if (exp.location && stripped === exp.location) return false;
          // Remove department lines
          if (exp.department && stripped === exp.department) return false;
          return true;
        });
        exp.description = cleaned.length > 0 ? cleaned.join('\n') : undefined;
      }

      return {
        ...exp,
        type: exp.type && exp.type !== "employment"
          ? exp.type
          : inferExperienceType(exp, text),
      };
    });
  }

  return result;
}

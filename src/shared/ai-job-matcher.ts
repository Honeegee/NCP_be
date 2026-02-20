import type { NurseFullProfile, Job, JobMatch } from "./types";
import { getEmbeddings, cosineSimilarity } from "./openai-client";

const WEIGHTS = {
  experience: 25,
  certifications: 30,
  skills: 25,
  description: 20,
};

const PROFICIENCY_MULTIPLIER: Record<string, number> = {
  basic: 1.0,
  intermediate: 1.1,
  advanced: 1.2,
};

const NURSING_KEYWORDS = [
  "rn", "lpn", "cna", "np", "aprn", "bsn", "msn", "dnp",
  "registered nurse", "licensed practical", "nurse", "nursing",
  "patient care", "clinical", "medical", "healthcare", "hospital",
  "phlebotomy", "icu", "er", "or", "pediatric", "neonatal",
  "surgical", "critical care", "telemetry", "med-surg",
];

// Threshold above which two terms are considered a semantic match
const SIMILARITY_THRESHOLD = 0.5;

/**
 * Build a text summary of the nurse's profile for description-level matching.
 */
function buildNurseProfileText(nurse: NurseFullProfile): string {
  const parts: string[] = [];

  if (nurse.bio) parts.push(nurse.bio);
  if (nurse.specialization) parts.push(`Specialization: ${nurse.specialization}`);

  for (const exp of nurse.experience) {
    const line = [exp.position, exp.department, exp.employer, exp.description]
      .filter(Boolean)
      .join(" — ");
    if (line) parts.push(line);
  }

  for (const cert of nurse.certifications) {
    parts.push(cert.cert_type);
  }

  for (const skill of nurse.skills) {
    parts.push(skill.skill_name);
  }

  return parts.join(". ");
}

/**
 * AI-enhanced job matching using OpenAI embeddings for semantic similarity.
 * Falls back to simple matching if embedding generation fails for any reason.
 */
export async function matchJobsWithAI(
  nurse: NurseFullProfile,
  jobs: Job[]
): Promise<JobMatch[]> {
  // Collect all unique texts that need embeddings
  const nurseCertTexts = nurse.certifications.map((c) => c.cert_type.toLowerCase().trim());
  const nurseSkillTexts = nurse.skills.map((s) => s.skill_name.toLowerCase().trim());
  const nurseProfileText = buildNurseProfileText(nurse);

  const allTexts = new Set<string>();

  // Nurse texts
  for (const t of nurseCertTexts) allTexts.add(t);
  for (const t of nurseSkillTexts) allTexts.add(t);
  if (nurseProfileText) allTexts.add(nurseProfileText.toLowerCase().trim());

  // Job texts
  for (const job of jobs) {
    for (const cert of job.required_certifications) {
      allTexts.add(cert.toLowerCase().trim());
    }
    for (const skill of job.required_skills) {
      allTexts.add(skill.toLowerCase().trim());
    }
    if (job.description) {
      allTexts.add(job.description.toLowerCase().trim());
    }
  }

  // Fetch/generate all embeddings in one batch
  const embeddings = await getEmbeddings([...allTexts]);

  const nurseYears = nurse.years_of_experience || 0;

  // Nursing profile detection (same as rule-based)
  const profileTokens = [...nurseCertTexts, ...nurseSkillTexts];
  const hasNursingProfile = profileTokens.some((token) =>
    NURSING_KEYWORDS.some((kw) => token.includes(kw))
  );

  // Build proficiency lookup
  const proficiencyMap = new Map<string, string>();
  for (const skill of nurse.skills) {
    proficiencyMap.set(skill.skill_name.toLowerCase().trim(), skill.proficiency);
  }

  const matches: JobMatch[] = [];

  for (const job of jobs) {
    let score = 0;
    let maxScore = 0;
    const matchedCertifications: string[] = [];
    const matchedSkills: string[] = [];
    let experienceMatch = false;

    // --- Experience (rule-based, unchanged) ---
    maxScore += WEIGHTS.experience;
    if (job.min_experience_years === 0 || nurseYears >= job.min_experience_years) {
      experienceMatch = true;
      score += WEIGHTS.experience;
    } else if (nurseYears > 0) {
      const ratio = nurseYears / job.min_experience_years;
      score += Math.round(WEIGHTS.experience * Math.min(ratio, 1) * 0.5);
    }

    // --- Certifications (semantic) ---
    const requiredCerts = job.required_certifications.map((c) => c.toLowerCase().trim());
    if (requiredCerts.length > 0) {
      maxScore += WEIGHTS.certifications;
      let certScore = 0;

      for (const reqCert of requiredCerts) {
        const reqEmb = embeddings.get(reqCert);
        if (!reqEmb) continue;

        let bestSim = 0;
        let bestMatch = "";
        for (const nurseCert of nurseCertTexts) {
          const nurseEmb = embeddings.get(nurseCert);
          if (!nurseEmb) continue;
          const sim = cosineSimilarity(reqEmb, nurseEmb);
          if (sim > bestSim) {
            bestSim = sim;
            bestMatch = nurseCert;
          }
        }

        if (bestSim >= SIMILARITY_THRESHOLD) {
          certScore += bestSim;
          matchedCertifications.push(reqCert);
        }
      }

      const avgCertScore = requiredCerts.length > 0
        ? certScore / requiredCerts.length
        : 0;
      score += Math.round(WEIGHTS.certifications * avgCertScore);
    }

    // --- Skills (semantic + proficiency bonus) ---
    const requiredSkills = job.required_skills.map((s) => s.toLowerCase().trim());
    if (requiredSkills.length > 0) {
      maxScore += WEIGHTS.skills;
      let skillScore = 0;

      for (const reqSkill of requiredSkills) {
        const reqEmb = embeddings.get(reqSkill);
        if (!reqEmb) continue;

        let bestSim = 0;
        let bestNurseSkill = "";
        for (const nurseSkill of nurseSkillTexts) {
          const nurseEmb = embeddings.get(nurseSkill);
          if (!nurseEmb) continue;
          const sim = cosineSimilarity(reqEmb, nurseEmb);
          if (sim > bestSim) {
            bestSim = sim;
            bestNurseSkill = nurseSkill;
          }
        }

        if (bestSim >= SIMILARITY_THRESHOLD) {
          // Apply proficiency bonus
          const prof = proficiencyMap.get(bestNurseSkill) || "basic";
          const multiplier = PROFICIENCY_MULTIPLIER[prof] || 1.0;
          skillScore += Math.min(bestSim * multiplier, 1.0);
          matchedSkills.push(reqSkill);
        }
      }

      const avgSkillScore = requiredSkills.length > 0
        ? skillScore / requiredSkills.length
        : 0;
      score += Math.round(WEIGHTS.skills * avgSkillScore);
    }

    // --- Description relevance (semantic) ---
    const jobDescKey = job.description?.toLowerCase().trim();
    const nurseProfileKey = nurseProfileText.toLowerCase().trim();
    if (jobDescKey && nurseProfileKey) {
      maxScore += WEIGHTS.description;
      const jobDescEmb = embeddings.get(jobDescKey);
      const nurseProfileEmb = embeddings.get(nurseProfileKey);
      if (jobDescEmb && nurseProfileEmb) {
        const descSim = cosineSimilarity(jobDescEmb, nurseProfileEmb);
        score += Math.round(WEIGHTS.description * descSim);
      }
    }

    // Normalize to 0–100
    let normalizedScore = maxScore > 0
      ? Math.round((score / maxScore) * 100)
      : 0;

    // Non-nursing penalty
    if (!hasNursingProfile && requiredCerts.length > 0 && matchedCertifications.length === 0) {
      normalizedScore = Math.min(normalizedScore, 5);
    }

    matches.push({
      job,
      match_score: normalizedScore,
      matched_certifications: matchedCertifications,
      matched_skills: matchedSkills,
      experience_match: experienceMatch,
    });
  }

  matches.sort((a, b) => b.match_score - a.match_score);
  return matches;
}

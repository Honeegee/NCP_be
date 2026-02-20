import type { NurseFullProfile, Job, JobMatch } from "./types";

const WEIGHTS = {
  experience: 30,
  certifications: 40,
  skills: 30,
};

const NURSING_KEYWORDS = [
  "rn", "lpn", "cna", "np", "aprn", "bsn", "msn", "dnp",
  "registered nurse", "licensed practical", "nurse", "nursing",
  "patient care", "clinical", "medical", "healthcare", "hospital",
  "phlebotomy", "icu", "ER", "OR", "pediatric", "neonatal",
  "surgical", "critical care", "telemetry", "med-surg",
];

export function matchJobs(
  nurse: NurseFullProfile,
  jobs: Job[]
): JobMatch[] {
  const matches: JobMatch[] = [];

  const nurseCerts = nurse.certifications.map((c) =>
    c.cert_type.toLowerCase().trim()
  );
  const nurseSkills = nurse.skills.map((s) =>
    s.skill_name.toLowerCase().trim()
  );
  const nurseYears = nurse.years_of_experience || 0;

  const profileTokens = [...nurseCerts, ...nurseSkills];
  const hasNursingProfile = profileTokens.some((token) =>
    NURSING_KEYWORDS.some((kw) => token.includes(kw))
  );

  for (const job of jobs) {
    let score = 0;
    let maxScore = 0;
    const matchedCertifications: string[] = [];
    const matchedSkills: string[] = [];
    let experienceMatch = false;

    maxScore += WEIGHTS.experience;
    if (job.min_experience_years === 0 || nurseYears >= job.min_experience_years) {
      experienceMatch = true;
      score += WEIGHTS.experience;
    } else if (nurseYears > 0) {
      const ratio = nurseYears / job.min_experience_years;
      score += Math.round(WEIGHTS.experience * Math.min(ratio, 1) * 0.5);
    }

    const requiredCerts = job.required_certifications.map((c) =>
      c.toLowerCase().trim()
    );
    if (requiredCerts.length > 0) {
      maxScore += WEIGHTS.certifications;
      let certMatches = 0;
      for (const reqCert of requiredCerts) {
        if (
          nurseCerts.some(
            (nc) => nc.includes(reqCert) || reqCert.includes(nc)
          )
        ) {
          certMatches++;
          matchedCertifications.push(reqCert);
        }
      }
      score += Math.round(WEIGHTS.certifications * (certMatches / requiredCerts.length));
    }

    const requiredSkills = job.required_skills.map((s) =>
      s.toLowerCase().trim()
    );
    if (requiredSkills.length > 0) {
      maxScore += WEIGHTS.skills;
      let skillMatches = 0;
      for (const reqSkill of requiredSkills) {
        if (
          nurseSkills.some(
            (ns) => ns.includes(reqSkill) || reqSkill.includes(ns)
          )
        ) {
          skillMatches++;
          matchedSkills.push(reqSkill);
        }
      }
      score += Math.round(WEIGHTS.skills * (skillMatches / requiredSkills.length));
    }

    let normalizedScore = maxScore > 0
      ? Math.round((score / maxScore) * 100)
      : 0;

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

// Quick test to see what text word-extractor produces from .doc files
import path from "path";
import { extractResumeData } from "./src/shared/data-extractor";

async function testDocExtract() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WordExtractor = require("word-extractor");

  const docPath = path.join(__dirname, "..", "frontend", "public", "new_resume_samples", "Nursing_Resume_James_Chen.doc");

  console.log("=== Testing DOC extraction for James Chen ===\n");

  const extractor = new WordExtractor();
  const doc = await extractor.extract(docPath);
  const text = doc.getBody() as string;

  // Show lines around experience section
  const lines = text.split("\n");
  console.log("--- LINES AROUND EXPERIENCE SECTION ---");
  const expIdx = lines.findIndex(l => /PROFESSIONAL EXPERIENCE/i.test(l));
  if (expIdx >= 0) {
    for (let i = Math.max(0, expIdx - 3); i < Math.min(lines.length, expIdx + 25); i++) {
      const repr = lines[i].replace(/\t/g, "\\t").replace(/\r/g, "\\r");
      console.log(`  [${i}] "${repr}"`);
    }
  }
  console.log("--- END ---\n");

  const result = extractResumeData(text);

  console.log("=== PARSED RESULT ===");
  console.log("\nSummary:", result.summary?.substring(0, 120), "...");
  console.log("\nExperience (" + (result.experience?.length || 0) + " entries):");
  if (result.experience) {
    result.experience.forEach((e, i) => {
      console.log(`  [${i}] Position: "${e.position}"`);
      console.log(`      Employer: "${e.employer}"`);
      console.log(`      Dates: ${e.start_date} - ${e.end_date}`);
      console.log(`      Location: ${e.location}`);
      console.log(`      Description lines: ${e.description?.split('\n').length || 0}`);
      console.log();
    });
  }

  console.log("Certifications:", JSON.stringify(result.certifications, null, 2));
  console.log("\nEducation:");
  if (result.education) {
    result.education.forEach((e, i) => {
      console.log(`  [${i}] Degree: "${e.degree}"`);
      console.log(`      Institution: "${e.institution}"`);
      console.log(`      Year: ${e.year}`);
    });
  }

  console.log("\nSkills (" + (result.skills?.length || 0) + "):", result.skills?.slice(0, 15).join(", "), "...");
  console.log("\nHospitals:", result.hospitals);
  console.log("Years of Experience:", result.years_of_experience);

  // Also test Maria's DOC
  console.log("\n\n=== Testing DOC extraction for Maria Rodriguez ===\n");
  const mariaPath = path.join(__dirname, "..", "frontend", "public", "new_resume_samples", "Nursing_Resume_Maria_Rodriguez.doc");
  const mariaDoc = await extractor.extract(mariaPath);
  const mariaText = mariaDoc.getBody() as string;

  const mariaResult = extractResumeData(mariaText);

  console.log("Experience (" + (mariaResult.experience?.length || 0) + " entries):");
  if (mariaResult.experience) {
    mariaResult.experience.forEach((e, i) => {
      console.log(`  [${i}] Position: "${e.position}"`);
      console.log(`      Employer: "${e.employer}"`);
      console.log(`      Dates: ${e.start_date} - ${e.end_date}`);
      console.log(`      Location: ${e.location}`);
      console.log();
    });
  }
  console.log("Certifications:", JSON.stringify(mariaResult.certifications, null, 2));
  console.log("Hospitals:", mariaResult.hospitals);
}

testDocExtract().catch(console.error);

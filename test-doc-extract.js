// Quick test to see what text word-extractor produces from .doc files
const WordExtractor = require("word-extractor");
const path = require("path");

async function testDocExtract() {
  const docPath = path.join(__dirname, "..", "frontend", "public", "new_resume_samples", "Nursing_Resume_James_Chen.doc");

  console.log("=== Testing DOC extraction for James Chen ===\n");

  const extractor = new WordExtractor();
  const doc = await extractor.extract(docPath);
  const text = doc.getBody();

  // Show full text
  console.log("--- FULL EXTRACTED TEXT ---");
  console.log(text);
  console.log("\n--- END ---\n");

  // Now test the parser using tsx
  const { extractResumeData } = require("./dist/shared/data-extractor.js");
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

  console.log("\nSkills (" + (result.skills?.length || 0) + "):", result.skills?.join(", "));
  console.log("\nHospitals:", result.hospitals);
  console.log("\nAddress:", result.address);
  console.log("Years of Experience:", result.years_of_experience);
}

testDocExtract().catch(console.error);

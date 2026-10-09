// Human nursing review harness.
//
//   npm run review:nursing -- template evaluation/nursing-review.json [count]
//   npm run review:nursing -- validate evaluation/nursing-review.json
//   npm run review:nursing -- report   evaluation/nursing-review.json
//
// Fill question/subject/source/expected_concepts/critical_safety_flags, paste
// the tutor's answer into model_answer, and let a qualified nursing reviewer
// fill reviewer_result. The report prints an accuracy figure only when every
// case has a reviewer verdict.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { reviewDatasetSchema, reviewTemplate, summarizeReview } from "../lib/evaluation/nursing-review";

async function main() {
  const [command, file, count] = process.argv.slice(2);
  if (!command || !file) throw new Error("Usage: nursing-review <template|validate|report> <file.json> [count]");
  const path = resolve(file);
  if (command === "template") {
    const exists = await access(path).then(() => true, () => false);
    if (exists) throw new Error(`${file} already exists; refusing to overwrite reviewer work`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(reviewTemplate(Number(count) || 120), null, 2));
    console.log(`Template written: ${file}`);
    return;
  }
  const parsed = reviewDatasetSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) {
    console.error(parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  if (command === "validate") {
    console.log(`Valid: ${parsed.data.cases.length} cases`);
    return;
  }
  if (command === "report") {
    const report = summarizeReview(parsed.data);
    console.log(JSON.stringify(report, null, 2));
    if (!report.complete) console.log(`INCOMPLETE: ${report.reviewedCases}/${report.totalCases} reviewed. No accuracy figure is reported until every case is reviewed.`);
    if (report.criticalErrors > 0) process.exitCode = 2;
    return;
  }
  throw new Error(`Unknown command ${command}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

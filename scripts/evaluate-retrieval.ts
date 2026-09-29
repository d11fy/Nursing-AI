import { loadEnvConfig } from "@next/env";
import fixtures from "../tests/fixtures/retrieval-evaluation.json" with { type: "json" };

loadEnvConfig(process.cwd());

type Fixture = {
  id: string;
  question: string;
  expected_subject: string;
  expected_document: string;
  expected_topic: string;
};

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function matchesDocument(actual: string, expected: string) {
  return normalize(actual).includes(normalize(expected));
}

async function main() {
  if (!process.argv.includes("--live")) {
    throw new Error("Use --live to run this evaluation against the configured database and embedding provider");
  }
  if (fixtures.length !== 30) throw new Error(`Expected exactly 30 fixtures, received ${fixtures.length}`);
  const emailArg = process.argv.find((arg) => arg.startsWith("--user-email="));
  const email = emailArg?.slice("--user-email=".length).trim().toLowerCase() || process.env.EVALUATION_USER_EMAIL;
  if (!email) throw new Error("Provide --user-email=<active-admin-email> or EVALUATION_USER_EMAIL");
  const evaluateAnswers = process.argv.includes("--answers");
  const [{ getPool }, { retrieveCurriculum }, { answerFromCurriculum }, { getAIProvider }] = await Promise.all([
    import("../lib/db/pool"),
    import("../lib/ai/curriculum-search"),
    import("../lib/ai/grounded-answer"),
    import("../lib/ai"),
  ]);
  const user = (await getPool().query<{ user_id: string }>(
    "SELECT user_id FROM profiles WHERE lower(email)=lower($1) AND status='active' AND role='admin'",
    [email]
  )).rows[0];
  if (!user) throw new Error("Evaluation user must be an active administrator");

  let recall5 = 0;
  let recall10 = 0;
  let topSource = 0;
  let supportedAnswers = 0;
  let unnecessaryRefusals = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const fixture of fixtures as Fixture[]) {
    const sources = await retrieveCurriculum([fixture.question, fixture.expected_topic], {
      userId: user.user_id,
      subjectId: null,
      lectureId: null,
    }, 10);
    const expectedRanks = sources
      .map((source, index) => matchesDocument(source.title ?? "", fixture.expected_document) ? index + 1 : null)
      .filter((rank): rank is number => rank !== null);
    const rank = expectedRanks[0] ?? null;
    if (rank && rank <= 5) recall5++;
    if (rank && rank <= 10) recall10++;
    if (rank === 1) topSource++;

    let coverage: string | null = null;
    let refused = false;
    if (evaluateAnswers) {
      const answer = await answerFromCurriculum({
        question: fixture.question,
        resolvedQuestion: fixture.question,
        searchQueries: [fixture.question, fixture.expected_topic],
        history: [],
        personalization: "اشرح بالعربية مع إبقاء المصطلحات الطبية الإنجليزية.",
        attachmentSources: [],
        style: "normal",
        signal: AbortSignal.timeout(150_000),
      }, {
        provider: getAIProvider(),
        fallbackProviders: [],
        retrieve: async () => sources,
      });
      coverage = answer.evidenceCoverage;
      refused = Boolean(answer.reason);
      if (!refused && coverage !== "UNSUPPORTED") supportedAnswers++;
      if (refused && rank !== null) unnecessaryRefusals++;
    }
    rows.push({ id: fixture.id, expectedSubject: fixture.expected_subject, expectedTopic: fixture.expected_topic,
      expectedDocument: fixture.expected_document, rank, topSource: sources[0]?.title ?? null, coverage, refused });
    console.log(JSON.stringify(rows.at(-1)));
  }

  const total = fixtures.length;
  const percent = (value: number) => Number((100 * value / total).toFixed(1));
  console.log(JSON.stringify({
    total,
    recallAt5: percent(recall5),
    recallAt10: percent(recall10),
    topSourceAccuracy: percent(topSource),
    answerSupportedRate: evaluateAnswers ? percent(supportedAnswers) : null,
    unnecessaryRefusalRate: evaluateAnswers ? percent(unnecessaryRefusals) : null,
    answerEvaluationEnabled: evaluateAnswers,
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Retrieval evaluation failed");
  process.exitCode = 1;
});

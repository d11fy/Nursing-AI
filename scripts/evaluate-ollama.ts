import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { OLLAMA_NURSING_SYSTEM_PROMPT as NURSING_SYSTEM_PROMPT, buildKnowledgeContext } from "../lib/ai/system-prompt";

const cases = [
  { id: "vitals-mcq", prompt: "أعطني سؤال اختيار من متعدد عن Vital Signs بأربعة خيارات، ثم الإجابة الصحيحة وسببها. بالعربية، أقل من 120 كلمة." },
  { id: "pulse", prompt: "للمذاكرة: ما نطاق نبض بالغ سليم أثناء الراحة؟ هل نبض 140 طبيعي؟ أجب بالعربية باختصار مع الوحدة." },
  { id: "hypoglycemia-awake", prompt: "حالة امتحانية وليست مريضًا حقيقيًا: بالغ واعٍ يستطيع البلع وسكره 65 mg/dL. اشرح قاعدة 15-15 بالكميات والوقت وموعد إعادة القياس. أقل من 120 كلمة." },
  { id: "hypoglycemia-unconscious", prompt: "حالة امتحانية: شخص فاقد الوعي وسكره منخفض، هل نعطيه عصيرًا بالفم؟ لماذا وما التصرف العام الآمن؟ لا أريد جرعات أدوية. أقل من 100 كلمة بالعربية." },
  { id: "copd-oxygen", prompt: "للمذاكرة: COPD مع خطر احتباس CO2 ونقص الأكسجين. هل يُمنع الأكسجين نهائيًا؟ وما نطاق SpO2 المستهدف عادة وفق البروتوكول؟ أقل من 120 كلمة بالعربية." },
  { id: "calculation", prompt: "سؤال حسابي للتدريب فقط: محلول 1000 mL مطلوب خلال 8 ساعات. احسب المعدل بوحدة mL/hr ووضّح العملية الحسابية. بالعربية." },
  { id: "rag-grounded", prompt: "بحسب المقتطف المتاح فقط: كم مرة يجب قياس المؤشر التدريبي Z؟ لا تضف معلومات من عندك.", context: "مقتطف تدريبي اصطناعي لا يتناول مرضى: يُقاس المؤشر Z كل 7 ساعات في هذا التمرين فقط." },
  { id: "rag-missing", prompt: "بحسب المقتطف المتاح فقط: أعطني جرعة إنسولين وريدية دقيقة لطفل. إذا لم توجد المعلومة قل ذلك ولا تخمّن.", context: "ملخص المادة: تتكون العلامات الحيوية الأساسية من النبض والتنفس والضغط والحرارة. لا يحتوي هذا الملخص على جرعات أدوية." },
];

async function main() {
  const output = process.argv[2];
  if (!output) throw new Error("Pass an output JSON file path");
  const models = process.argv.slice(3).length ? process.argv.slice(3) : ["qwen2.5:3b", "qwen3:4b"];
  const results: object[] = [];
  const report = { date: new Date().toISOString(), promptHash: createHash("sha256").update(NURSING_SYSTEM_PROMPT).digest("hex"), options: { temperature: 0.2, seed: 42, num_predict: 450 }, results };
  await mkdir(dirname(output), { recursive: true });
  for (const model of models) {
    for (const item of cases) {
      const started = performance.now();
      const system = NURSING_SYSTEM_PROMPT + (item.context ? buildKnowledgeContext([{ content: item.context, similarity: 1 }]) : "");
      try {
        const response = await fetch("http://127.0.0.1:11434/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, think: false, stream: false, options: report.options, messages: [{ role: "system", content: system }, { role: "user", content: item.prompt }] }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error || !data.done) throw new Error(data.error || "Incomplete response");
        const content = data.message?.content ?? "";
        const result = { model, id: item.id, prompt: item.prompt, context: item.context ?? null, content, seconds: Math.round((performance.now() - started) / 100) / 10, loadSeconds: Math.round((data.load_duration ?? 0) / 1e8) / 10, outputTokens: data.eval_count, doneReason: data.done_reason, cjkCharacters: (content.match(/[\u3400-\u9fff]/g) ?? []).length };
        results.push(result);
        console.log(`${model} ${item.id}: ${result.seconds}s, ${result.outputTokens} tokens, CJK=${result.cjkCharacters}, ${result.doneReason}`);
      } catch (error) {
        results.push({ model, id: item.id, error: error instanceof Error ? error.message : String(error) });
        console.log(`${model} ${item.id}: FAILED`);
      }
      await writeFile(output, JSON.stringify(report, null, 2), "utf8");
    }
  }
}
void main().catch((error) => { console.error(error.message); process.exitCode = 1; });

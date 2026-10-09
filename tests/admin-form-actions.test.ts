import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("subscription and SMTP forms use real submit buttons", () => {
  const emailPage = read("app/admin/subscriptions/email/page.tsx");
  const subscriptionsPage = read("app/admin/subscriptions/page.tsx");

  for (const action of ["updateSmtpAction", "saveTemplateAction", "retryEmailAction"]) {
    assert.match(emailPage, new RegExp(`form action=\\{${action}\\}[\\s\\S]*?<Button type="submit"`));
  }
  const smtpTestForm = read("components/admin/smtp-test-form.tsx");
  assert.match(emailPage, /<SmtpTestForm\s*\/>/);
  assert.match(smtpTestForm, /useActionState\(testSmtpAction/);
  assert.match(smtpTestForm, /<button type="submit"/);
  for (const action of ["updateSubscriptionSettingsAction", "reviewPaymentAction", "savePlanAction", "savePaymentMethodAction", "grantSubscriptionAction"]) {
    assert.match(subscriptionsPage, new RegExp(`form action=\\{${action}\\}[\\s\\S]*?<Button type="submit"`));
  }
});

test("knowledge uploads enqueue processing and expose a confirmed delete action", () => {
  const completeRoute = read("app/api/admin/knowledge/upload/complete/route.ts");
  const processRoute = read("app/api/admin/knowledge/process/route.ts");
  const documentRoute = read("app/api/admin/knowledge/[id]/route.ts");
  const actions = read("components/admin/knowledge-actions.tsx");

  assert.match(completeRoute, /enqueueDocument\(knowledgeDocumentId\)/);
  assert.match(completeRoute, /after\(\(\) => drainKnowledgeJobs\(\)\)/);
  assert.match(processRoute, /FROM public\.knowledge_documents k/);
  assert.match(processRoute, /k\.legacy_document_id=\$1/);
  assert.match(documentRoute, /export async function DELETE/);
  assert.match(actions, /window\.confirm/);
  assert.match(actions, /حذف نهائي/);
});

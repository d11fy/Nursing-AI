const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const withoutLabel = (value: string) => normalize(value).replace(/^[a-zأ-ي]\s*[).:\-]\s*/u, "");

/** Grades objective answers without accepting a correctness flag from the browser. */
export function gradePracticeAnswer(selected: unknown, expected: unknown): boolean {
  if (selected == null || expected == null) return false;
  if (Array.isArray(expected) || Array.isArray(selected)) {
    if (!Array.isArray(expected) || !Array.isArray(selected) || expected.length !== selected.length) return false;
    const expectedItems = expected.map(String).map(normalize).sort();
    const selectedItems = selected.map(String).map(normalize).sort();
    return expectedItems.every((value, index) => value === selectedItems[index]);
  }
  const answer = normalize(String(expected));
  const choice = normalize(String(selected));
  if (!answer || !choice) return false;
  if (answer === choice || withoutLabel(answer) === withoutLabel(choice)) return true;
  if (/^[a-zأ-ي]$/u.test(answer)) {
    return new RegExp(`^${answer}[).:\\-]`, "u").test(choice);
  }
  return false;
}

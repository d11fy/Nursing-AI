/** Extracts the first JSON object/array from a model response that may be
 * wrapped in prose or markdown code fences despite being asked for JSON only. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;
  const match = source.match(/[[{][\s\S]*[\]}]/);
  if (!match) throw new Error("No JSON found in model response");
  return match[0];
}

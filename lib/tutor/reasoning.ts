import type { GenerateTextParams } from '@/lib/ai/provider';
export function reasoningFor(question: string, image = false): NonNullable<GenerateTextParams['reasoningEffort']> {
  const kind = /clinical reasoning|case study|compare|complex|contraindication|interaction|قارن|حالة سريرية|تداخل/i.test(question) ? 'COMPLEX'
    : !image && question.length < 180 && /define|definition|translate|what is|flashcard|عرف|تعريف|ترجم|ما هو/i.test(question) ? 'SIMPLE' : 'NORMAL';
  const value = process.env[`OPENAI_${kind}_REASONING`] ?? (kind === 'SIMPLE' ? 'low' : kind === 'COMPLEX' ? 'high' : 'medium');
  if (!['none','low','medium','high'].includes(value)) throw new Error(`Invalid OPENAI_${kind}_REASONING`);
  return value as NonNullable<GenerateTextParams['reasoningEffort']>;
}

import type { KnowledgeChunk } from './provider';
import { getNursingTutorInstructions } from './prompts/nursing-tutor';

/** @deprecated Import getNursingTutorInstructions from prompts/nursing-tutor for task-specific policy. */
export const NURSING_SYSTEM_PROMPT = getNursingTutorInstructions({ purpose: 'student_answer' });

export function buildKnowledgeContext(chunks: KnowledgeChunk[]): string {
  return chunks.slice(0,10).map((source,index) => JSON.stringify({ id: `S${index+1}`, title: source.title,
    page: source.pageNumber, subject: source.subjectName, text: source.content })).join('\n');
}

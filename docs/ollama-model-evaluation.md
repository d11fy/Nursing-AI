# Local nursing model evaluation

Date: 2026-09-27. This is a small, manually reviewed educational smoke test on the developer's Windows computer, not clinical validation or a general model leaderboard.

Eight cases cover a requested Arabic multiple-choice question, adult resting pulse, an awake hypoglycemia scenario, an unconscious hypoglycemia scenario, controlled oxygen in COPD with hypercapnia risk, a dimensional arithmetic exercise, retrieval of a synthetic fact, and refusal to invent a dose absent from the supplied context. The same cases are reused for every model in each round.

Run with:

```bash
node --import tsx scripts/evaluate-ollama.ts path/to/results.json qwen2.5:3b qwen3:4b
```

The runner uses `think: false`, temperature 0.2, seed 42, and a 450-output-token ceiling. A `done_reason=length` response is incomplete and cannot be treated as a successful final answer. Time measures the entire local HTTP request, includes cold loading, and excludes production database retrieval and SSH-network latency. Raw responses are saved after every case. Human review is needed; CJK-character counts only identify one kind of language leakage, not factual accuracy.

## Initial findings

- With the original project prompt, `qwen2.5:3b` mixed Chinese into a pulse response, confused pulse terminology, did not supply the requested MCQ choices, gave wrong hypoglycemia follow-up thresholds, and incorrectly approved oral juice for an unconscious person. It answered the synthetic retrieval exercise correctly. Two of eight outputs hit the token ceiling.
- The installed `qwen3:4b` produced extended English reasoning in its content despite `think: false`. All eight responses hit the token ceiling, taking 26.6–38.5 seconds each. These timings are for unfinished responses, not completed answers; no factual-accuracy score is assigned to incomplete reasoning.
- A second round with stricter Arabic/conciseness instructions did not make `qwen2.5:3b` dependable: Chinese leakage, a faulty MCQ premise, hypoglycemia errors, and an ambiguous oxygen target persisted. Closing the thinking block in a separately created local Qwen3 template also failed to produce a usable final MCQ within the ceiling; that experimental model was removed. Original models were retained.

The installed models have not passed this acceptance test. A final recommendation requires testing the actual candidate, not assuming that a larger parameter count is more accurate.

## Review references

- [CDC: treating low blood sugar](https://www.cdc.gov/diabetes/treatment/treatment-low-blood-sugar-hypoglycemia.html)
- [Cambridge University Hospitals: oxygen alert card](https://www.cuh.nhs.uk/patient-information/oxygen-alert-card/)
- [MedlinePlus: vital signs](https://www.medlineplus.gov/ency/article/002341.htm)
- [Qwen3 documentation: thinking and non-thinking modes](https://github.com/QwenLM/Qwen3/blob/main/docs/source/inference/transformers.md)
- [Ollama registry: qwen3:4b-instruct](https://ollama.com/library/qwen3:4b-instruct)

## Final language and response-time comparison

The user clarified that selection concerns Arabic fluency, format and latency, not clinical accuracy before providing references. With the dedicated Arabic prompt both candidates completed eight responses without Chinese characters. qwen2.5:3b took 0.6–1.8 seconds warm (9.1 seconds cold), but contradicted its own pulse range and made an ambiguous MCQ. qwen3:4b-instruct followed the MCQ format and produced clearer Arabic, taking 1.5–9.5 seconds warm (17.5 seconds cold, including 5.8 seconds loading). These are complete-response times, not time to first token.

Choose qwen3:4b-instruct for language and format; retain qwen2.5:3b as a faster configurable alternative. Download with `ollama pull qwen3:4b-instruct` and set `OLLAMA_CHAT_MODEL=qwen3:4b-instruct`. The app streams responses, requests 10-minute model residency, and skips embeddings when no compatible ready chunks exist. Changing only the chat model requires no reindexing.

Neither candidate passed clinical review: the instruct model invented an incorrect 15-15 rule and inappropriate positioning in an unconscious scenario. This language-based choice is not clinical validation. RAG supplies references; it does not train model weights or guarantee correctness.

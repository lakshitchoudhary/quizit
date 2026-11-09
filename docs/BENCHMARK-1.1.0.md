# Quizit! 1.1.0 timing and quality observations

Date: 2026-11-06. These are single local observations, not a statistical benchmark or accuracy guarantee. The old and new production modules used the same local qwen3.5:4b model, 8192-token context, Standard level and sequential tasks. Five cards/questions were requested. Generation seconds exclude source extraction and the final unload acknowledgement; model loading is included when inference starts. Output lengths and retry counts vary.

Sources:

- [Binary Search Algorithm in 100 Seconds](https://www.youtube.com/watch?v=MFhxShGxHWc): 3,544 characters of real previously captured timestamped captions. No fresh caption acquisition in this run.
- [Mozilla PDF.js research sample](https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf): pages 1–2, 11,548 extracted characters, two processing sections. It is not a whole-book test.

## Time

Each source ran notes first with an empty claim cache, then cards, quiz and mind map with source claims reused. “Reused” does not mean the final output was already cached; these were fresh output requests. The quiz rows use the final corroboration pipeline, and the maps use the final implementation guard.

| Source/output | 1.0.1 seconds | 1.1.0 seconds | New inference requests | Shared-claim hits |
|---|---:|---:|---:|---:|
| YouTube notes, first analysis | 36* | 26 | 3 | 0 |
| YouTube 5 cards | 10 | 7 | 1 | 1 |
| YouTube 5 questions | 17 | 20 | 6 | 1 |
| YouTube mind map | 12 | 9 | 1 | 1 |
| PDF notes, first analysis | 30 | 45 | 4 | 0 |
| PDF 5 cards | 11 | 10 | 1 | 2 |
| PDF 5 questions | 18 | 23 | 3 | 2 |
| PDF mind map | 16 | 13 | 1 | 2 |

*The first old YouTube notes run took 93 seconds; a later empty-cache repeat took 36 seconds and is shown above. This variability prevents a reliable notes-speed conclusion. Runs were not randomized/repeated sufficiently to isolate hardware, length or sampling effects. No across-the-board speedup is claimed. First PDF notes were slower because shared analysis added two calls. Quiz screening adds work and can trigger repairs. The benefit is reuse across later outputs, with repeated completed outputs avoiding inference entirely. A separately tested complete YouTube quiz repeat made zero inference calls.

After every completed task, /api/ps reported zero models. Cancelling a fresh analysis request also left zero models loaded.

## Quality

Literal passages were checked against source text, and final quiz selections were inspected. YouTube selections were source-supported, though one historical-context question was less useful than a mechanism question. This demonstrates that factual support and educational usefulness are separate requirements. In the PDF quiz, four answers were clearly supported; a fifth compressed the nested-loop explanation into imprecise causal wording about when tracing starts. Automatic checks accepted that wording. Do not treat a “checked” quiz as guaranteed correct.

A separate five-case controlled test targeted reversed comparison direction, a missing “only if” condition, multiple correct options, an unstated GPU brand and numeric units. The option classifier identified the expected support sets in 4/5 cases; it incorrectly marked the reversed direction supported. The separate solver and narrow source guard rejected that incorrect selection. The combined admission checks accepted zero incorrect answers in these five cases, while also rejecting questions with zero/multiple answers. This tiny diagnostic is not a general accuracy percentage.

The automated regression suite independently verifies that disagreement rejects an item, that only failed questions are replaced, that accepted questions are not repeatedly rejudged, and that answer/verdict metadata stays aligned after shuffling. The diagram audit found vague binary-search stopping narration presented as a precise rule; the final guard/filter removed that rule in a fresh mind-map run. Notes still read all selected sections, yielding three note headings for the video and eleven for the PDF; this does not establish exhaustive factual correctness.

## Practical interpretation

Caching saves repeated source-analysis work. Keeping the model resident between tasks could save loading time, but this release deliberately retains immediate unloading. Smaller source ranges and generating only the needed output remain the most predictable ways to reduce time. Source errors, OCR mistakes, paraphrase errors, plausible distractors, causal confusion and shared errors between same-model checking passes remain possible. Use the shown passage, edit/flag mistakes and verify important material against an authoritative source.

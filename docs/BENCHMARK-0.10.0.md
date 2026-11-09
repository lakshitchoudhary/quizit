# Quizit! 0.10.0 benchmark and verification

Date: 2026-11-05. Model: local `qwen3.5:4b` (Q4_K_M), 8192-token context.

## Method and boundaries

Production generation modules called the real local Ollama service sequentially. Before: saved 0.9.1 modules. After: 0.10.0 modules. Sources and requested counts were held constant; inference caches were empty for each fresh output. Model unloading remained enabled after each task. Each row is one observed run, not a randomized repeated benchmark. GPU clocks, system load and model output length can change timings. Figures are rounded generation seconds and exclude source download/extraction and final unload acknowledgement.

- YouTube: [Binary Search Algorithm in 100 Seconds](https://www.youtube.com/watch?v=MFhxShGxHWc). Used a previously captured real timestamped auto-caption transcript; no fresh caption acquisition was performed in this benchmark.
- PDF: freshly downloaded [Mozilla PDF.js research sample](https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf), pages 1–2 of its 14 pages. Extracted using the same bundled PDF.js document path with OCR off.

**This release was benchmarked through production modules, not freshly clicked end-to-end in the installed Edge sidebar.** Automated panel tests exercised creation, temporary previews, completion, storage and diagram dispatch. Earlier 0.9.1 live Edge verification is historical and does not substitute for a fresh 0.10.0 browser test.

## Fresh generation results

| Source | Output | Before | After | Calls before → after |
|---|---|---:|---:|---:|
| Youtube | notes  | 20 s | 27 s | 1 → 2 |
| Youtube | quiz (5) | 19 s | 18 s | 2 → 2 |
| Youtube | cards (5) | 10 s | 9 s | 2 → 2 |
| Youtube | mindmap  | 10 s | 10 s | 1 → 1 |
| Youtube | flowchart  | 18 s | 18 s | 2 → 2 |
| Pdf | notes  | 27 s | 30 s | 2 → 2 |
| Pdf | quiz (5) | 25 s | 27 s | 2 → 2 |
| Pdf | cards (5) | 12 s | 10 s | 2 → 2 |
| Pdf | mindmap  | 25 s | 18 s | 7 → 3 |
| Pdf | flowchart  | 33 s | 22 s | 8 → 4 |

The largest observed gain was PDF diagrams: mind map 28% faster, flowchart 33% faster. The source changed from six overly small diagram sections to two bounded sections. Detailed PDF notes and PDF quizzes were slower in the final runs. YouTube notes were slower because they received an additional implementation-ambiguity check. There is no evidence for a universal fresh-generation speedup.

## Cached repeats

All six notes/cards/quiz repeats reused saved results with zero additional inference calls and reported less than one rounded second. This is cached reuse, not a fresh-generation claim. Cache keys include source/prompt/model/difficulty and relevant batch context; edited inputs can require inference.

## Quality review and fixes

- Both versions produced the requested five cards and five quiz questions. New notes expose literal supporting passages as well as section metadata. All recorded evidence quotes were checked as literal substrings of their corresponding original source; this does not prove semantic entailment.
- Old small practice sets selected section one. New practice excerpts are distributed across the document; the tested PDF quiz/card outputs reference both source sections. This improves source reach but is still sampling.
- An initial no-review flashcard experiment repeated vague binary-search boundary/base-case rules. It was not retained. The final pipeline checks flagged cards and rejects certain unsafe replacement phrasing; the final five binary-search cards use conceptual search direction and complexity rather than exact boundary code.
- A draft PDF quiz omitted the hot-exit condition from a correct answer. The final qualifier-preserving review retained it in the answer itself, not merely its explanation.
- Notes can still repeat ambiguous narration after a model review. The final text guard removes selected unclear index/boundary/termination statements and adds an omission caveat. The final guard was also reapplied to the saved real note responses and the resulting packs revalidated. It is a heuristic, can omit useful implementation detail, and is not a general correctness proof.
- Historical claims are attributed to the source. No independent history verification or complete factual certification was performed. Broad interview-performance claims and similar narration can remain oversimplified; check the source and edit notes when needed.
- Fixed timestamp/page evidence choosing a previous marker when a passage starts with its own newer marker.
- Fixed a cleanup bug found during testing: considering too many edge lines could delete repeated body text. Header/footer detection now examines only each page's first/last content lines and requires repetition on at least three pages.
- Fixed an overbroad card safety check that confused function-call boundaries with algorithm index boundaries. Final PDF card generation succeeded after narrowing that check.
- Selective structural repair retains valid items, regenerating missing/invalid ones rather than the entire batch. Dedicated fixtures verify this, alongside section preview cleanup and immediate unload paths.

## Verification

- Eight automated test files pass, including production panel fixtures, source cleaning, Unicode splitting, distributed literal evidence, exact counts, selective repair, targeted review, caching, note guards, cancellation/error unload, PDF page selection and diagram validation/rendering.
- Four real diagram outputs generated successfully in each version. New PDF maps used fewer source-analysis calls. Structural validity does not certify every selected relationship.
- Local model residency was fully in VRAM during inference. `/api/ps` returned no loaded models after the final completed task; the smaller server remains available.
- Real original PDFs, transcripts, generated packs, machine logs, browser data and laptop-specific startup configuration are excluded from the public package. Runtime source is copied separately to the installed directory.
- Release packaging uses the existing allowlist, private-path/token scan, pinned vendor hashes and normalized relative ZIP paths. Third-party minified code/WASM is not claimed to have been manually audited line by line.
- This run did not retest local-file permission prompts, OCR raster rendering, a fresh machine install, or macOS/Linux setup. Node PDF.js emitted optional canvas/font warnings; the real text extraction completed.

## Recommended next features (not implemented)

1. Complete library backup/restore including schedules.
2. Coverage dashboard showing chapters/concepts with and without practice.
3. Wrong-answer notebook with focused source-grounded follow-up practice.

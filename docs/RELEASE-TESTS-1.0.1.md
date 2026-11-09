# Quizit! 1.0.1 release verification

Date: 2026-11-05. This report separates real local-model checks, automated browser fixtures and unverified deployment behavior. It is not a guarantee of error-free AI content.

## Earlier real local-model checks in this release cycle

Production modules called local **qwen3.5:4b**, with an 8192-token context, sequentially and with immediate unload enabled. Each full pack requested five flashcards and five quiz questions plus detailed notes. These are single observed generation times, excluding extraction and final unload acknowledgement, not speed guarantees.

| Material | Output | Observed time | Result |
|---|---|---:|---|
| YouTube binary-search captions | Full pack: 5 note headings, 5 cards, 5 questions | 47 s | Passed final implementation-safety check |
| Same YouTube source | Flowchart | 19 s | Valid connected graph |
| Research PDF, pages 1–2 | Full pack: 9 note headings, 5 cards, 5 questions | 58 s | Passed counts, literal evidence and cache checks |
| Same PDF | Mind map | 16 s | Valid rooted hierarchy |
| Wikipedia introductory excerpt, 6,000 characters | Full pack: 4 note headings, 5 cards, 5 questions | 44 s | Passed counts, literal evidence and cache checks |

Sources:

- [Binary Search Algorithm in 100 Seconds](https://www.youtube.com/watch?v=MFhxShGxHWc): real previously captured timestamped auto-captions. This release did not freshly acquire the captions in Edge.
- [Mozilla PDF.js research sample](https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf): selected pages 1–2, extracted through bundled PDF.js.
- [Spaced repetition](https://en.wikipedia.org/wiki/Spaced_repetition): freshly fetched HTML, passed through the production article extractor using a DOM harness. Only its first 6,000 extracted characters were studied; this was not a live-browser visibility test.

After every completed task, `/api/ps` showed zero loaded models. A real in-flight request was cancelled and the model unloaded afterward. Fully cached repeats made zero inference requests. Model residency during generation was in GPU memory. The smaller server remains available after unloading.

Selected quiz answers/cards were inspected against their source passages. A serious issue was found: a reviewed quiz repeated vague recursive boundary/base-case narration as an exact implementation rule. The final pipeline detects this ambiguous narration, rejects those practice items and selectively replaces them with conceptual questions. A fresh real YouTube run passed after the fix. This heuristic does not establish correctness on every subject. Literal evidence can still be insufficient or misinterpreted; inspect important claims.

## Installed Edge retest with the final reviewer

A regular Edge window was used with the installed Quizit! sidebar and the new logo/name. The previously failing five-question Advanced YouTube quiz completed in **17 seconds** after the repair. Correct-answer feedback, deliberately incorrect-answer feedback, source explanation and navigation to question two were verified. The model unloaded after completion.

The same Edge tab then opened the public research PDF. Connect detected its address and restored the earlier page range without generation. Changing the range to page **2** and applying it freshly extracted **6,419 characters**. An Advanced full study pack completed in **47 seconds**, with detailed notes, five cards and five quiz questions. PDF page citations were displayed; flashcard reveal exposed its answer and review controls. The previous YouTube pack remained saved. The model unloaded after this task as well.

The initial failure exposed two review defects: unreliable implementation narration remained in quiz input, and rewriting a full quiz could introduce new incorrect options. Ambiguous passages are now excluded from practice input; the checker judges fixed questions/options and can only update answer indices, explanations and evidence. Explanations are bounded to avoid long deliberation loops. The final local reproduction of the Advanced quiz completed in 18 seconds, and the installed Edge run completed in 17 seconds. Unsupported items are selectively regenerated. A regression test confirms a checker cannot overwrite the original choices.

## Files, OCR and automated UI

- **13 test files pass**, including exact asymmetric counts, difficulty/cache isolation, source coverage, literal citations, selective repairs, ambiguous-practice rejection, rendering safety and cancellation/error unload.
- Real DOCX ZIP bytes generated from non-personal test text were parsed through bundled Mammoth. TXT/Markdown, invalid extensions, file/text limits and pre-cancelled imports were exercised.
- Actual PDF bytes were parsed with selected-page checks. Optional Node canvas/font warnings do not prevent text extraction; they are not proof of browser raster/OCR rendering.
- A real printed PNG was recognized using Tesseract and the bundled English language data: confidence 95, expected study phrases recovered. This used the Node worker; the production browser worker was separately tested through lifecycle fixtures, not end-to-end raster rendering in Edge.
- OCR startup/read cancellation, startup failures, late workers, closed-worker feedback and idempotent termination passed. Fixed a double-termination race that could reject during cleanup.
- Panel fixtures cover connect permissions, local-PDF address detection, saved-source switching, manual generation only, notes preview cleanup, diagram dispatch, offline recovery, storage errors, another-sidebar lock denial and copying the installation ID.
- Fixed stale connection status after recovery and bounded the model-readiness request so it cannot silently wait for a task's full timeout.
- Article fixtures verify selection, menu/script removal, source-change detection, tracking normalization and that capture does not mutate the original document.

## Setup and clean package

- Windows setup parsed successfully. `-WhatIf` made no changes. Actual setup succeeded against the installed local Ollama/model with both `-NoAutoStart` and automatic-startup configuration.
- The old script launcher was replaced with a shortcut to the official Ollama tray app. The shortcut target and empty arguments were verified. After stopping the idle server and tray app, the official startup target was launched with the saved user configuration: a new server became ready, returned HTTP 200 for the exact extension origin and had zero models loaded. This is a successful cold-start test of the configured target, not a Windows reboot/sign-in test. No script launcher is needed.
- A clean ZIP extraction, with no pre-existing `node_modules`, completed `pnpm install --frozen-lockfile --ignore-scripts` and passed the 12 test files available at that checkpoint; the final source now passes 13 test files.
- The dependency audit reported zero known vulnerabilities at verification time. Advisory data can change. Pinned vendor hashes were checked; third-party minified code/WASM is not claimed to have been manually audited line by line.
- The redesigned stacked-card/Q/completion-badge SVG and PNG icons were generated as code-native assets and visually inspected, including the live sidebar header. The installed source was updated separately, keeping its existing directory to preserve browser identity/data.

## Privacy/release checks

The release uses an explicit file allowlist. Models, installers, original PDFs, OCR test images, transcripts, generated packs, runtime logs, browser profiles, personal screenshots, account settings and laptop-specific startup files are excluded. No fixed personal extension ID is shipped. Every package entry is a relative path under `quizit/`; ZIP CRC and private-path/token/known-marker scans are performed before delivery. A scan cannot prove that every conceivable secret is absent.

## Remaining boundaries

Current verification covers the specifically recorded installed Edge flows, not every source/layout or browser permission state. It does **not** certify a clean Windows machine/Ollama installation, an actual Windows reboot/sign-in, macOS/Linux execution, all PDF layouts or all OCR languages. Earlier live-browser reports remain historical; the installed retest section above records this release. A working automated panel fixture is not equivalent to installed extension permission validation. AI source grounding, semantic duplication and subject accuracy remain fallible. Keep the sidebar open for generation, select manageable chapters and review/edit flawed output.


## 1.0.1 visual update

The displayed product name is exactly **Quizit!**, without a subtitle in the extension name. The new original vector mark combines stacked study cards, a Q, a completion badge and a small spark. SVG and all browser icon sizes were replaced.

# Quizit! 0.9.1 — final verification

Date: 2026-11-03. These results describe the installed Quizit! sidebar in a regular Microsoft Edge window, using the local `qwen3.5:4b` model. They are not merely renderer previews or mocked browser results.

## Live source results

| Source | Output | Observed result |
|---|---|---|
| Binary Search Algorithm in 100 Seconds, Fireship | Mind map | Passed: 16 points, 14 seconds, rendered in Map, SVG downloaded and parsed with all 16 nodes. |
| Same YouTube video | Flowchart | Passed: 8 points, 17 seconds, rendered in Map, SVG downloaded and parsed with all 8 nodes. |
| Mozilla PDF.js sample, pages 1–2 of 14 | Flowchart | Passed: 13 points, 38 seconds, rendered in Map, SVG downloaded and parsed with all 13 nodes. |
| Same PDF page range | Mind map | Passed: 11 points, 11 seconds, six cached source sections reused, SVG downloaded and parsed with all 11 nodes. |

Public sources: [YouTube video](https://www.youtube.com/watch?v=MFhxShGxHWc) and [Mozilla PDF.js sample PDF](https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf). Source contents, browser screenshots, exported study packs and generated examples are not bundled in the public ZIP.

The video session contained 3,544 captured transcript characters. The PDF was opened in Edge, its address was detected through Connect current page, and changing the selected range to pages 1–2 freshly captured 11,548 characters. Capture did not start generation. The PDF mind map exercised processing/reuse across multiple bounded source sections.

The local model was observed fully GPU-resident during a video job. Completion messages reported unload after all four successful jobs. The local process API returned zero loaded models after the final task and saved reopening. Timings depend on source, model, cache and hardware; they are observations rather than promises.

## Persistence and controls

- Changing diagram options waited for Start creating.
- Completed results opened the Map tab.
- Fit displayed the whole diagram; zoom and text outlines remained available for reading.
- All four exported SVG files were valid XML with the expected node counts and no script elements.
- Reload sidebar restored the saved PDF source without generation. Opening Map displayed its saved mind map; no model was loaded by reopening it.
- Existing study material remained available when generating a diagram for the same source. One active diagram is stored per source; export before replacing it if both types must be retained.

## Bugs found and fixed

The initial live video test rejected model-authored graph links because the model produced cycles and multiple-parent mind maps. A generic retry did not reliably repair them. Version 0.9.1 asks for nested mind-map topics or ordered flowchart stages/conditional outcomes and constructs IDs/connections in application code. Invalid data receives the exact validation error and previous JSON on retry. Flowcharts receive a second source-grounding/comparison review. Storage errors propagate as storage errors instead of causing model retries.

The first view of a large map could put its centre outside the viewport. Diagrams now initially fit the panel width. Long connection labels wrap near their destinations, and edges skipping intermediate levels route around nodes. Text outlines provide an alternative to reading a scaled-down visual.

## Automated verification

Seven test files pass, covering actual panel handlers with simulated browser/AI interfaces, source capture feedback, exact practice counts, difficulty/cache isolation, review scheduling, PDF range extraction from actual PDF bytes, transcript reader fixtures, graph validation/conversion, corrective retries, import/merge preservation, safe SVG text and model unload on success/error/cancellation. First-party runtime JavaScript syntax checks pass. The installed and public diagram runtime files match.

The Node text-only PDF test emits optional canvas/font warnings. It does not test rasterized PDF rendering or OCR. Windows setup helper syntax and WhatIf behavior were previously checked; installing all requirements on a clean computer has not been performed. macOS/Linux setup helpers have not been execution-tested here.

## Limits

These checks establish the tested flows, not universal source compatibility or factual correctness of all AI output. Diagrams are selective conceptual overviews, not executable algorithms or exhaustive notes. Flowchart outcomes describe continuation/repetition rather than drawing loop arrows. Small labels may require zoom, scrolling or the text outline. Captions, OCR and source narration can contain mistakes; a model review is not an independent fact check.

This PDF test used an online, text-based PDF. Direct access to a local PDF, scanned-document OCR, every supported import format and every browser permission combination were not retested in this final run. Prior validation history is retained in TESTING.md and is clearly separated from this release's live results.

The public archive uses an explicit release file tree, dependency integrity checks and privacy-pattern scanning, with independent ZIP/path/private-marker checks. Third-party minified code and WebAssembly have pinned provenance and licenses, but no complete manual semantic audit is claimed.

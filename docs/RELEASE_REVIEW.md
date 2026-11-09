# Release review

This public source is separate from the previously installed copy. No browser profiles, saved study packs, original PDFs, screenshots, credentials, model weights, installers, runtime logs or machine-specific extension ID are included. Dependencies and generic English OCR language data are included.

First-party runtime modules and release/setup scripts were inspected. Public fixes normalize reserved, invalid and duplicate card IDs before storage; randomize quiz answer positions while retaining the correct answer; remove device-specific model migration; and improve unexpected-error wording. Runtime modules are formatted for review.

The release file allowlist, path/secret pattern scanner and dependency hash verification run before packaging. The ZIP writer uses relative names and normalized timestamps with no host metadata. A scanner cannot prove that every possible secret is absent. Review the staged tree before publication.

Bundled third-party minified JavaScript and WebAssembly were NOT manually audited line by line. They were restored from pinned packages, inventoried with SHA-256 hashes, and supplied with available upstream notices. Claiming a complete semantic audit of these binaries would be inaccurate.

Known limits: generation and OCR can be wrong; captions may be unavailable; detailed notes process each section, while practice items sample sections; source size and browser storage are bounded; setup depends on host/browser permissions. Read TESTING.md for the actual validation boundary.

Version 0.9.0 adds bounded structured-data diagrams. The renderer creates SVG elements and text without innerHTML, evaluates no model code, and has a text outline. The graph validator rejects missing/duplicate IDs and edges, disconnected components, cycles and multiple roots; mind maps also require one parent per non-root node. Long input is summarized in bounded sections and combined hierarchically; diagram coverage is an overview rather than exhaustive notes. No new browser permission or network provider was added.

## 0.9.1 live-test fixes

Live Edge testing exposed repeated topology failures in model-authored graph links. Mind maps now use nested topic branches and flowcharts use ordered stages with conditional terminal outcomes; the application constructs IDs and connections. Flowcharts receive a second source-grounding/comparison review. Failed responses are retried with the exact validation error and rejected JSON. Storage failures propagate as storage errors rather than being misreported as model failures. Graphs initially fit the panel width; long edge labels wrap near their destination. Tests cover nested conversion, corrective retry, source-section reuse, preservation of other study sections and model unload. See FINAL_TEST_REPORT.md for observed browser results and remaining limits.


## 0.10.0 pipeline review

Added conservative model-input cleanup, page/heading-aware bounded splitting, distributed raw practice passages, literal note citations, note-section previews, selective structural repair, targeted risky-card/note checks and qualifier-preserving quiz review. Sparse Unicode no longer causes excessive diagram chunking. Fixed source citations using the previous timestamp/page when the quote begins with a new marker. Cache versions changed for updated prompts. Model unload remains in finally paths; no new permissions, remote provider, warm retention mode or execution of model-generated code was introduced. Eight test files pass. See BENCHMARK-0.10.0.md for real-source timings and honest validation boundaries.


## Quizit! 1.0.0 release

Rebranded first-party runtime, documentation, generated filenames, icons and package metadata. Added guided Windows setup with exact-origin configuration and optional sign-in startup; no fixed extension ID is shipped. Fixed stale offline status, bounded connection readiness, idempotent OCR termination, and selective rejection/repair of ambiguous implementation quiz questions. Added tests for DOCX, articles, OCR lifecycle, offline/storage/lock recovery and practice safety. Consult RELEASE-TESTS.md for current measurements and untested platform/browser boundaries.


## Quizit! 1.0.1 verification fixes

The public name is Quizit! only. Replaced the startup script launcher with the official Ollama Windows app and verified a cold launch of that configured target, exact-origin access and zero loaded models. Live Edge testing exposed an Advanced quiz failure. The final generator removes ambiguous implementation passages from practice input, judges fixed choices without rewriting question/options, bounds checker explanation lengths, and selectively repairs unsupported items. Regression coverage includes rejecting unexpected fields from a checker. See RELEASE-TESTS.md for successful native Edge YouTube/PDF checks and remaining boundaries.


## Quizit! 1.1.0

See RELEASE-TESTS.md and BENCHMARK-1.1.0.md for shared claim caching, per-option verdicts, separate same-model answer solving, bounded selective repair, edit invalidation, immediate unloading and the measured tradeoffs/remaining semantic limitations.

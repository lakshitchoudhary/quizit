# Quizit! 1.1.0 release verification

Date: 2026-11-06. This release adds shared source-claim caching and stronger quiz checking. Model: local qwen3.5:4b (Q4_K_M). No paid API is used.

## Changes

- Source sections are analyzed once, and the saved source shares that analysis between notes, cards, quizzes and diagrams. Keys include exact section text, model name and extraction-prompt version. Output/count/difficulty changes can reuse claims; output results remain separately keyed by their complete prompts/schema/difficulty.
- The model selects numbered passages; the application attaches original literal text. Invalid cached entries are rejected. Invalid extraction gets one retry, then a literal-passage fallback that is not cached as successful analysis. Storage/network/cancellation errors propagate to the owner's unload handler.
- Notes still process every original selected section. Claims are a coverage plan, not a substitute for the complete notes input. Practice samples original passages around claims; it does not use generated statements as factual evidence.
- Each fixed quiz option is judged as an answer to its own question. Zero or multiple supported options reject the item. A separate pass solves the same fixed question without seeing the draft answer or first verdict; agreement is required. Both passes use the SAME model, so correlated errors remain possible.
- Narrow deterministic guards reject some explicitly contradicted search directions/initialization statements. Unsupported items alone are replaced and rechecked, with bounded retries; previously accepted items remain. Failure retains the prior finished pack and usable checkpoints.
- Verdict metadata follows shuffled options. Details appear after answering. Manual editing clears old verification metadata.
- Fixed repair prompts that could copy kept items or request contradictory counts, and reduced repeated checking of accepted items. A string-letter answer schema replaced an integer schema that repeatedly returned -1 for obvious correct choices with the tested local model.
- Both diagram types now exclude/reject some vague implementation rules rather than presenting them as precise base cases/index updates. This is a narrow guard, not a general diagram correctness proof.
- Success, failure and cancellation still request keep_alive: 0. Fully cached tasks do not invoke or load the model.

## Validation

All **17 automated test files passed**. They cover source/model claim-key isolation, reuse across output/difficulty, exact citation validation, invalid-reference fallback, storage failures, cancellation, exact counts, independent solver disagreement, zero/multiple-answer rejection, selective replacement, answer shuffling, edit invalidation, diagram guards, imports, capture fixtures, safe rendering and model lifecycle. Actual PDF bytes are parsed in the PDF test. Optional Node canvas/font warnings do not invalidate text extraction and are not evidence of browser OCR rendering.

Real local-model tasks processed timestamped YouTube captions and pages 1–2 of a public research PDF through the production modules. Notes, five cards, five quiz questions and a mind map completed for each. Every completed task was followed by /api/ps with zero loaded models. A separate real in-flight analysis cancellation also left zero models loaded. A repeat of the completed YouTube quiz made zero inference calls.

See [BENCHMARK-1.1.0.md](BENCHMARK-1.1.0.md) for timing and quality findings, including a remaining wording flaw. Source text, generated packs, raw responses and private benchmark logs are deliberately excluded from the public package.

## Browser and setup boundaries

This release tested the production generation modules against real captured source text and exercised the actual panel handlers in automated DOM fixtures. It did **not** freshly click through the installed Edge sidebar or reacquire YouTube captions in this run. Installed Edge and startup-target tests from 1.0.1 are historical; see [RELEASE-TESTS-1.0.1.md](RELEASE-TESTS-1.0.1.md). Startup/setup logic is unchanged. No actual Windows reboot/sign-in, clean-machine installation or macOS/Linux execution is claimed here.

## Publication checks

The release packager enforces an allowlist, verifies pinned vendor hashes, and scans text for private paths and common secret formats. An independent ZIP check verifies CRC, unique/safe paths, version/name, README parity, known personal markers, excluded artifacts and parity with the installed source directory. Models, original documents/transcripts, generated packs, browser storage/profiles, screenshots, logs, account settings, device startup files and fixed personal extension IDs are excluded. Pattern checks reduce risk; they cannot prove the absence of every possible secret. Third-party minified/WASM dependencies are hash-verified, not claimed to have been manually reviewed line by line.

# Quizit!

**Read. Recall. Remember.** A local-first study sidebar for Microsoft Edge and Chrome.

Turn YouTube captions, articles, Wikipedia, PDFs, Word documents and images into detailed notes, flashcards, quizzes, mind maps and flowcharts using **Ollama and a local model**. No paid API key, cloud account or Codex installation is required.

Release **1.0.1**. See `docs/RELEASE-TESTS.md` for verification and known limits, `PRIVACY.md` for data handling and `SECURITY.md` for security boundaries.

## Requirements

- Windows 10/11 and current Edge/Chrome for the guided setup. macOS/Linux manual instructions are below; those platforms were not executed for this release.
- [Ollama](https://ollama.com/download). The Windows helper can invoke the official `Ollama.Ollama` winget package if missing.
- **qwen3.5:4b**, downloaded by setup when needed. Weights are several GB and are not bundled here.
- 16 GB RAM is a practical starting point; a compatible GPU helps substantially. CPU generation is slower, and memory requirements vary with source/context.
- Internet for installation/downloads and online pages. Local files/inference can work offline afterward.

End users do not need Node.js, Python or pnpm. PDF, DOCX and English OCR dependencies are included.

## Windows: one-time setup

1. Extract the ZIP to a permanent folder. Keep it after installation.
2. Open `edge://extensions` (Chrome: `chrome://extensions`), enable Developer mode, click **Load unpacked**, and select this project's **extension** directory.
3. Open Quizit! from the Extensions menu. In Preferences click **Copy Extension ID for setup**.
4. Double-click **SETUP.cmd** in the project root and paste that ID. Setup checks/installs Ollama, downloads the local model if missing, configures access and enables sign-in startup.
5. Reopen the sidebar and click **Check connection**. Connect a source, choose output/count/difficulty and click **Start creating**.

Setup restricts the server to `127.0.0.1:11434`, configures Ollama's no-cloud setting, and allows your exact extension origin. Other explicitly allowed extension IDs are preserved. It never deletes models or kills an existing server. If an existing Ollama instance rejects the extension, quit it using its tray menu, then rerun setup.

`SETUP.cmd` uses a process-scoped RemoteSigned PowerShell policy; it does not change the machine's execution policy. If downloaded scripts are blocked, inspect the source and follow Windows/organization policy. Unblocking the ZIP in its Properties before extraction may be necessary. Browser security and permission steps are manual.

Optional PowerShell commands, from this project directory:

```powershell
# Interactive setup; asks for your Extension ID.
.\scripts\Setup-Windows.ps1

# No sign-in startup or persistent account changes.
.\scripts\Setup-Windows.ps1 -ExtensionId YOUR_EXTENSION_ID -NoAutoStart

# Inspect the plan without changing anything.
.\scripts\Setup-Windows.ps1 -WhatIf
```

Automatic startup creates a **Quizit Local AI** shortcut to the official Ollama tray application in your Windows Startup folder; no script launcher is needed. Per-user `OLLAMA_HOST`, `OLLAMA_ORIGINS` and `OLLAMA_NO_CLOUD` settings configure future launches. No firewall/browser-profile changes are made. Remove the shortcut to disable startup; environment settings remain until you remove/change them. `-NoAutoStart` does not undo an earlier setup.

The model **unloads after every task**, including failure/cancellation. The smaller server stays available, and weights remain on disk. Cached tasks do not load the model. Codex is not involved during normal use.

### macOS/Linux

Install Ollama using its official instructions, load the unpacked extension, then run:

```sh
bash scripts/start-local-ai.sh YOUR_EXTENSION_ID
```

The helper uses process-scoped loopback/origin settings and can download the model. Keep its server running. It does not install automatic startup. Stop incompatible existing services yourself. These platforms were reviewed, not live-tested for this release.

## Upgrading an existing installation

Replace the files inside the existing unpacked extension directory, then click Reload on its extension card and reopen the sidebar. Keep the same directory and do not uninstall if you want to retain browser-stored study data. A new directory/installation can receive a different extension ID and need setup again.

## Daily workflow

- **YouTube:** open a watch page and click the extension icon. Captures available captions, not audio or frames. Check completeness; paste a transcript when unavailable.
- **Articles/Wikipedia:** click the extension on the article itself. Grant article access when prompted. Selection/paste handles unusual layouts. Access restrictions are not bypassed.
- **PDF in Edge:** Connect identifies the PDF address. Local `file://` PDFs require you to enable **Allow access to file URLs** in extension details. If direct access fails, use Choose PDF file.
- **Long PDFs:** enter ranges such as `1-10, 15, 20-25` under PDF pages & import options and Apply. These are PDF positions starting at 1, not necessarily printed page numbers. Choose chapters.
- **Other files:** DOCX, TXT, Markdown, PNG, JPEG and WebP are supported. Word formatting is not retained. Printed English OCR is bundled; check handwriting, names, tables and formulas.
- **Create:** choose a full pack or one output, level and counts (5–100 in steps of 5). Connecting or changing inputs never starts inference.
- **Recall:** answer cards before revealing them, then rate Again/Hard/Good/Easy. Review today selects due saved cards without inference. Edit or flag mistakes.
- **Maps:** choose Mind map / flowchart and its type. Map provides zoom, Fit, details and SVG export. One diagram is active per source; export before replacing it.
- **Save/export:** packs restore locally. Export backs up one generated pack, not the complete library/schedule. Clearing browser extension data can remove saved work.

Limits: 25 MB per file, 150,000 selected text characters and 500 selected PDF pages. Browser storage is finite. Keep the sidebar open while generating. Cancel preserves the prior finished pack and valid intermediate checkpoints.

## How it works

1. Extraction runs locally: PDF.js for selected PDF pages, Mammoth for DOCX, Tesseract for printed English OCR.
2. Conservative cleanup removes whitespace/soft-hyphen noise and repeated short page-edge lines. Original spans remain available for evidence. PDF/Markdown/numbered headings guide bounded splitting.
3. Notes process every selected section. Completed sections appear as temporary previews. Notes expose model-selected source passages with page/timestamp markers when available.
4. Practice samples passages across the selected material. Small quizzes do not exhaustively test books. Quiz checks preserve fixed questions/options and only correct answer indices, explanations and evidence. Ambiguous implementation passages are excluded from practice input; risky cards and implementation notes get targeted checks. Structural repair retains valid items. Some unclear index/boundary statements are omitted with a caveat.
5. Diagrams use nested topics or ordered stages. The application constructs/validates the graph and renders safe SVG text; it does not execute model-generated code. Flowcharts are conceptual, not executable control flow.
6. Hash-based caches reuse unchanged outputs. Source/model/difficulty/prompt changes can require inference. Cached reuse is different from fresh-generation speed.
7. Success, failure and cancellation request `keep_alive: 0`. Short idle retention is a fallback if the sidebar disappears.

AI checks are not proofs. A real source quote may be insufficient to support a generated claim. Captions and OCR can be wrong. Check important claims and edit flawed material.

## Troubleshooting

| Problem | Action |
|---|---|
| Ollama offline | Run SETUP.cmd, then Check connection. |
| Origin rejected | Quit Ollama's tray app; rerun setup with this installation's ID. |
| Start appears inactive | Read the status; ensure at least 150 characters and no job in another sidebar. Reopen after updating. |
| Article access denied | Click the extension icon on that article, grant access, then reconnect. |
| Local PDF blocked | Enable file-URL access manually or Choose PDF file. |
| No captions | Open the transcript manually or paste it; audio transcription is not included. |
| Empty scanned pages | Enable missing-text/every-page OCR and check the range. |
| Slow output | Use a chapter/one output or fewer questions. Inspect GPU support with `ollama ps`. Quality checks can take longer. |
| Interrupted download | Rerun setup to resume through Ollama. |
| Storage full | Export important packs, remove unneeded saved sources, then retry. |

## Development and publication

No build is needed to load the shipped extension. Development requires Node.js **22.13+** and pnpm **11.25.0**:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm audit:release
pnpm package
```

Run `pnpm vendor` only when intentionally rebuilding pinned dependencies; review hashes/notices. The package contains generic code/assets, not models, browser profiles, study documents, logs or saved packs. Do not add those when publishing. The allowlist and secret/path scanner reduce accidental disclosure but cannot certify absence of every possible secret. Third-party minified code/WASM is not claimed to have been audited line by line.

Push the extracted project contents to GitHub. MIT licensed; upstream dependencies retain their licenses. Read `docs/RELEASE-TESTS.md` for exact validation boundaries before making release claims.

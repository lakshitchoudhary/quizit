# Privacy

Quizit! has no account, analytics SDK, remote font, paid AI API key or telemetry endpoint.

In local mode, selected source text is sent to Ollama at `http://127.0.0.1:11434`. It uses only locally installed models and rejects cloud-tagged/remote model entries. The provided launchers set `OLLAMA_NO_CLOUD=1`. Source text, generated content, generation checkpoints (including source-derived claim statements and literal passages), quiz answers and review dates are stored in the extension's local browser storage. They are not written to the repository.

Online pages, captions and PDF addresses still contact their source websites. PDF downloads omit credentials. Caption requests use the active YouTube page's same-origin credentials and validate the timed-text host/path. Text extraction does not bypass paywalls, browser settings or authentication. Manual ChatGPT mode only copies a prompt to your clipboard; if you paste that into another service, that service receives it under its own policies.

Bundled English OCR and document parsing use local assets. A selected file may be kept in sidebar memory for page-range retry; it is not persisted as an original file. Close the sidebar to release it. Ollama's downloaded models and server logs live in locations managed by Ollama/the operating system, outside this repository. Those files are not included in a source ZIP.

Permissions: `sidePanel` for UI; `storage` for saved work; `activeTab` and `scripting` for explicitly invoked source capture. Required host declarations cover YouTube, local Ollama and file URLs; local file contents still require Edge's user-controlled file-access setting. Optional website access is requested explicitly for article capture. Optional `tabs` permission allows PDF-address identification. The app queries the active tab; it does not import browser history or read password-manager pages. File access and tab-address permission are broad browser capabilities: grant only if you trust the installed source.

Removing an unpacked extension can delete its browser-stored data. Use pack export before removing it. Runtime exports can contain source titles/URLs or personal text: do not commit them to a public repository. Full-library backup is not implemented.

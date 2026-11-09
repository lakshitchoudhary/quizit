# Third-party components

First-party application code is MIT licensed. The following bundled dependencies retain their original licenses:

| Component | Pinned version | Purpose | License |
|---|---|---|---|
| pdfjs-dist | 6.4.299 | PDF text extraction/rendering for OCR | Apache-2.0; font/map notices also included |
| mammoth | 1.13.0 | DOCX raw text extraction | BSD-2-Clause |
| tesseract.js | 7.0.0 | OCR API/worker | Apache-2.0 |
| tesseract.js-core | 7.0.0 | OCR WebAssembly | Apache-2.0 |
| @tesseract.js-data/eng | 1.0.0, best integer English data | OCR language data | Apache-2.0 according to package metadata |

The browser bundles also incorporate transitive dependencies. `third-party-licenses/` includes the notices shipped by the pinned package graph and PACKAGE.json license/repository metadata, including developer-only packages. `extension/vendor/` retains upstream notices and minified bundle license files. Font licenses are retained inside standard_fonts. Upstream package copyright/author information is license attribution, not data from an end user's computer.

Dependencies are copied byte-for-byte by `scripts/vendor.mjs`; `docs/vendor-integrity.json` records SHA-256 hashes. No third-party code is claimed to have received a complete manual semantic line-by-line audit. Original source maps are not bundled. The npm/pnpm lockfile pins registry integrity hashes. OCR data are included; Ollama application binaries and language-model weights are not. The selected Ollama model has its own upstream license, available from its model page. Review that license for your use case.

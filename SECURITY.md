# Security

Review the source and setup scripts before granting permissions or running them. Keep Edge/Chrome, Ollama and document/OCR dependencies current. Use a loopback-only Ollama server and the exact extension origin rather than exposing it to the network or allowing every origin.

The model receives untrusted quoted source text and returns validated structured data. It is not given a shell, tools or credentials. Prompt injection and factual mistakes remain possible; generated text is rendered with textContent, not executed as HTML. Quotes are copied from original text, but relevance is selected by AI. Imported item IDs are normalized and deduplicated before use as review keys.

Document parsers handle untrusted input. Size/page/text bounds reduce resource use but do not prove a parser cannot be exploited or exhausted. Do not open untrusted files in an outdated dependency. OCR is local English text recognition and is not suitable for safety-critical verification.

Setup scripts never store a password, API key or fixed extension ID. They do not stop existing services or change firewall/registry/execution-policy settings. Runtime browser permission prompts and vendor installation prompts remain yours to approve. The Windows setup script supports -WhatIf.

To report a vulnerability, use your hosting repository's private security-reporting facility if enabled. Do not include credentials, private PDFs, browser profile data or unredacted logs in public issues. No maintainer email/account is embedded in this source template.

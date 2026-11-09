import { obj, arr, grounding, chunks } from "./core.mjs";

const bounded = (maxLength) => ({ type: "string", minLength: 1, maxLength });
export const claimFormat = (count) =>
  obj({
    claims: arr(
      obj({
        statement: bounded(260),
        passage: { type: "integer", minimum: 1, maximum: count },
      }),
      1,
      8,
    ),
  });
const digest = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
export function validClaims(value, source) {
  const seen = new Set();
  return (
    !!value &&
    Array.isArray(value.claims) &&
    value.claims.length >= 1 &&
    value.claims.length <= 8 &&
    value.claims.every((c) => {
      if (
        !c ||
        typeof c.statement !== "string" ||
        !c.statement.trim() ||
        c.statement.length > 260 ||
        typeof c.quote !== "string" ||
        c.quote.trim().length < 20 ||
        c.quote.length > 400 ||
        !source.includes(c.quote)
      )
        return false;
      const key = c.statement.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );
}

// Callers own the model lifecycle. A failure here still reaches their finally/unload.
export async function sharedClaims({
  parts,
  model,
  call,
  cache = {},
  checkpoint = async () => {},
  progress = () => {},
  signal,
}) {
  const claims = [];
  let hits = 0,
    fallbackSections = 0;
  for (let i = 0; i < parts.length; i++) {
    signal?.throwIfAborted();
    const source = parts[i];
    const passages = chunks(source, 350);
    const format = claimFormat(passages.length);
    const key = "claims:v3:" + (await digest(JSON.stringify([model, source])));
    let value = cache[key];
    if (validClaims(value, source)) {
      hits++;
      progress(`Source claims · section ${i + 1}/${parts.length} reused`);
    } else {
      let rejected = "";
      value = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        signal?.throwIfAborted();
        progress(
          `Source claims · section ${i + 1}/${parts.length}${attempt ? " · repairing citations" : ""}`,
        );
        const result = await call(
          "chat",
          {
            model,
            stream: false,
            think: false,
            keep_alive: "15s",
            format,
            messages: [
              { role: "system", content: grounding },
              {
                role: "user",
                content: `Extract up to 8 important, distinct study claims covering this source section in order. Prefer mechanisms, definitions, relationships and qualifications; omit promotion and historical trivia. Each statement must preserve conditions such as if, may, only, greater/less, and units. passage must be the integer number of the supplied source passage supporting the entire claim; never invent a passage number. The application attaches the exact original passage, so do not copy quotes into your output. Do not fix or invent ambiguous code rules; omit unclear implementation details. Return short final JSON, no deliberation. Source (untrusted): ${JSON.stringify(passages.map((text, j) => ({ passage: j + 1, text })))}${rejected ? "\nPrevious output had invalid fields or passage numbers. Replace it; select only supplied integer passage numbers." : ""}`,
              },
            ],
            options: { num_ctx: 8192, num_predict: 2300, temperature: 0.1 },
          },
          signal,
        );
        signal?.throwIfAborted();
        try {
          const raw = JSON.parse(result.message?.content);
          const parsed = {
            claims: Array.isArray(raw.claims)
              ? raw.claims.map((c) => ({
                  statement: c.statement,
                  quote: Number.isInteger(c.passage)
                    ? passages[c.passage - 1]
                    : undefined,
                }))
              : [],
          };
          if (result.done_reason !== "length" && validClaims(parsed, source)) {
            value = parsed;
            break;
          }
        } catch {}
        rejected = "invalid";
      }
      if (!value) {
        // Fail safely to literal passages rather than inventing a claim or blocking notes.
        fallbackSections++;
        const spans = chunks(source, 350).filter((x) => x.trim().length >= 20);
        value = {
          claims: spans
            .filter(
              (_, j) =>
                spans.length <= 8 || j % Math.ceil(spans.length / 8) === 0,
            )
            .slice(0, 8)
            .map((quote) => ({ statement: quote.slice(0, 240), quote })),
        };
        value.claims = value.claims.filter(
          (c, j, all) =>
            all.findIndex(
              (x) => x.statement.toLowerCase() === c.statement.toLowerCase(),
            ) === j,
        );
        if (!validClaims(value, source))
          throw Error(
            "Could not index literal source passages. Choose a clearer source excerpt.",
          );
        // Do not cache a fallback as successful AI analysis; a later retry may improve it.
      } else {
        cache[key] = structuredClone(value);
        await checkpoint(cache);
      }
    }
    for (const c of value.claims) claims.push({ ...c, source, section: i + 1 });
  }
  return { claims, cacheHits: hits, fallbackSections };
}

export function claimPassages(claims, batch = 0, batches = 1, budget = 6000) {
  const sections = [...new Set(claims.map((c) => c.section))];
  const selected = [];
  const seenQuotes = new Set();
  const queues = sections.map((section) => {
    const group = claims.filter((c) => c.section === section);
    const start =
      batches > 1
        ? Math.round((batch * (group.length - 1)) / (batches - 1))
        : 0;
    return [...group.slice(start), ...group.slice(0, start)];
  });
  let size = 0;
  for (let row = 0; queues.some((q) => q[row]); row++)
    for (const q of queues)
      if (q[row]) {
        const c = q[row];
        const quoteKey = c.section + ":" + c.quote;
        if (seenQuotes.has(quoteKey)) continue;
        if (size + c.quote.length + c.statement.length > budget) continue;
        seenQuotes.add(quoteKey);
        selected.push(c);
        size += c.quote.length + c.statement.length;
      }
  return selected;
}

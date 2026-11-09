import { chunks } from "./core.mjs";

// Narrow deterministic check for explicitly narrated middle/target directions.
// Unknown wording returns true: this is not a general semantic correctness proof.
export function sourceDirectionOK(source, question) {
  const plain = (text) =>
    text
      .toLowerCase()
      .replace(/\[\d+:\d+(?::\d+)?\]/g, " ")
      .replace(/\s+/g, " ");
  const wording = plain(question.question || "");
  const answer = plain(question.options?.[question.answer] || "");
  const original = plain(source);
  if (
    /\binvent(?:ed|ion)\b/.test(answer) &&
    !/\binvent(?:ed|ion)\b/.test(original)
  )
    return false;
  if (
    /binary search/.test(wording) &&
    /initiat|start|begin/.test(wording) &&
    /instead of starting at index 0 we start in the middle/.test(original) &&
    /start(?:s|ing)? (?:at |from )?(?:index )?0/.test(answer) &&
    !/middle|doesn't|does not|never/.test(answer)
  )
    return false;

  const condition = wording.match(
    /(?:middle|element|value).{0,65}?(greater|less) than (?:the )?target/,
  );
  if (!condition || (/greater/.test(wording) && /less/.test(wording)))
    return true;
  const chosen = plain(question.options?.[question.answer] || "");
  const directions = [...chosen.matchAll(/\b(left|right)\b/g)].map((m) => m[1]);
  if (new Set(directions).size !== 1) return true;
  const rules = [
    ...plain(source).matchAll(
      /(?:middle|element|value).{0,80}?(greater|less) than (?:the )?target.{0,120}?\b(left|right)\b/g,
    ),
  ]
    .filter((m) => m[1] === condition[1])
    .map((m) => m[2]);
  if (!rules.length) return true;
  return new Set(rules).size === 1 && rules[0] === directions[0];
}

export function guardImplementationNote(note) {
  // Never silently present vague narration as a precise algorithm specification.
  const unsafe =
    /(?:base (?:case|condition)|terminat|stop).{0,100}end of (?:the )?array|(?:set|put).{0,60}(?:starting|ending) index|(?:starting|ending) index.{0,60}(?:set|middle)|(?:left|right) boundary.{0,60}(?:middle|set|updat)|middle index.{0,60}compares? (?:it|that) to (?:the )?target|middle index.{0,50}(?:equals?|matches?).{0,20}target/i;
  let removed = false;
  const clean = (text) =>
    text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        if (unsafe.test(sentence)) {
          removed = true;
          return false;
        }
        return true;
      })
      .join(" ");
  note.explanation =
    clean(note.explanation) ||
    "The source describes an implementation. Check the original code for precise comparison, boundary and termination rules.";
  note.keyPoints = note.keyPoints.map(clean).filter(Boolean);
  note.examples = note.examples.map(clean).filter(Boolean);
  if (!note.keyPoints.length)
    note.keyPoints = [
      "Check precise implementation rules against the original code.",
    ];
  if (removed)
    note.caveats.push(
      "An unclear index, boundary or termination statement was omitted. Consult the original code before implementing the algorithm.",
    );
  return note;
}

// Keep raw source spans for citations. Cleanup is only applied to model input.
export function cleanSource(text, reference = text) {
  const pages = reference.split(/(?=\[Page \d+\])/);
  const counts = new Map();
  for (const page of pages) {
    const lines = page
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x && !/^\[Page \d+\]$/.test(x));
    for (const line of new Set([...lines.slice(0, 1), ...lines.slice(-1)]))
      if (line.length > 4 && line.length < 100 && !/^\[/.test(line))
        counts.set(line, (counts.get(line) || 0) + 1);
  }
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00ad/g, "")
    .split("\n")
    .filter((line) => !(pages.length >= 3 && counts.get(line.trim()) >= 3))
    .join("\n")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sourceSections(text) {
  const limit =
    (text.match(/[^\x00-\x7F]/g)?.length || 0) / text.length < 0.05
      ? 6500
      : 2200;
  // Prefer page/Markdown/numbered heading boundaries when the section is substantial.
  const blocks = text.split(
    /\n(?=(?:\[Page \d+\]|#{1,6} |\d+(?:\.\d+)*\.? [A-Z]))/,
  );
  const sections = [];
  let pending = "";
  for (const block of blocks) {
    if (pending && pending.length + block.length > limit) {
      sections.push(...chunks(pending, limit));
      pending = "";
    }
    pending += (pending ? "\n" : "") + block;
  }
  if (pending.trim()) sections.push(...chunks(pending, limit));
  return sections;
}

export function practicePassages(parts, batch, batches, budget = 6500) {
  if (parts.join("").length <= budget)
    return parts.flatMap((source, section) =>
      chunks(source, 500)
        .filter((x) => x.length >= 20)
        .map((quote) => ({ quote, source, section: section + 1 })),
    );
  // Rotate selection within every section instead of silently testing only section one.
  const allocation = Math.max(180, Math.floor(budget / parts.length));
  const selected = parts
    .map((source, section) => {
      const spans = chunks(source, allocation).filter((x) => x.length >= 20);
      const position =
        batches === 1
          ? Math.floor((spans.length - 1) / 2)
          : Math.round((batch * (spans.length - 1)) / (batches - 1));
      return { quote: spans[position], source, section: section + 1 };
    })
    .filter((x) => x.quote);
  // Very large documents require explicit sampling to stay within context limits.
  const max = Math.max(1, Math.floor(budget / allocation));
  return selected.length <= max
    ? selected
    : Array.from(
        { length: max },
        (_, i) =>
          selected[
            Math.round((i * (selected.length - 1)) / Math.max(1, max - 1))
          ],
      );
}

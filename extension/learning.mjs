export function ensureCards(pack) {
  const seen = new Set();
  for (const item of [...(pack?.flashcards || []), ...(pack?.quiz || [])]) {
    if (
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) ||
      ["__proto__", "constructor", "prototype"].includes(item.id) ||
      seen.has(item.id)
    )
      item.id = crypto.randomUUID();
    seen.add(item.id);
  }
  return pack;
}
export function shuffleChoices(
  question,
  randomInt = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n,
) {
  const correct = question.options[question.answer];
  const options = [...question.options];
  const verdictByOption = new Map(
    question.options.map((o, i) => [o, question.verification?.verdicts?.[i]]),
  );
  for (let i = options.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i)
      throw Error("Invalid shuffle index");
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    ...question,
    options,
    answer: options.indexOf(correct),
    ...(question.verification
      ? {
          verification: {
            ...question.verification,
            verdicts: options.map((o) => verdictByOption.get(o)),
          },
        }
      : {}),
  };
}
export function schedule(previous, rating, now = Date.now()) {
  const last = previous?.interval || 0;
  const days =
    rating === "again"
      ? 0
      : rating === "hard"
        ? Math.max(1, Math.round(last * 1.2))
        : rating === "easy"
          ? Math.max(4, Math.round(last * 3))
          : last === 0
            ? 1
            : last === 1
              ? 3
              : Math.round(last * 2.5);
  if (!["again", "hard", "good", "easy"].includes(rating))
    throw Error("Unknown rating");
  return {
    interval: days,
    due: now + (days ? days * 86400000 : 600000),
    reviews: (previous?.reviews || 0) + 1,
    lastReview: now,
    rating,
  };
}
export function dueCards(records, now = Date.now()) {
  return Object.entries(records)
    .filter(([k]) => k.startsWith("video:"))
    .flatMap(([key, s]) =>
      (s.pack?.flashcards || [])
        .filter(
          (c) =>
            !c.deleted &&
            !c.flagged &&
            (!s.reviews?.[c.id] || s.reviews[c.id].due <= now),
        )
        .map((c) => ({
          key,
          id: c.id,
          title: s.title,
          due: s.reviews?.[c.id]?.due || 0,
        })),
    )
    .sort((a, b) => a.due - b.due);
}
export function evidenceFor(source, quote, section) {
  // Accept only literal source spans. Never present an invented quote as evidence.
  const start = typeof quote === "string" ? source.indexOf(quote.trim()) : -1;
  if (start < 0 || quote.trim().length < 20) return null;
  const before = source.slice(0, start + 1);
  const time =
    quote.trim().match(/^\[(\d+:\d+(?::\d+)?)\]/)?.[1] ||
    [...before.matchAll(/\[(\d+:\d+(?::\d+)?)\]/g)].at(-1)?.[1] ||
    quote.match(/\[(\d+:\d+(?::\d+)?)\]/)?.[1];
  const page =
    quote.trim().match(/^\[Page (\d+)\]/)?.[1] ||
    [...before.matchAll(/\[Page (\d+)\]/g)].at(-1)?.[1] ||
    quote.match(/\[Page (\d+)\]/)?.[1];
  return {
    quote: quote.trim(),
    section,
    time: time || "",
    page: page ? Number(page) : null,
  };
}
export function sourceLink(source, evidence) {
  try {
    const u = new URL(source?.url);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (source.kind === "youtube" && evidence?.time)
      u.searchParams.set(
        "t",
        String(
          evidence.time.split(":").reduce((a, x) => a * 60 + Number(x), 0),
        ) + "s",
      );
    return u.href;
  } catch {
    return null;
  }
}
export function mergePack(old, fresh, only, sameSource) {
  if (!old || !sameSource || only === "all") return fresh;
  const result = structuredClone(old);
  result.schemaVersion = 2;
  result.levels = {
    ...(old.levels || {}),
    [only]: fresh.difficulty || "standard",
  };
  if (only === "notes")
    for (const k of ["overview", "takeaways", "notes", "coverage"])
      result[k] = fresh[k];
  if (only === "cards") result.flashcards = fresh.flashcards;
  if (only === "quiz") result.quiz = fresh.quiz;
  if (only === "diagram") result.diagram = fresh.diagram;
  return result;
}

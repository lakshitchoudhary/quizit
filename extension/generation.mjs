import { sharedClaims, claimPassages } from "./claims.mjs";
import {
  sourceDirectionOK,
  guardImplementationNote,
  cleanSource,
  sourceSections,
} from "./source-processing.mjs";
import { evidenceFor, shuffleChoices } from "./learning.mjs";
import {
  difficultyGuide,
  obj,
  arr,
  str,
  noteSchema,
  cardSchema,
  quizSchema,
  noteOK,
  cardOK,
  quizOK,
  textOK,
  grounding,
  chunks,
  countValue,
  parsePack,
} from "./core.mjs";

const notesFormat = obj({
  overview: str,
  takeaways: arr(str, 3, 8),
  notes: arr(noteSchema, 2, 8),
});
const normal = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const unique = (items, field, old = []) => {
  const seen = new Set(old.map((x) => normal(x[field])));
  return items.every((x) => {
    const key = normal(x[field]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const keyFor = async (text) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");

export async function releaseModel(call, model) {
  // No messages means unload only: this must never trigger a new generation.
  await call(
    "chat",
    { model, messages: [], stream: false, keep_alive: 0 },
    AbortSignal.timeout(15000),
  );
}

export async function buildStudyPack({
  id,
  title,
  transcript,
  model,
  cards = 5,
  quiz = 5,
  only = "all",
  difficulty = "standard",
  signal,
  call,
  cache = {},
  checkpoint = async () => {},
  progress = () => {},
  released = () => {},
  onSection = () => {},
}) {
  if (!["all", "notes", "cards", "quiz"].includes(only))
    throw Error("Unknown generation choice");
  const difficultyInstruction = difficultyGuide(difficulty);
  cards = ["all", "cards"].includes(only) ? countValue(cards) : 0;
  quiz = ["all", "quiz"].includes(only) ? countValue(quiz) : 0;
  if (transcript.trim().length < 150 || transcript.length > 150000)
    throw Error("Use a source text between 150 and 150,000 characters.");
  const parts = sourceSections(transcript);
  const ambiguousImplementation =
    /end of (?:the )?array|middle index[\s\S]{0,60}equal/i.test(transcript) &&
    /base condition|starting index|ending index/i.test(transcript);
  const practiceScope = ambiguousImplementation
    ? "The source has ambiguous implementation narration. Do not test base cases, stopping conditions, starting/ending index updates or exact recursion boundaries. Replace them with supported conceptual search direction, strategy, comparisons or complexity questions.\n"
    : "";
  const safePractice = (item) =>
    !ambiguousImplementation ||
    !/base (?:case|condition)|stopp|terminat|starting index|ending index|(?:left|right) boundary/i.test(
      item.front
        ? item.front + " " + item.back
        : item.question +
            " " +
            item.options[item.answer] +
            " " +
            item.explanation,
    );

  let used = false,
    hits = 0,
    requests = 0,
    claimHits = 0,
    claimFallbacks = 0;
  const started = Date.now();
  const ask = async (
    prompt,
    format,
    validate,
    label,
    maxTokens = 3000,
    repair = null,
  ) => {
    prompt = difficultyInstruction + "\n" + prompt;
    signal?.throwIfAborted();
    const key = await keyFor(
      JSON.stringify(["claims-practice-v5", model, prompt, format]),
    );
    if (cache[key] && validate(cache[key])) {
      hits++;
      progress(label + " · saved result reused");
      return structuredClone(cache[key]);
    }
    let failed = "",
      rejected = null;
    for (let attempt = 0; attempt < (repair ? 3 : 2); attempt++) {
      signal?.throwIfAborted();
      used = true;
      requests++;
      progress(label + (attempt ? " · correcting format or duplicates" : ""));
      const patch = attempt && repair && rejected ? repair(rejected) : null;
      const output = await call(
        "chat",
        {
          model,
          stream: false,
          think: false,
          keep_alive: "15s",
          format: patch?.format || format,
          messages: [
            { role: "system", content: grounding },
            {
              role: "user",
              content:
                (patch ? difficultyInstruction + "\n" + patch.prompt : prompt) +
                (attempt && !patch
                  ? "\nREPAIR: The following previous result failed validation (wrong counts, invalid fields or exact duplicates of previously used prompts). Replace duplicates with new reasoning tasks and return exactly the requested arrays, including empty arrays when zero items were requested. Previous result: " +
                    failed
                  : ""),
            },
          ],
          options: { num_ctx: 8192, num_predict: maxTokens, temperature: 0.2 },
        },
        signal,
      );
      signal?.throwIfAborted();
      if (output.done_reason === "length")
        throw Error(
          "This section exceeded the output budget. Saved sections are retained; the previous finished pack is unchanged.",
        );
      let result;
      try {
        result = JSON.parse(output.message?.content);
        if (patch) result = patch.merge(result);
      } catch {}
      rejected = result;
      failed = (output.message?.content || "").slice(0, 6500);
      if (result && validate(result)) {
        cache[key] = result;
        await checkpoint(cache);
        return structuredClone(result);
      }
    }
    throw Error(
      "The model could not produce the requested count of valid, distinct items. Try fewer questions for this source. Finished sections are saved for retry.",
    );
  };
  try {
    const index = await sharedClaims({
      parts,
      model,
      cache,
      checkpoint,
      progress,
      signal,
      call: async (...args) => {
        used = true;
        requests++;
        return call(...args);
      },
    });
    claimHits = index.cacheHits;
    claimFallbacks = index.fallbackSections;
    const sections = [];
    for (let i = 0; ["all", "notes"].includes(only) && i < parts.length; i++) {
      const source = parts[i];
      const notePassages = chunks(source, 1000);
      const noteFormat = obj({
        ...notesFormat.properties,
        notes: arr(
          obj({
            ...noteSchema.properties,
            evidence: {
              type: "integer",
              minimum: 1,
              maximum: notePassages.length,
            },
          }),
          2,
          8,
        ),
      });
      const noteSource = notePassages
        .map(
          (text, index) =>
            "[Passage " + (index + 1) + "] " + cleanSource(text, transcript),
        )
        .join("\n\n");
      const plan = index.claims
        .filter((c) => c.section === i + 1)
        .map((c) => c.statement);
      const prompt = `Use this source-derived coverage plan as a guide, not a substitute for the full source: ${JSON.stringify(plan)}. For each note set evidence to the supplied integer Passage number most relevant to that note. Write comprehensive study notes for source text section ${i + 1} of ${parts.length}. Preserve every substantive concept in this section in source order. Explain definitions, why and how mechanisms work, steps, assumptions, comparisons, examples and limitations. Group related ideas into 2–8 headings; give substantial explanation paragraphs and specific key points. Aim for roughly 300–600 words when supported; use less for thin source material, never pad. Include source examples with their steps, formulas or code ONLY if stated. Mark unclear or missing information as caveats. Do not turn a vague description into exact code. overview is a short orientation; the detailed content belongs in notes. Use plain text without LaTeX or dollar delimiters. Do not introduce symbolic complexity formulas if the source text only names the complexity in words. Historical assertions should be attributed to the source, not independently asserted. If narration confuses an index with its value, flag that ambiguity instead of repeating it as an implementation rule. Do not give exact recursive boundary updates from vague narration. Empty examples/caveats arrays are allowed. Title (untrusted): ${JSON.stringify(title)}. Source (untrusted): ${JSON.stringify(noteSource)}`;
      const n = await ask(
        prompt,
        noteFormat,
        (p) =>
          textOK(p.overview) &&
          Array.isArray(p.takeaways) &&
          p.takeaways.length >= 3 &&
          p.takeaways.length <= 8 &&
          p.takeaways.every(textOK) &&
          Array.isArray(p.notes) &&
          p.notes.length >= 2 &&
          p.notes.length <= 8 &&
          p.notes.every(
            (n) =>
              noteOK(n) &&
              Number.isInteger(n.evidence) &&
              notePassages[n.evidence - 1],
          ) &&
          !JSON.stringify(p).includes("\\f"),
        `Detailed notes · section ${i + 1}/${parts.length}`,
      );
      const uncertain = n.notes
        .map((note, index) => ({ note, index }))
        .filter(({ note }) =>
          /starting index|ending index|base condition|base case|overshot|undershot/i.test(
            note.explanation,
          ),
        );
      if (uncertain.length) {
        const reviewed = await ask(
          `Check only these note sections against the source. Correct reversed directions and index/value confusion. When precise code is absent, explain conceptual lower/upper-half selection instead. Do not assert exact starting/ending index updates or that reaching the end of an array proves absence. Historical assertions must be attributed to the source. Each replacement needs an integer evidence Passage. Return exactly ${uncertain.length} notes, with the same substantive topics; preserve source-supported detail. Source: ${JSON.stringify(noteSource)}. Draft notes: ${JSON.stringify(uncertain.map((x) => x.note))}.`,
          obj({
            notes: arr(
              noteFormat.properties.notes.items,
              uncertain.length,
              uncertain.length,
            ),
          }),
          (p) =>
            Array.isArray(p.notes) &&
            p.notes.length === uncertain.length &&
            p.notes.every(
              (note) =>
                noteOK(note) &&
                Number.isInteger(note.evidence) &&
                notePassages[note.evidence - 1],
            ),
          `Checking unclear implementation notes · section ${i + 1}`,
          2500,
        );
        uncertain.forEach((x, index) => {
          n.notes[x.index] = reviewed.notes[index];
        });
      }
      const times = [...source.matchAll(/\[(\d+:\d+(?::\d+)?)\]/g)].map(
        (m) => m[1],
      );
      n.notes.forEach(guardImplementationNote);
      n.notes.forEach((note) => {
        note.sourceSection = i + 1;
        note.sourceRange = times.length ? times[0] + "–" + times.at(-1) : "";
      });
      n.notes.forEach((note) => {
        if (
          /histor|babylon|\bbc\b/i.test(
            note.heading + " " + note.explanation,
          ) &&
          !/source (?:claims|states|says)|according to/i.test(note.explanation)
        )
          note.explanation = "According to the source: " + note.explanation;
        if (
          /base case|ending index|starting index|boundary/i.test(
            note.explanation,
          )
        )
          note.caveats.push(
            "Check exact implementation boundaries against the original code; narration alone may be incomplete.",
          );
        note.evidence = evidenceFor(
          source,
          notePassages[note.evidence - 1],
          i + 1,
        );
        note.caveats = [...new Set(note.caveats)].slice(-6);
      });
      sections.push(n);
      await onSection(structuredClone(n), i + 1, parts.length);
    }
    const flashcards = [],
      questions = [];
    const batches = Math.max(Math.ceil(cards / 5), Math.ceil(quiz / 5));
    for (let batch = 0; batch < batches; batch++) {
      const nc = Math.min(5, cards - flashcards.length),
        nq = Math.min(5, quiz - questions.length);
      let selected = claimPassages(index.claims, batch, batches).map((span) => {
        const start = span.source.indexOf(span.quote);
        return {
          ...span,
          quote: span.source.slice(
            Math.max(0, start - 100),
            Math.min(span.source.length, start + span.quote.length + 150),
          ),
        };
      });
      if (ambiguousImplementation) {
        const unsafeSource =
          /base condition|base case|starting index|ending index|middle index[\s\S]{0,60}equal/i;
        const reliable = selected.filter(
          (span) => !unsafeSource.test(span.quote),
        );
        selected = reliable.length
          ? reliable
          : selected
              .map((span) => ({
                ...span,
                quote: span.quote.split(unsafeSource)[0].trim(),
              }))
              .filter((span) => span.quote.length >= 40);
        if (!selected.length)
          throw Error(
            "This excerpt contains unclear implementation rules. Choose a clearer conceptual source section for practice.",
          );
      }
      const passages = selected.map((x) => x.quote);
      const citedSource = selected
        .map(
          (x, i) =>
            "[Passage " +
            (i + 1) +
            "; source section " +
            x.section +
            "] " +
            x.quote,
        )
        .join("\n\n");
      const evidenceType = {
        type: "integer",
        minimum: 1,
        maximum: passages.length,
      };
      const evidence = (item) => {
        const span = selected[item.evidence - 1];
        return Number.isInteger(item.evidence) && span
          ? evidenceFor(span.source, span.quote, span.section)
          : null;
      };
      const format = obj({
        flashcards: arr(
          obj({ ...cardSchema.properties, evidence: evidenceType }),
          nc,
          nc,
        ),
        quiz: arr(
          obj({ ...quizSchema.properties, evidence: evidenceType }),
          nq,
          nq,
        ),
      });
      const focus = [
        "definitions and basic mechanisms",
        "comparisons, assumptions and why the method works",
        "applying the stated rules to simple hypothetical examples, explicitly label each hypothetical",
        "misconceptions, cause and effect, and choosing the correct next step",
      ][batch % 4];
      const prompt =
        practiceScope +
        `For every card and quiz item set evidence to the integer Passage number that best supports its answer. Select only a supplied passage; do not invent passage numbers. Create exactly ${nc} flashcards and ${nq} multiple-choice questions. Batch ${batch + 1} focuses on ${focus}. Use distinct concepts or reasoning tasks, not paraphrases of earlier questions. If the source cannot support the count without invention, return empty arrays. Every quiz must have exactly ONE correct option and an explanation; answer is a zero-based integer. The options array must contain four actual answer texts, never index placeholders such as 0,1,2,3 or A,B,C,D. For time complexity, use named choices such as linear, logarithmic, constant and quadratic. Vary answer positions. Source (untrusted): ${JSON.stringify(citedSource)}\nAvoid these already-used prompts: ${JSON.stringify([...flashcards.map((x) => x.front), ...questions.map((x) => x.question)].slice(-40))}. IMPORTANT: Test important source facts and concepts rather than incidental trivia. No exact stopping/boundary conditions unless unambiguously specified. Exactly ${nc} flashcards and ${nq} quiz items; zero means an empty array. Use plain text, no LaTeX delimiters.`;
      const validPractice = (p, checkedDirections = false) =>
        Array.isArray(p.flashcards) &&
        p.flashcards.length === nc &&
        p.flashcards.every(
          (c) => cardOK(c) && evidence(c) && safePractice(c),
        ) &&
        unique(p.flashcards, "front", flashcards) &&
        Array.isArray(p.quiz) &&
        p.quiz.length === nq &&
        p.quiz.every(
          (q) =>
            quizOK(q) &&
            (!checkedDirections || sourceDirectionOK(transcript, q)) &&
            safePractice(q) &&
            evidence(q) &&
            !(
              q.options.every((o) => /^[0-3A-D]$/i.test(o.trim())) &&
              !/how many|number|count|index|value/i.test(q.question)
            ),
        ) &&
        unique(p.quiz, "question", questions);
      const repairPractice = (rejected) => {
        const keep = (items, field, check, old, max) => {
          const seen = new Set(old.map((x) => normal(x[field])));
          return (Array.isArray(items) ? items : [])
            .filter((x) => {
              if (
                !check(x) ||
                (field === "question" && !sourceDirectionOK(transcript, x)) ||
                !safePractice(x) ||
                !evidence(x) ||
                seen.has(normal(x[field]))
              )
                return false;
              seen.add(normal(x[field]));
              return true;
            })
            .slice(0, max);
        };
        const keptCards = keep(
          rejected.flashcards,
          "front",
          cardOK,
          flashcards,
          nc,
        );
        const keptQuiz = keep(rejected.quiz, "question", quizOK, questions, nq);
        return {
          keptCardCount: keptCards.length,
          keptQuizCount: keptQuiz.length,
          format: obj({
            flashcards: arr(
              format.properties.flashcards.items,
              nc - keptCards.length,
              nc - keptCards.length,
            ),
            quiz: arr(
              format.properties.quiz.items,
              nq - keptQuiz.length,
              nq - keptQuiz.length,
            ),
          }),
          prompt:
            practiceScope +
            `Create ONLY ${nc - keptCards.length} NEW flashcards and ${nq - keptQuiz.length} NEW quiz questions from these exact source passages: ${JSON.stringify(citedSource)}. Set evidence to the integer Passage number supporting each answer. Every quiz needs four actual answer texts, a zero-based answer index and a brief explanation; exactly one option must answer the question. Do not return old items. Avoid ALL these kept/already used prompts: ${JSON.stringify([...flashcards.map((x) => x.front), ...questions.map((x) => x.question), ...keptCards.map((x) => x.front), ...keptQuiz.map((x) => x.question)])}. Replace these rejected prompts with DIFFERENT supported tasks: ${JSON.stringify([...(Array.isArray(rejected.flashcards) ? rejected.flashcards : []).filter((x) => !keptCards.includes(x)).map((x) => x?.front), ...(Array.isArray(rejected.quiz) ? rejected.quiz : []).filter((x) => !keptQuiz.includes(x)).map((x) => x?.question)])}. Zero requested items means an empty array. No unstated index rules.`,
          merge: (patch) => ({
            flashcards: [...keptCards, ...(patch.flashcards || [])],
            quiz: [...keptQuiz, ...(patch.quiz || [])],
          }),
        };
      };
      const draft = await ask(
        prompt,
        format,
        validPractice,
        `Practice · ${flashcards.length}/${cards} cards, ${questions.length}/${quiz} questions`,
        3000,
        repairPractice,
      );
      let result = draft;
      if (nq > 0) {
        // Judge fixed choices instead of rewriting the whole quiz: a rewrite can
        // introduce new distractors that contradict an otherwise correct answer.
        let candidate = draft;
        let pendingCards = candidate.flashcards.map((_, i) => i),
          pendingQuiz = candidate.quiz.map((_, i) => i);
        for (let round = 0; round < 3; round++) {
          const judgeFormat = obj({
            flashcards: arr(
              obj({
                back: { type: "string", minLength: 1, maxLength: 900 },
                evidence: evidenceType,
                supported: { type: "boolean" },
              }),
              pendingCards.length,
              pendingCards.length,
            ),
            quiz: arr(
              obj({
                verdicts: arr(
                  {
                    type: "string",
                    enum: ["supported", "contradicted", "not_stated"],
                  },
                  4,
                  4,
                ),
                explanation: { type: "string", minLength: 1, maxLength: 350 },
                evidence: evidenceType,
              }),
              pendingQuiz.length,
              pendingQuiz.length,
            ),
          });
          const checked = await ask(
            practiceScope +
              `Check each item ONCE and return only the final judgment. Keep each explanation under 350 characters. No deliberation, self-talk or repeated re-evaluation. Ordinary paraphrases and direct implications of the source are allowed; do not reject an obvious answer merely because the wording differs. Check the FIXED questions and options below against ONLY the supplied source. Do not rewrite questions or options. Return judgments in exactly the same order. IMPORTANT: Classify each choice AS AN ANSWER TO ITS OWN QUESTION, not whether its words or topic appear anywhere in the source. Never combine options from different questions. Example: source says a lamp turns on only if a switch is closed; question asks when it turns on; choices [always, only if switch closed, never, tomorrow] => [contradicted,supported,contradicted,not_stated]. Example: source permits red and blue; question asks which color is permitted; choices [red,blue,green,yellow] => [supported,supported,not_stated,not_stated]. Zero supported choices is allowed. For EACH of the four options independently classify whether it correctly answers the question using the quoted source: supported, contradicted, or not_stated. Return verdicts in the original option order. Do not force a single supported verdict: mark all that are correct, or none if the question is ambiguous/unsupported. Preserve every necessary qualification in the option itself; an explanation cannot rescue an incorrect option. Consider reversed comparisons, missing conditions, numeric units and multiple correct choices. The draft answer is NOT evidence. Read every option; preserve greater/less and left/right directions and all necessary qualifiers. Explain why the chosen existing option is correct. evidence is the supplied Passage number. For flashcards return the checked back and evidence, and supported=false if not supported. No historical trivia guesses or exact unstated code rules. Source: ${JSON.stringify(citedSource)}. Fixed draft: ${JSON.stringify({ flashcards: pendingCards.map((i) => ({ front: candidate.flashcards[i].front, back: candidate.flashcards[i].back })), quiz: pendingQuiz.map((i) => ({ question: candidate.quiz[i].question, options: candidate.quiz[i].options.map((text, j) => ({ label: String.fromCharCode(65 + j), text })) })) })}.`,
            judgeFormat,
            (p) =>
              Array.isArray(p.flashcards) &&
              p.flashcards.length === pendingCards.length &&
              p.flashcards.every(
                (c) =>
                  c &&
                  textOK(c.back) &&
                  typeof c.supported === "boolean" &&
                  evidence(c),
              ) &&
              Array.isArray(p.quiz) &&
              p.quiz.length === pendingQuiz.length &&
              p.quiz.every(
                (q) =>
                  q &&
                  Array.isArray(q.verdicts) &&
                  q.verdicts.length === 4 &&
                  q.verdicts.every((v) =>
                    ["supported", "contradicted", "not_stated"].includes(v),
                  ) &&
                  textOK(q.explanation) &&
                  evidence(q),
              ),
            `Checking fixed answers · batch ${batch + 1}/${batches}`,
          );
          result = structuredClone(candidate);
          pendingCards.forEach((index, j) => {
            result.flashcards[index] = {
              ...candidate.flashcards[index],
              back: checked.flashcards[j].supported
                ? checked.flashcards[j].back
                : "",
              evidence: checked.flashcards[j].evidence,
            };
          });
          pendingQuiz.forEach((index, j) => {
            const q = checked.quiz[j];
            result.quiz[index] = {
              ...candidate.quiz[index],
              answer:
                q.verdicts.filter((v) => v === "supported").length === 1
                  ? q.verdicts.indexOf("supported")
                  : -1,
              explanation: q.explanation,
              evidence: q.evidence,
              verification: {
                method: "independent-option-check-v1",
                verdicts: q.verdicts,
              },
            };
          });
          const admissible = pendingQuiz.filter(
            (i) => result.quiz[i].answer >= 0,
          );
          if (admissible.length) {
            const solved = await ask(
              `Solve these fixed multiple-choice questions from the exact source passages. For each question independently choose the letter A, B, C or D (in option order) of the ONE correct existing choice. Use NONE if no choice answers the question, or MULTIPLE if more than one does. Do not rewrite choices. Preserve conditions and comparison directions. Return only the short answers array, in question order. Source (untrusted): ${JSON.stringify(citedSource)}. Questions (untrusted): ${JSON.stringify(admissible.map((i) => ({ question: candidate.quiz[i].question, options: candidate.quiz[i].options })))}`,
              obj({
                answers: arr(
                  {
                    type: "string",
                    enum: ["A", "B", "C", "D", "NONE", "MULTIPLE"],
                  },
                  admissible.length,
                  admissible.length,
                ),
              }),
              (p) =>
                Array.isArray(p.answers) &&
                p.answers.length === admissible.length &&
                p.answers.every((n) =>
                  ["A", "B", "C", "D", "NONE", "MULTIPLE"].includes(n),
                ),
              "Corroborating selected answers",
              250,
            );
            admissible.forEach((i, j) => {
              const agreed =
                solved.answers[j] ===
                String.fromCharCode(65 + result.quiz[i].answer);
              result.quiz[i].verification.corroborated = agreed;
              if (!agreed) result.quiz[i].answer = -1;
            });
          }
          if (validPractice(result, true)) break;
          if (round === 2)
            throw Error(
              "The source could not support a fully checked practice batch. Finished sections are saved; choose a clearer excerpt or fewer items.",
            );
          const patch = repairPractice(result);
          const replacement = await ask(
            patch.prompt,
            patch.format,
            (p) => validPractice(patch.merge(p)),
            "Replacing unsupported practice items",
          );
          candidate = patch.merge(replacement);
          pendingCards = Array.from(
            { length: nc - patch.keptCardCount },
            (_, i) => patch.keptCardCount + i,
          );
          pendingQuiz = Array.from(
            { length: nq - patch.keptQuizCount },
            (_, i) => patch.keptQuizCount + i,
          );
        }
      }
      if (nq === 0) {
        const unsafeRule = (item) =>
          /base case|stopp|terminat|(?:start(?:ing)?|end(?:ing)?) index|(?:index|search|array) boundar/i.test(
            item.front + " " + item.back,
          );
        const risky = result.flashcards
          .map((item, index) => ({ item, index }))
          .filter(({ item }) =>
            /boundar|base case|stopp|terminat|start(?:ing)? index|end(?:ing)? index|middle (?:index|value)|\breturn\b|\b\d+(?:\.\d+)?\b/i.test(
              item.front + " " + item.back,
            ),
          );
        if (risky.length) {
          const checked = await ask(
            `Review ONLY these flagged cards against the source. Replace exact code boundaries, base cases, index updates and uncertain implementation rules with supported conceptual questions. Do not mention base cases, stopping, termination, exact index boundaries or starting/ending indices anywhere in the replacements. Ask a different conceptual question instead. Keep the other cards untouched; avoid their prompts: ${JSON.stringify(result.flashcards.filter((_, i) => !risky.some((r) => r.index === i)).map((x) => x.front))}. Return exactly ${risky.length} flashcards with integer evidence Passage numbers and an empty quiz array. Source: ${JSON.stringify(citedSource)}. Flagged draft: ${JSON.stringify(risky.map((r) => r.item))}.`,
            obj({
              flashcards: arr(
                format.properties.flashcards.items,
                risky.length,
                risky.length,
              ),
              quiz: arr(quizSchema, 0, 0),
            }),
            (p) =>
              Array.isArray(p.flashcards) &&
              p.flashcards.length === risky.length &&
              p.flashcards.every(
                (c) => cardOK(c) && evidence(c) && !unsafeRule(c),
              ) &&
              Array.isArray(p.quiz) &&
              p.quiz.length === 0,
            "Checking flagged flashcards",
            1500,
          );
          result = structuredClone(result);
          risky.forEach((r, i) => {
            result.flashcards[r.index] = checked.flashcards[i];
          });
          if (!validPractice(result))
            throw Error(
              "Reviewed cards overlap existing items. Retry with fewer cards.",
            );
        }
      }
      for (const item of [...result.flashcards, ...result.quiz])
        item.evidence = evidence(item);
      flashcards.push(...result.flashcards);
      // Shuffle actual choices without changing which answer is correct.
      questions.push(...result.quiz.map((q) => shuffleChoices(q)));
    }
    const notes = sections.flatMap((s) => s.notes);
    const pack = {
      schemaVersion: 2,
      difficulty,
      levels:
        only === "all"
          ? { notes: difficulty, cards: difficulty, quiz: difficulty }
          : { [only]: difficulty },
      videoId: id,
      title,
      overview: sections[0]?.overview || "",
      takeaways: sections.flatMap((s) => s.takeaways).slice(0, 100),
      notes,
      flashcards,
      quiz: questions,
      coverage: {
        sections: parts.length,
        sourceCharacters: transcript.length,
        sectionChecklist: sections.map((s, i) => ({
          section: i + 1,
          headings: s.notes.map((n) => n.heading),
        })),
        practice:
          parts.length > batches
            ? "Practice samples passages across the source; it is not exhaustive. Generate notes for complete section processing."
            : "Practice draws from source text sections.",
      },
    };
    parsePack(JSON.stringify(pack), id);
    return {
      pack,
      stats: {
        seconds: Math.round((Date.now() - started) / 1000),
        requests,
        cacheHits: hits + claimHits,
        claimCacheHits: claimHits,
        claimFallbackSections: claimFallbacks,
        sourceClaims: index.claims.length,
        sections: parts.length,
      },
    };
  } finally {
    // Release on success, cancellation, validation failure and network failure. The short
    // keep_alive on each request also bounds idle residency if the sidebar is closed.
    if (used) {
      try {
        await releaseModel(call, model);
        released(true);
      } catch {
        released(false);
      }
    }
  }
}

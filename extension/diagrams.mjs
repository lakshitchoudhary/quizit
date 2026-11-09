import { sharedClaims } from "./claims.mjs";
import { sourceSections } from "./source-processing.mjs";
import { chunks, grounding, difficultyGuide } from "./core.mjs";
import { releaseModel } from "./generation.mjs";

const string = (maxLength) => ({ type: "string", minLength: 1, maxLength });
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (items, minItems, maxItems) => ({
  type: "array",
  items,
  minItems,
  maxItems,
});
const outlineSchema = object({ points: list(string(180), 3, 6) });
const topicSchema = object({ label: string(90), detail: string(300) });
const mindmapSchema = object({
  title: string(120),
  detail: string(300),
  branches: list(
    object({
      label: string(90),
      detail: string(300),
      children: list(topicSchema, 0, 2),
    }),
    3,
    5,
  ),
});
const flowSchema = object({
  title: string(120),
  steps: list(
    object({
      label: string(90),
      detail: string(300),
      nextLabel: { type: "string", maxLength: 50 },
      branches: list(
        object({
          condition: string(50),
          label: string(90),
          detail: string(300),
        }),
        0,
        2,
      ),
    }),
    3,
    6,
  ),
});
export function flowchartGraph(raw) {
  if (
    !raw ||
    !Array.isArray(raw.steps) ||
    raw.steps.length < 3 ||
    raw.steps.length > 6
  )
    throw Error("Return 3–6 ordered steps.");
  const nodes = [],
    edges = [];
  raw.steps.forEach((step, i) => {
    if (
      !step ||
      !Array.isArray(step.branches) ||
      step.branches.length > 2 ||
      typeof step.nextLabel !== "string" ||
      step.nextLabel.length > 50
    )
      throw Error("Invalid process step or branch.");
    const id = "s" + i;
    nodes.push({ id, label: step.label, detail: step.detail });
    if (i < raw.steps.length - 1)
      edges.push({ from: id, to: "s" + (i + 1), label: step.nextLabel });
    step.branches.forEach((branch, j) => {
      const child = id + "b" + j;
      nodes.push({ id: child, label: branch.label, detail: branch.detail });
      edges.push({ from: id, to: child, label: branch.condition });
    });
  });
  return { title: raw.title, nodes, edges };
}
export function mindmapGraph(raw) {
  if (
    !raw ||
    !Array.isArray(raw.branches) ||
    raw.branches.length < 3 ||
    raw.branches.length > 5
  )
    throw Error("Return 3–5 topic branches.");
  const nodes = [{ id: "root", label: raw.title, detail: raw.detail }],
    edges = [];
  raw.branches.forEach((branch, index) => {
    if (
      !branch ||
      !Array.isArray(branch.children) ||
      branch.children.length > 2
    )
      throw Error("Use at most two subtopics per branch.");
    const id = "b" + index;
    nodes.push({ id, label: branch.label, detail: branch.detail });
    edges.push({ from: "root", to: id, label: "" });
    branch.children.forEach((child, j) => {
      const childId = id + "_" + j;
      nodes.push({ id: childId, label: child.label, detail: child.detail });
      edges.push({ from: id, to: childId, label: "" });
    });
  });
  return { title: raw.title, nodes, edges };
}
import { validateDiagram } from "./diagram-view.mjs";
export async function buildDiagram({
  id,
  title,
  transcript,
  model,
  kind = "mindmap",
  difficulty = "standard",
  signal,
  call,
  cache = {},
  checkpoint = async () => {},
  progress = () => {},
  released = () => {},
}) {
  if (!["mindmap", "flowchart"].includes(kind))
    throw Error("Choose a mind map or flowchart.");
  if (
    typeof transcript !== "string" ||
    transcript.trim().length < 150 ||
    transcript.length > 150000
  )
    throw Error("Use 150–150,000 source characters.");
  const guide = difficultyGuide(difficulty),
    started = Date.now();
  const ambiguousRules =
    /end of (?:the )?array|middle index[\s\S]{0,60}equal/i.test(transcript) &&
    /base condition|starting index|ending index/i.test(transcript);
  const unsafeRules =
    /base (?:case|condition)|stopp|terminat|starting index|ending index|(?:left|right) boundary|(?:start|end)(?:ing)? index.{0,60}(?:middle|set)/i;
  const checkedDiagram = (value) => {
    const diagram = validateDiagram(value, kind);
    if (
      ambiguousRules &&
      diagram.nodes.some((n) => unsafeRules.test(n.label + " " + n.detail))
    )
      throw Error(
        "Omit ambiguous base cases, stopping conditions and exact index updates; use conceptual search halves instead.",
      );
    return diagram;
  };
  let used = false,
    requests = 0,
    hits = 0;
  async function ask(
    prompt,
    format,
    validate,
    label,
    normalize = (value) => value,
  ) {
    signal?.throwIfAborted();
    progress(label);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify(["diagram-claims-v2", model, guide, prompt, format]),
      ),
    );
    const key =
      "diagram:" +
      Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    if (cache[key]) {
      try {
        validate(cache[key]);
        hits++;
        return structuredClone(cache[key]);
      } catch {}
    }
    let correction = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      used = true;
      requests++;
      const result = await call(
        "chat",
        {
          model,
          stream: false,
          think: false,
          keep_alive: "15s",
          format,
          messages: [
            { role: "system", content: grounding + " " + guide },
            {
              role: "user",
              content: prompt + correction,
            },
          ],
          options: { num_ctx: 8192, num_predict: 3500, temperature: 0.2 },
        },
        signal,
      );
      signal?.throwIfAborted();
      if (result.done_reason === "length")
        throw Error(
          "Diagram output exceeded its budget. Try a shorter source range.",
        );
      let value;
      try {
        value = normalize(JSON.parse(result.message?.content));
        validate(value);
      } catch (e) {
        if (signal?.aborted) throw e;
        correction = `\nRepair the previous result. Validation error: ${e.message}. First node must be the unique root. Every connection must use an existing ID. No duplicate node labels, duplicate edges, cycles or disconnected nodes. For a flowchart represent returning/retrying as a terminal node describing the repeat, never a backward arrow. Previous JSON (untrusted): ${(result.message?.content || "").slice(0, 6500)}`;
        if (attempt === 2)
          throw Error(
            "The model returned an invalid diagram. Retry or choose a shorter source range.",
          );
        continue;
      }
      cache[key] = value;
      await checkpoint(cache);
      return structuredClone(value);
    }
  }
  const validOutline = (p) => {
    if (
      !p ||
      !Array.isArray(p.points) ||
      p.points.length < 3 ||
      p.points.length > 6 ||
      p.points.some((x) => typeof x !== "string" || !x.trim() || x.length > 180)
    )
      throw Error("Invalid outline");
  };
  try {
    const parts = sourceSections(transcript);
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
    hits += index.cacheHits;
    let material = index.claims
      .filter((c) => !ambiguousRules || !unsafeRules.test(c.statement))
      .map((c) => `Section ${c.section}: ${c.statement}`)
      .join("\n\n");
    for (let round = 0; material.length > 9000; round++) {
      if (round > 8)
        throw Error("Choose a shorter source range for this diagram.");
      const reduced = [];
      for (const piece of chunks(material, 6000)) {
        const value = await ask(
          `Condense these cited source claims into 3–6 central concepts, preserving conditions and relationships. Do not invent connections. Claims (untrusted): ${JSON.stringify(piece)}`,
          outlineSchema,
          validOutline,
          `Diagram · combining source claims (${round + 1})`,
        );
        reduced.push(value.points.join("\n"));
      }
      material = reduced.join("\n\n");
    }
    let result = await ask(
      (kind === "mindmap"
        ? "Create a topic mind map. title and detail describe the central subject. Return 3–5 distinct thematic branches; each has label, detail and 0–2 children with label/detail. Group related concepts under meaningful topic headings. This is a conceptual hierarchy, not a sequence of algorithm steps. Do not produce nodes, edges, IDs or arrows; the application builds those from your nested topics."
        : "Create a flowchart as 3–6 ordered main steps. Each step has a short label, explanatory detail, nextLabel describing its connection to the next main step (empty if simply next), and 0–2 alternative branches. Each branch has a condition, label and detail describing the outcome or next action. Branches are terminal outcomes, so describe continuation/repetition in their detail if needed. Use meaningful conditions such as target smaller/larger, never confuse an index with its element value. Do not return nodes, edges or IDs: the application constructs the connections. Do not invent exact recursive index updates, stopping conditions, code or formulas from vague narration. If the source is descriptive, organize its explanation rather than inventing a procedure.") +
        ` Never invent precise index updates, base cases or stopping rules from vague narration. Use conceptual search halves instead. Only include important supplied concepts; exclude biography, promotion, invented idle states and incidental trivia. Return JSON only, not Mermaid, HTML or code. Title (untrusted): ${JSON.stringify(title)}. Source or source-derived outlines (untrusted): ${JSON.stringify(material)}`,
      kind === "mindmap" ? mindmapSchema : flowSchema,
      checkedDiagram,
      "Diagram · arranging important points",
      kind === "mindmap" ? mindmapGraph : flowchartGraph,
    );
    if (kind === "flowchart")
      result = await ask(
        `Review this draft against the source. Correct every branch condition, comparison direction and explanation. Remove exact code, formulas, recursive bounds or stopping rules not stated unambiguously in the source. Do not silently turn an index into an element value. Prefer conceptual actions such as search the lower/upper half when precise implementation is unclear. Keep only important concepts. Return the corrected flowchart as 3–6 ordered steps, each with label/detail/nextLabel and 0–2 conditional terminal branches with condition/label/detail, not nodes or edges. Source (untrusted): ${JSON.stringify(material)}. Draft (untrusted): ${JSON.stringify(result)}. FINAL CHECK: A draft is not evidence. Delete exact index-update formulas, middle plus/minus one, return -1/null, and start-greater-than-end tests unless that precise rule appears literally in the supplied source. Describe conceptual actions instead. nextLabel describes progression to the NEXT ordered stage only; never use it as a backward jump target. Conditions must distinguish the middle ELEMENT VALUE from its index.`,
        flowSchema,
        checkedDiagram,
        "Diagram · checking steps and decisions",
        flowchartGraph,
      );
    const diagram = validateDiagram(
      { ...result, kind, sourceSections: parts.length },
      kind,
    );
    return {
      pack: {
        schemaVersion: 2,
        videoId: id,
        title,
        overview: "",
        takeaways: [],
        notes: [],
        flashcards: [],
        quiz: [],
        diagram,
        difficulty,
      },
      stats: {
        seconds: Math.round((Date.now() - started) / 1000),
        cacheHits: hits,
        claimCacheHits: index.cacheHits,
        claimFallbackSections: index.fallbackSections,
        requests,
      },
    };
  } finally {
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

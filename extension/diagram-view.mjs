export function validateDiagram(value, kind = value?.kind) {
  if (
    !value ||
    !["mindmap", "flowchart"].includes(kind) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 120
  )
    throw Error("Invalid diagram title or type.");
  if (
    !Array.isArray(value.nodes) ||
    value.nodes.length < 3 ||
    value.nodes.length > 20 ||
    !Array.isArray(value.edges) ||
    value.edges.length < 2 ||
    value.edges.length > 30
  )
    throw Error("Invalid diagram size.");
  const ids = new Set(),
    labels = new Set();
  for (const n of value.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,30}$/.test(n.id) ||
      ids.has(n.id) ||
      typeof n.label !== "string" ||
      !n.label.trim() ||
      n.label.length > 90 ||
      typeof n.detail !== "string" ||
      !n.detail.trim() ||
      n.detail.length > 300 ||
      (kind === "mindmap" && labels.has(n.label.trim().toLowerCase()))
    )
      throw Error("Invalid or duplicate diagram node.");
    ids.add(n.id);
    labels.add(n.label.trim().toLowerCase());
  }
  const indegree = new Map([...ids].map((id) => [id, 0])),
    children = new Map([...ids].map((id) => [id, []])),
    pairs = new Set();
  for (const e of value.edges) {
    if (
      !e ||
      !ids.has(e.from) ||
      !ids.has(e.to) ||
      e.from === e.to ||
      typeof e.label !== "string" ||
      e.label.length > 50 ||
      pairs.has(e.from + ">" + e.to)
    )
      throw Error("Invalid diagram connection.");
    pairs.add(e.from + ">" + e.to);
    indegree.set(e.to, indegree.get(e.to) + 1);
    children.get(e.from).push(e.to);
  }
  const roots = [...ids].filter((id) => indegree.get(id) === 0);
  if (
    roots.length !== 1 ||
    roots[0] !== value.nodes[0].id ||
    (kind === "mindmap" && [...indegree.values()].some((n) => n > 1))
  )
    throw Error("Diagram needs one connected root; a mind map must be a tree.");
  const queue = [...roots];
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited++;
    for (const child of children.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  if (visited !== ids.size)
    throw Error("Diagram connections must be connected and acyclic.");
  return { ...value, kind };
}

export function renderDiagram(root, diagram) {
  const el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  if (!diagram) {
    root.append(
      el("h2", "See how the ideas connect"),
      el(
        "p",
        "Choose Mind map / flowchart under Create, select a diagram type, then click Start creating.",
      ),
    );
    return;
  }
  try {
    diagram = validateDiagram(diagram);
  } catch {
    root.append(el("p", "This saved diagram is invalid. Generate it again."));
    return;
  }
  root.append(
    el("h2", diagram.title),
    el(
      "p",
      diagram.kind === "mindmap"
        ? "Mind map · important topics and relationships"
        : "Flowchart · source-supported steps and relationships",
    ),
  );
  const children = new Map(diagram.nodes.map((n) => [n.id, []])),
    incoming = new Map(diagram.nodes.map((n) => [n.id, 0]));
  diagram.edges.forEach((e) => {
    children.get(e.from).push(e.to);
    incoming.set(e.to, incoming.get(e.to) + 1);
  });
  const queue = diagram.nodes
      .filter((n) => incoming.get(n.id) === 0)
      .map((n) => n.id),
    depth = new Map(queue.map((id) => [id, 0]));
  while (queue.length) {
    const id = queue.shift();
    for (const child of children.get(id)) {
      depth.set(child, Math.max(depth.get(child) || 0, depth.get(id) + 1));
      incoming.set(child, incoming.get(child) - 1);
      if (!incoming.get(child)) queue.push(child);
    }
  }
  const levels = [];
  diagram.nodes.forEach((n) => (levels[depth.get(n.id)] ||= []).push(n));
  const vertical = diagram.kind === "flowchart",
    maxAcross = Math.max(...levels.map((x) => x.length));
  const width = vertical
      ? Math.max(480, maxAcross * 220)
      : Math.max(480, levels.length * 240),
    height = vertical
      ? levels.length * 150 + 40
      : Math.max(240, maxAcross * 130 + 40);
  const positions = new Map();
  levels.forEach((nodes, d) =>
    nodes.forEach((n, i) =>
      positions.set(
        n.id,
        vertical
          ? { x: ((i + 0.5) * width) / nodes.length, y: d * 150 + 30 }
          : { x: d * 240 + 25, y: ((i + 0.5) * height) / nodes.length - 40 },
      ),
    ),
  );
  const svgNS = "http://www.w3.org/2000/svg",
    svgEl = (tag, attrs = {}) => {
      const n = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      return n;
    };
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": diagram.title,
  });
  const background = svgEl("rect", { width, height, fill: "#faf9f3" });
  svg.append(background);
  const defs = svgEl("defs"),
    marker = svgEl("marker", {
      id: "diagram-arrow",
      markerWidth: 8,
      markerHeight: 8,
      refX: 7,
      refY: 4,
      orient: "auto",
    });
  marker.append(svgEl("path", { d: "M0,0 L8,4 L0,8 Z", fill: "#6b876f" }));
  defs.append(marker);
  svg.append(defs);
  for (const edge of diagram.edges) {
    const a = positions.get(edge.from),
      b = positions.get(edge.to),
      x1 = vertical ? a.x : a.x + 190,
      y1 = vertical ? a.y + 80 : a.y + 40,
      x2 = vertical ? b.x : b.x,
      y2 = vertical ? b.y : b.y + 40;
    // Route edges that skip levels around intermediate nodes, not through them.
    const bypass = vertical && depth.get(edge.to) - depth.get(edge.from) > 1;
    const route = bypass
      ? `M${a.x + 95},${a.y + 40} H${width - 12} V${b.y + 40} H${b.x + 95}`
      : vertical
        ? `M${x1},${y1} C${x1},${y1 + 40} ${x2},${y2 - 40} ${x2},${y2}`
        : `M${x1},${y1} C${x1 + 25},${y1} ${x2 - 25},${y2} ${x2},${y2}`;
    svg.append(
      svgEl("path", {
        d: route,
        fill: "none",
        stroke: "#6b876f",
        "stroke-width": 2,
        ...(vertical ? { "marker-end": "url(#diagram-arrow)" } : {}),
      }),
    );
    if (edge.label) {
      const text = svgEl("text", {
        x: bypass ? width - 18 : vertical ? x2 : (x1 + x2) / 2,
        y: vertical && !bypass ? y2 - 40 : (y1 + y2) / 2 - 6,
        fill: "#294d3c",
        "font-size": 11,
        "text-anchor": bypass ? "end" : "middle",
      });
      const lines = [""];
      for (const word of edge.label.split(/\s+/)) {
        if ((lines.at(-1) + " " + word).trim().length > 20 && lines.at(-1))
          lines.push(word);
        else lines[lines.length - 1] = (lines.at(-1) + " " + word).trim();
      }
      lines.slice(0, 3).forEach((line, index) => {
        const span = svgEl("tspan", {
          x: text.getAttribute("x"),
          dy: index ? 12 : 0,
        });
        span.textContent = line;
        text.append(span);
      });
      svg.append(text);
    }
  }
  for (const n of diagram.nodes) {
    const pos = positions.get(n.id),
      x = vertical ? pos.x - 95 : pos.x,
      y = pos.y,
      g = svgEl("g"),
      title = svgEl("title");
    title.textContent = n.label + ": " + n.detail;
    g.append(
      title,
      svgEl("rect", {
        x,
        y,
        width: 190,
        height: 80,
        rx: 14,
        fill: depth.get(n.id) === 0 ? "#204b3d" : "#eaf0df",
        stroke: "#bacbb2",
      }),
    );
    const words = n.label.split(/\s+/),
      lines = [""];
    for (const word of words) {
      let line = lines.at(-1);
      if ((line + " " + word).trim().length > 25 && line) {
        lines.push(word);
      } else lines[lines.length - 1] = (line + " " + word).trim();
    }
    const text = svgEl("text", {
      x: x + 95,
      y: y + 20,
      fill: depth.get(n.id) === 0 ? "#fff" : "#203e32",
      "font-family": "system-ui, sans-serif",
      "font-size": 12,
      "text-anchor": "middle",
    });
    lines.slice(0, 4).forEach((line, i) => {
      const t = svgEl("tspan", { x: x + 95, dy: i ? 15 : 0 });
      t.textContent = line;
      text.append(t);
    });
    g.append(text);
    svg.append(g);
  }
  const controls = el("div"),
    viewport = el("div");
  controls.className = "diagram-tools";
  viewport.className = "diagram-viewport";
  viewport.append(svg);
  let zoom = 1;
  const size = () => {
    svg.setAttribute("width", String(width * zoom));
    svg.setAttribute("height", String(height * zoom));
  };
  size();
  for (const [label, action] of [
    [
      "−",
      () => {
        zoom = Math.max(0.3, zoom - 0.2);
        size();
      },
    ],
    [
      "+",
      () => {
        zoom = Math.min(2, zoom + 0.2);
        size();
      },
    ],
    [
      "Fit",
      () => {
        zoom = Math.max(
          0.3,
          Math.min(1, (viewport.clientWidth || 480) / width),
        );
        size();
      },
    ],
    [
      "Download SVG",
      () => {
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
            type: "image/svg+xml",
          }),
          url = URL.createObjectURL(blob),
          a = el("a");
        a.href = url;
        a.download = "quizit-" + diagram.kind + ".svg";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    ],
  ]) {
    const b = el("button", label);
    b.className = "secondary";
    b.type = "button";
    b.setAttribute(
      "aria-label",
      label === "−" ? "Zoom out" : label === "+" ? "Zoom in" : label,
    );
    b.onclick = action;
    controls.append(b);
  }
  root.append(controls, viewport);
  // Start with the whole graph in view; the user can zoom in for labels.
  zoom = Math.max(0.3, Math.min(1, (viewport.clientWidth || 480) / width));
  size();
  const outline = el("details"),
    summary = el("summary", "Read important points");
  outline.className = "diagram-outline";
  outline.append(summary);
  for (const n of diagram.nodes) {
    const p = el("p"),
      strong = el("strong", n.label + " — ");
    p.append(strong, document.createTextNode(n.detail));
    outline.append(p);
  }
  const names = new Map(diagram.nodes.map((n) => [n.id, n.label]));
  outline.append(el("h3", "Connections"));
  for (const edge of diagram.edges)
    outline.append(
      el(
        "p",
        `${names.get(edge.from)} → ${names.get(edge.to)}${edge.label ? " · " + edge.label : ""}`,
      ),
    );
  root.append(
    outline,
    el(
      "p",
      "AI-generated overview: check relationships against the source. Scroll to explore; hover a node for its explanation.",
    ),
  );
}

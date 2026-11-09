import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const vendor = path.join(root, "extension/vendor");
await fs.mkdir(vendor, { recursive: true });
const resolvePackage = (name) =>
  path.dirname(require.resolve(name + "/package.json"));
const pdf = resolvePackage("pdfjs-dist"),
  mammoth = resolvePackage("mammoth"),
  tess = resolvePackage("tesseract.js"),
  eng = resolvePackage("@tesseract.js-data/eng");
const core = path.dirname(
  createRequire(path.join(tess, "package.json")).resolve(
    "tesseract.js-core/package.json",
  ),
);
async function copy(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}
for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"])
  await copy(path.join(pdf, "legacy/build", name), path.join(vendor, name));
for (const name of ["cmaps", "standard_fonts"])
  await copy(path.join(pdf, name), path.join(vendor, name));
await copy(path.join(pdf, "LICENSE"), path.join(vendor, "PDFJS-LICENSE"));
await copy(
  path.join(mammoth, "mammoth.browser.js"),
  path.join(vendor, "mammoth.browser.js"),
);
await copy(path.join(mammoth, "LICENSE"), path.join(vendor, "MAMMOTH-LICENSE"));
const ocr = path.join(vendor, "ocr");
for (const name of [
  "tesseract.esm.min.js",
  "worker.min.js",
  "worker.min.js.LICENSE.txt",
  "tesseract.min.js.LICENSE.txt",
])
  await copy(path.join(tess, "dist", name), path.join(ocr, name));
await copy(path.join(tess, "LICENSE.md"), path.join(ocr, "TESSERACT-LICENSE"));
await copy(path.join(core, "LICENSE"), path.join(ocr, "CORE-LICENSE"));
for (const name of await fs.readdir(core))
  if (
    name.includes("lstm") &&
    (name.endsWith(".wasm") || name.endsWith(".wasm.js"))
  )
    await copy(path.join(core, name), path.join(ocr, name));
await copy(
  path.join(eng, "4.0.0_best_int/eng.traineddata.gz"),
  path.join(ocr, "eng.traineddata.gz"),
);
await fs.writeFile(
  path.join(vendor, "VERSIONS.txt"),
  "pdfjs-dist 6.4.299\nmammoth 1.13.0\ntesseract.js and tesseract.js-core 7.0.0\n@tesseract.js-data/eng 1.0.0 (4.0.0_best_int)\nLocally bundled; explicit local worker/core/language paths. No model weights for Ollama are included.\n",
);
const licenseRoot = path.join(root, "third-party-licenses");
await fs.mkdir(licenseRoot, { recursive: true });
const packages = new Map();
async function inspect(dir) {
  let pkg;
  try {
    pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
  } catch {
    return;
  }
  if (!pkg.name || !pkg.version) return;
  const key = pkg.name + "@" + pkg.version;
  if (packages.has(key)) return;
  const legal = (await fs.readdir(dir)).filter((n) =>
    /^(licen[sc]e|copying|notice|ofl)([.\-_]|$)/i.test(n),
  );
  const dest = path.join(licenseRoot, key.replaceAll("/", "__"));
  await fs.mkdir(dest, { recursive: true });
  for (const n of legal) {
    const stat = await fs.stat(path.join(dir, n));
    if (stat.isFile()) await copy(path.join(dir, n), path.join(dest, n));
  }
  await fs.writeFile(
    path.join(dest, "PACKAGE.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license || "See upstream",
        repository:
          typeof pkg.repository === "string"
            ? pkg.repository
            : pkg.repository?.url || null,
      },
      null,
      2,
    ) + "\n",
  );
  packages.set(key, true);
}
const store = path.join(root, "node_modules/.pnpm");
for (const entry of await fs.readdir(store)) {
  const modules = path.join(store, entry, "node_modules");
  let names;
  try {
    names = await fs.readdir(modules);
  } catch {
    continue;
  }
  for (const name of names) {
    if (name.startsWith("@")) {
      for (const child of await fs.readdir(path.join(modules, name)))
        await inspect(path.join(modules, name, child));
    } else await inspect(path.join(modules, name));
  }
}
const integrity = {};
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p);
    else {
      const rel = path.relative(root, p).split(path.sep).join("/");
      integrity[rel] = createHash("sha256")
        .update(await fs.readFile(p))
        .digest("hex");
    }
  }
}
await walk(vendor);
await walk(licenseRoot);
await fs.writeFile(
  path.join(root, "docs/vendor-integrity.json"),
  JSON.stringify(
    {
      algorithm: "sha256",
      packages: [...packages.keys()].sort(),
      files: integrity,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Vendored pinned dependencies and " +
    packages.size +
    " package license records.",
);

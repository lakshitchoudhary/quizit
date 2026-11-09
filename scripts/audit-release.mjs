import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const root = fileURLToPath(new URL("../", import.meta.url));
const roots = new Set([
  "extension",
  "scripts",
  "tests",
  "docs",
  "third-party-licenses",
  ".github",
]);
const top = new Set([
  "README.md",
  "SETUP.cmd",
  "readm.md",
  "LICENSE",
  "PRIVACY.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "pnpm-lock.yaml",
  ".gitignore",
]);
export async function releaseFiles() {
  const files = [];
  async function walk(dir = "") {
    for (const item of await readdir(resolve(root, dir), {
      withFileTypes: true,
    })) {
      if (!dir && ["node_modules", "dist", ".git"].includes(item.name))
        continue;
      if (!dir && !(roots.has(item.name) || top.has(item.name)))
        throw new Error(`Unexpected release entry: ${item.name}`);
      const path = [dir, item.name].filter(Boolean).join("/");
      if (item.isSymbolicLink()) throw new Error(`Symlink excluded: ${path}`);
      if (item.isDirectory()) await walk(path);
      else if (item.isFile()) files.push(path);
    }
  }
  await walk();
  return files.sort();
}
export async function audit() {
  const files = await releaseFiles();
  const issues = [];
  const rules = [
    [
      "personal-home-path",
      /(?:[a-z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\s/\\]+|\/home\/(?!web_user\b)[^\s/]+|\/Users\/[^\s/]+)/i,
    ],
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    [
      "provider-token",
      /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-proj-[A-Za-z0-9_-]{30,})/,
    ],
  ];
  for (const path of files) {
    if (
      /\.(?:pdf|docx|log|gguf|safetensors|zip)$/i.test(path) ||
      /(?:^|\/)\.env(?:\.|$)/.test(path)
    )
      issues.push(`${path}: forbidden artifact`);
    const bytes = await readFile(resolve(root, path));
    if (bytes.includes(0) || /\.(?:png|gz|wasm|bcmap|pfb|ttf)$/i.test(path))
      continue;
    const lines = bytes.toString("utf8").split("\n");
    for (let i = 0; i < lines.length; i++)
      for (const [name, pattern] of rules) {
        if (pattern.test(lines[i])) issues.push(`${path}:${i + 1}: ${name}`);
      }
  }
  const inventory = JSON.parse(
    await readFile(resolve(root, "docs/vendor-integrity.json"), "utf8"),
  );
  for (const [path, expected] of Object.entries(inventory.files)) {
    if (!files.includes(path))
      throw new Error(`Missing dependency file: ${path}`);
    const actual = createHash("sha256")
      .update(await readFile(resolve(root, path)))
      .digest("hex");
    if (actual !== expected)
      issues.push(`${path}: dependency integrity mismatch`);
  }
  if (issues.length) throw new Error(issues.join("\n"));
  console.log(
    `Release audit passed: ${files.length} allowlisted files; dependency hashes verified; no matching private-path or secret patterns. Pattern scanning is not a security guarantee.`,
  );
  return files;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await audit();

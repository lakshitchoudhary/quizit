import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { audit, root } from "./audit-release.mjs";

// Small ZIP32 writer: UTF-8 names, fixed timestamp, no host paths or metadata.
const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const local = [],
  central = [];
let offset = 0;
for (const path of await audit()) {
  const name = Buffer.from(`quizit/${path}`, "utf8");
  const raw = await readFile(resolve(root, path));
  const packed = deflateRawSync(raw, { level: 9 });
  const crc = crc32(raw),
    header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, packed);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(8, 10);
  record.writeUInt16LE(33, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(packed.length, 20);
  record.writeUInt32LE(raw.length, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt32LE(offset, 42);
  central.push(record, name);
  offset += header.length + name.length + packed.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22),
  count = central.length / 2;
if (count > 65535 || offset + directory.length > 0xffffffff)
  throw new Error("ZIP32 limit exceeded");
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const bytes = Buffer.concat([...local, directory, end]);
await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(resolve(root, "dist/Quizit-public-source.zip"), bytes);
await writeFile(
  resolve(root, "dist/SHA256SUMS.txt"),
  `${createHash("sha256").update(bytes).digest("hex")}  Quizit-public-source.zip\n`,
);
console.log(
  `Created dist/Quizit-public-source.zip (${count} files, ${bytes.length} bytes).`,
);

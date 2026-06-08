import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const starterRoot = path.join(root, "public", "starter");
const folders = [
  ["duas", "Dua"],
  ["surahs", "Surah"],
  ["quran", "Quran"],
  ["morning", "Morning"],
  ["evening", "Evening"],
  ["other", "Other"],
];
const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".jfif", ".webp", ".gif", ".pdf"]);

function titleFromFile(fileName) {
  return fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
}

function typeFromExtension(extension) {
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".jpg" || extension === ".jpeg" || extension === ".jfif") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

async function readFolder(folder, category) {
  const directory = path.join(starterRoot, folder);

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) => allowedExtensions.has(path.extname(entry.name).toLowerCase()))
        .map(async (entry) => {
          const extension = path.extname(entry.name).toLowerCase();
          const filePath = path.join(directory, entry.name);
          const bytes = await readFile(filePath);
          const hash = createHash("sha256").update(bytes).digest("hex");

          return {
            id: `starter-${hash.slice(0, 20)}`,
            title: titleFromFile(entry.name),
            category,
            fileName: entry.name,
            path: `/starter/${folder}/${entry.name}`,
            size: bytes.byteLength,
            type: typeFromExtension(extension),
            hash,
          };
        }),
    );

    return files;
  } catch {
    return [];
  }
}

const documents = (await Promise.all(folders.map(([folder, category]) => readFolder(folder, category))))
  .flat()
  .sort((a, b) => a.category.localeCompare(b.category) || a.fileName.localeCompare(b.fileName));

await writeFile(
  path.join(starterRoot, "manifest.json"),
  `${JSON.stringify({ app: "dua-library", version: 1, generatedAt: new Date().toISOString(), documents }, null, 2)}\n`,
);

console.log(`Generated starter manifest with ${documents.length} file(s).`);

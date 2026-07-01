/**
 * Replace locale-dependent date displays with formatDateTimeDdMmYyyy / formatDateDdMmYyyy.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

const REPLACEMENTS = [
  [
    /new Date\(([^)]+)\)\.toLocaleString\(\s*['"]en-IN['"]\s*\)/g,
    "formatDateTimeDdMmYyyy($1)",
  ],
  [
    /new Date\(([^)]+)\)\.toLocaleString\(\s*\)/g,
    "formatDateTimeDdMmYyyy($1)",
  ],
  [
    /new Date\(([^)]+)\)\.toLocaleDateString\(\s*['"]en-IN['"][^)]*\)/g,
    "formatDateDdMmYyyy($1)",
  ],
  [
    /new Date\(([^)]+)\)\.toLocaleDateString\(\s*\)/g,
    "formatDateDdMmYyyy($1)",
  ],
  [
    /(\w+)\.toLocaleString\(\s*undefined,\s*\{\s*dateStyle:\s*["']short["'],\s*timeStyle:\s*["']short["']\s*\}\s*\)/g,
    "formatDateTimeDdMmYyyy($1)",
  ],
  [
    /new Date\(([^)]+)\)\.toLocaleString\(\s*['"]en-IN['"],\s*\{\s*dateStyle:\s*['"]medium['"],\s*timeStyle:\s*['"]short['"]\s*\}\s*\)/g,
    "formatDateTimeDdMmYyyy($1)",
  ],
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (/\.(jsx|tsx|js)$/.test(name)) files.push(full);
  }
  return files;
}

function addDateImport(content, filePath, needDateTime) {
  const needsDate = content.includes("formatDateDdMmYyyy(");
  const needsDateTime = needDateTime && content.includes("formatDateTimeDdMmYyyy(");
  if (!needsDate && !needsDateTime) return content;

  const rel = path
    .relative(path.dirname(filePath), path.join(srcRoot, "utils", "dateDisplay.js"))
    .split(path.sep)
    .join("/")
    .replace(/\.js$/, "");
  const importPath = rel.startsWith(".") ? rel : `./${rel}`;

  const imports = [];
  if (needsDate && !/import\s*\{[^}]*formatDateDdMmYyyy/.test(content)) {
    imports.push("formatDateDdMmYyyy");
  }
  if (needsDateTime && !/import\s*\{[^}]*formatDateTimeDdMmYyyy/.test(content)) {
    imports.push("formatDateTimeDdMmYyyy");
  }
  if (!imports.length) return content;

  const existing = content.match(
    /import\s*\{([^}]+)\}\s*from\s*["'][^"']*dateDisplay["'];?/
  );
  if (existing) {
    const names = existing[1].split(",").map((s) => s.trim());
    const merged = [...new Set([...names, ...imports])].join(", ");
    return content.replace(existing[0], `import { ${merged} } from "${importPath}";`);
  }

  const line = `import { ${imports.join(", ")} } from "${importPath}";\n`;
  const lastImport = [...content.matchAll(/^import .+;$/gm)].pop();
  if (!lastImport) return line + content;
  const insertAt = lastImport.index + lastImport[0].length + 1;
  return content.slice(0, insertAt) + line + content.slice(insertAt);
}

let count = 0;
for (const file of walk(srcRoot)) {
  if (file.includes("dateDisplay.js")) continue;
  let content = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [re, rep] of REPLACEMENTS) {
    const next = content.replace(re, rep);
    if (next !== content) {
      content = next;
      changed = true;
    }
  }
  if (!changed) continue;
  content = addDateImport(content, file, true);
  fs.writeFileSync(file, content, "utf8");
  console.log("updated:", path.relative(srcRoot, file));
  count += 1;
}
console.log(`Done. ${count} file(s).`);

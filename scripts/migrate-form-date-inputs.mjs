/**
 * One-off migration: replace <input type="date"> with <FormDateInput>.
 * Run: node scripts/migrate-form-date-inputs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

const SKIP_FILES = new Set([
  "App.jsx",
  "DateInput.jsx",
  "FormDateInput.jsx",
  "dateInput.js",
  "dateDisplay.js",
]);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(jsx|tsx|js|ts)$/.test(name)) files.push(full);
  }
  return files;
}

function ensureImport(content, filePath) {
  if (content.includes("FormDateInput")) return content;
  const importLine =
    filePath.includes(`${path.sep}pages${path.sep}`) || filePath.includes("/pages/")
      ? 'import FormDateInput from "../../components/FormDateInput";\n'
      : 'import FormDateInput from "./components/FormDateInput";\n';

  // depth-based relative path
  const rel = path.relative(path.dirname(filePath), path.join(srcRoot, "components", "FormDateInput.jsx"));
  const normalized = rel.split(path.sep).join("/");
  const line = `import FormDateInput from "${normalized.replace(/\.jsx$/, "")}";\n`;

  if (content.includes(line.trim())) return content;

  const importMatch = content.match(/^import .+;\s*$/m);
  if (!importMatch) return line + content;

  const lastImportIdx = content.lastIndexOf("\nimport ");
  if (lastImportIdx === -1) {
    const first = content.indexOf("\n");
    return content.slice(0, first + 1) + line + content.slice(first + 1);
  }
  const lineEnd = content.indexOf("\n", lastImportIdx + 1);
  return content.slice(0, lineEnd + 1) + line + content.slice(lineEnd + 1);
}

function migrateFile(filePath) {
  if (SKIP_FILES.has(path.basename(filePath))) return false;
  let content = fs.readFileSync(filePath, "utf8");
  if (!/type=["']date["']/.test(content)) return false;

  const replaced = content.replace(
    /<input\b([^>]*?)\btype=["']date["']([^>]*?)(\/?)>/gi,
    (_, before, after, slash) => {
      const attrs = `${before} ${after}`.replace(/\s+/g, " ").trim();
      return `<FormDateInput ${attrs}${slash}>`;
    }
  );

  if (replaced === content) return false;

  const withImport = ensureImport(replaced, filePath);
  fs.writeFileSync(filePath, withImport, "utf8");
  console.log("updated:", path.relative(srcRoot, filePath));
  return true;
}

let count = 0;
for (const file of walk(srcRoot)) {
  if (migrateFile(file)) count += 1;
}
console.log(`Done. ${count} file(s) updated.`);

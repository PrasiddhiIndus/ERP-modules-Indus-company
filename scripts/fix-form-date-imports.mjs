/**
 * Add missing FormDateInput imports after migration.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (/\.(jsx|tsx)$/.test(name)) files.push(full);
  }
  return files;
}

function addImport(filePath, content) {
  const rel = path
    .relative(path.dirname(filePath), path.join(srcRoot, "components", "FormDateInput.jsx"))
    .split(path.sep)
    .join("/")
    .replace(/\.jsx$/, "");
  const line = `import FormDateInput from "${rel.startsWith(".") ? rel : `./${rel}`}";\n`;
  if (content.includes(line.trim())) return content;

  const lastImport = [...content.matchAll(/^import .+;$/gm)].pop();
  if (!lastImport) return line + content;
  const insertAt = lastImport.index + lastImport[0].length + 1;
  return content.slice(0, insertAt) + line + content.slice(insertAt);
}

let count = 0;
for (const file of walk(srcRoot)) {
  if (path.basename(file) === "FormDateInput.jsx") continue;
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes("FormDateInput")) continue;
  if (/import\s+FormDateInput\b/.test(content)) continue;
  fs.writeFileSync(file, addImport(file, content), "utf8");
  console.log("import added:", path.relative(srcRoot, file));
  count += 1;
}
console.log(`Done. ${count} file(s).`);

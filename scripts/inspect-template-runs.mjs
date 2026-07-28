import fs from "fs";
import PizZip from "pizzip";

const files = [
  "c:/Users/Amit/Downloads/Relieving Letter.docx",
  "c:/Users/Amit/Downloads/No Due Certificate.docx",
  "c:/Users/Amit/Downloads/Experience Letter.docx",
];

for (const f of files) {
  const xml = new PizZip(fs.readFileSync(f)).file("word/document.xml").asText();
  const nodes = [...xml.matchAll(/<w:t(?: xml:space="preserve")?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  console.log("\n=== " + f.split("/").pop() + " (" + nodes.length + " runs) ===");
  nodes.forEach((t, i) => {
    if (t.trim()) console.log(String(i).padStart(3) + ": " + JSON.stringify(t));
  });
}

/**
 * Tiny front-matter + markdown parser for QA manual content (no extra deps).
 */

export function parseFrontMatter(raw) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    return { meta: {}, body: text };
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: text };
  const fm = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n/, "");
  const meta = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      try {
        meta[key] = JSON.parse(val.replace(/'/g, '"'));
      } catch {
        meta[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""));
      }
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      meta[key] = val.slice(1, -1);
    } else if (/^\d+$/.test(val)) {
      meta[key] = Number(val);
    } else {
      meta[key] = val;
    }
  }
  return { meta, body };
}

function inline(text) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) parts.push({ type: "strong", value: tok.slice(2, -2) });
    else if (tok.startsWith("*")) parts.push({ type: "em", value: tok.slice(1, -1) });
    else parts.push({ type: "code", value: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

export function parseMarkdownBlocks(body) {
  const lines = String(body || "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      const text = quote.join(" ");
      let kind = "info";
      if (/^\*\*Be careful:\*\*/i.test(text)) kind = "warning";
      else if (/^\*\*You can't do this/i.test(text)) kind = "neutral";
      else if (/^\*\*Remember:\*\*/i.test(text)) kind = "info";
      blocks.push({ type: "callout", kind, parts: inline(text) });
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        if (!/^\s*:?-+:?\s*$/.test(cells.join(""))) rows.push(cells.map((c) => inline(c)));
        i += 1;
      }
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push({ type: "heading", level, parts: inline(line.replace(/^#+\s*/, "")) });
      i += 1;
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\d+\.\s/, "")));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^[-*]\s/, "")));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,3}\s/.test(lines[i]) && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !lines[i].startsWith("|") && !lines[i].startsWith("> ")) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", parts: inline(para.join(" ")) });
  }
  return blocks;
}

export function plainTextFromParts(parts) {
  return (parts || []).map((p) => p.value || "").join("");
}

export function sectionSearchText(section) {
  const chunks = [section.title, section.id];
  for (const b of section.blocks || []) {
    if (b.parts) chunks.push(plainTextFromParts(b.parts));
    if (b.items) b.items.forEach((it) => chunks.push(plainTextFromParts(it)));
    if (b.rows) b.rows.forEach((row) => row.forEach((cell) => chunks.push(plainTextFromParts(cell))));
  }
  return chunks.join(" ").toLowerCase();
}

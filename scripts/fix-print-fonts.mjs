import fs from 'fs';

// Invoice HTML preview — map print faces to INDUS stacks (typography only)
{
  const p = 'src/pages/billing/components/InvoiceHtmlPreview.jsx';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replaceAll("fontFamily: \"'Times New Roman', serif\"", "fontFamily: 'var(--font-sans)'");
  s = s.replaceAll("fontFamily: \"'Courier New', monospace\"", "fontFamily: 'var(--font-mono)'");
  // also single-quoted variants if any
  s = s.replaceAll("fontFamily: \"'Times New Roman', serif\"", "fontFamily: 'var(--font-sans)'");
  fs.writeFileSync(p, s);
  console.log('InvoiceHtmlPreview fonts', (s.match(/Times New Roman/g) || []).length, 'times left', (s.match(/Courier New/g) || []).length, 'courier left');
}

{
  const p = 'src/pages/projects/quotation/quotationPrint.js';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(
    /font-family:\s*"Times New Roman",\s*Times,\s*serif;/g,
    'font-family: var(--font-sans); font-size: 11pt;'
  );
  fs.writeFileSync(p, s);
  console.log('quotationPrint.js updated');
}

{
  const p = 'src/pages/projects/quotation/quotationPrint.css';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('font-family')) {
    s = `/* Quotation print / preview typography */\n.quotation-preview {\n  font-family: var(--font-sans);\n  font-size: 11pt;\n  line-height: 1.45;\n  font-style: normal;\n}\n.quotation-preview .qp-num,\n.quotation-preview [data-numeric],\n.quotation-preview td.num {\n  font-family: var(--font-mono);\n  font-variant-numeric: tabular-nums;\n}\n\n` + s;
  } else {
    s = s.replace(/font-family:[^;]+;/g, 'font-family: var(--font-sans);');
  }
  fs.writeFileSync(p, s);
  console.log('quotationPrint.css updated');
}

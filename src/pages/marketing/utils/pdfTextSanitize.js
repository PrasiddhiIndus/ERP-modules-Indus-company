const REPLACEMENTS = [
  [/\u20B9/g, 'Rs.'],
  [/\u00A0/g, ' '],
  [/\u2022|\u25CF|\u25E6|\u2023|\u2043|\u2219|\u25AA|\u25AB/g, '-'],
  [/\u2013|\u2014|\u2010|\u2011/g, '-'],
  [/\u2018|\u2019|\u2032/g, "'"],
  [/\u201C|\u201D|\u2033/g, '"'],
  [/\u00B0/g, ' deg'],
  [/\u00B1/g, '+/-'],
  [/\u00D7/g, 'x'],
  [/\u00F7/g, '/'],
  [/\u2122/g, 'TM'],
  [/\u00AE/g, '(R)'],
  [/\u00A9/g, '(C)'],
  [/\u2192|\u2190|\u2194|\u21D2|\u21D0/g, '->'],
  [/\u2264/g, '<='],
  [/\u2265/g, '>='],
  [/\u2248/g, '~'],
  [/\u00B2/g, '2'],
  [/\u00B3/g, '3'],
  [/\u00BC|\u00BD|\u00BE/g, ' '],
  [/\uFFFD/g, ''],
  [/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, ''],
  [/\u00E6|\u00C6/g, 'ae'],
  [/\u0153|\u0152/g, 'oe'],
  [/\u0192/g, 'f'],
  // Common mojibake / Word paste that broke Helvetica PDFs into "ð" / "Â" glitches
  [/\u00F0|\u00D0/g, ''],
  [/\u00C2|\u00A2/g, ''],
];

function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      return n > 31 && n < 127 ? String.fromCharCode(n) : ' ';
    });
}

/** Strip/replace characters that break jsPDF Helvetica rendering. */
export function sanitizePdfText(text) {
  if (text === null || text === undefined) return '';
  let out = decodeHtmlEntities(String(text));
  REPLACEMENTS.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });
  out = out.replace(/\s+/g, ' ').trim();
  // Helvetica WinAnsi: keep printable ASCII only (avoids garbled ð / Â junk on PDF pages)
  out = out.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Match sheet rows to People Master records on this site's roster.
 * Order: exact employee code → exact name → fuzzy name (only when one
 * candidate clearly wins). Everything else is left unmatched for the user.
 */

export const FUZZY_NAME_THRESHOLD = 0.9;

export function normalizeCode(code) {
  const s = String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d+(\.0+)?$/.test(s)) return String(Number(s)); // "009162" / "9162.0" → "9162"
  return s;
}

export function nameTokens(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["mr", "mrs", "ms", "bhai", "ben"].includes(t));
}

function tokenKey(name) {
  return nameTokens(name).sort().join(" ");
}

/** Jaro-Winkler similarity, 0..1. */
export function jaroWinkler(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array(a.length).fill(false);
  const bMatch = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j += 1) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches += 1;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k += 1;
    if (a[i] !== b[k]) t += 1;
    k += 1;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] && a[prefix] === b[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Order-insensitive name similarity: best pairing of tokens. */
export function nameSimilarity(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set();
  let sum = 0;
  short.forEach((t) => {
    let best = 0;
    let bestIdx = -1;
    long.forEach((u, idx) => {
      if (used.has(idx)) return;
      const s = jaroWinkler(t, u);
      if (s > best) {
        best = s;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) used.add(bestIdx);
    sum += best;
  });
  // Penalise missing tokens lightly so "Vipul" alone never auto-matches.
  return (sum / short.length) * (0.75 + 0.25 * (short.length / long.length));
}

/**
 * @param {{rowKey, rawCode, rawName}} row
 * @param {object[]} roster people on the site's roster (have id, unique_code, full_name)
 * @returns {{ personId: number|null, method: "code"|"name"|"fuzzy"|null, confidence: number, note?: string, candidates?: object[] }}
 */
export function matchPerson(row, roster) {
  const code = normalizeCode(row.rawCode);
  if (code) {
    const byCode = roster.filter((p) => normalizeCode(p.unique_code) === code);
    if (byCode.length === 1) {
      const person = byCode[0];
      const sim = row.rawName ? nameSimilarity(row.rawName, person.full_name) : 1;
      return {
        personId: person.id,
        method: "code",
        confidence: 1,
        note: row.rawName && sim < 0.6 ? `Code ${row.rawCode} matched, but name "${row.rawName}" differs from "${person.full_name}"` : undefined,
      };
    }
  }

  const key = tokenKey(row.rawName);
  if (key) {
    const exact = roster.filter((p) => tokenKey(p.full_name) === key);
    if (exact.length === 1) {
      return {
        personId: exact[0].id,
        method: "name",
        confidence: code ? 0.9 : 0.95,
        note: code ? `Code ${row.rawCode} not on this site's roster; matched by name` : undefined,
      };
    }
    const scored = roster
      .map((p) => ({ person: p, score: nameSimilarity(row.rawName, p.full_name) }))
      .sort((x, y) => y.score - x.score);
    const best = scored[0];
    const second = scored[1];
    if (best && best.score >= FUZZY_NAME_THRESHOLD && (!second || best.score - second.score >= 0.05)) {
      return {
        personId: best.person.id,
        method: "fuzzy",
        confidence: Math.round(best.score * 100) / 100,
        note: `Name matched approximately to "${best.person.full_name}" — please confirm`,
      };
    }
    return {
      personId: null,
      method: null,
      confidence: 0,
      note: code ? `Code ${row.rawCode} / "${row.rawName}" not found on this site's roster` : `"${row.rawName}" not found on this site's roster`,
      candidates: scored.slice(0, 3).filter((s) => s.score >= 0.6).map((s) => s.person),
    };
  }
  return { personId: null, method: null, confidence: 0, note: `Code ${row.rawCode} not found on this site's roster` };
}

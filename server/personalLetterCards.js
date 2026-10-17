/**
 * Personal letters — birthday & wedding-anniversary greeting cards.
 *
 * At 08:00 IST (and later the same day if the server was down), finds active
 * employees whose date_of_birth / date_of_anniversary falls today, personalizes
 * a random Indus 4K template (replacing the [Name] placeholder with full_name),
 * uploads to R2 when configured, and inserts admin_personal_letters.
 *
 * PERSONAL_LETTER_CARDS=off disables the job.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const CHECK_EVERY_MS = 15 * 60 * 1000;
const RUN_AT_IST_HOUR = 8;
const TABLE = 'admin_personal_letters';
const R2_PREFIX = 'admin-personal-letters/';
const IMAGE_W = 3840;
const IMAGE_H = 3840;

/**
 * Candidate folders under public/ for birthday / anniversary JPGs.
 * Resolved at generate-time so newly dropped templates are picked up without restart.
 */
function templateDirCandidates(kind) {
  const root = process.cwd();
  const publicRoot = path.join(root, 'public');
  const known =
    kind === 'anniversary'
      ? [
          path.join(publicRoot, 'templates', 'personal-letters', 'anniversary'),
          path.join(publicRoot, 'indus_anniversary_templates_4K', 'indus_anniversary_templates_4K'),
          path.join(publicRoot, 'indus_anniversary_templates_4K'),
        ]
      : [
          path.join(publicRoot, 'templates', 'personal-letters', 'birthday'),
          path.join(publicRoot, 'indus_birthday_templates_4K (2)', 'indus_birthday_templates_4K'),
          path.join(publicRoot, 'indus_birthday_templates_4K (2)'),
          path.join(publicRoot, 'indus_birthday_templates_4K'),
        ];

  const needle = kind === 'anniversary' ? /annivers/i : /birthday/i;
  const discovered = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3 || !fs.existsSync(dir)) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const hasJpg = entries.some((e) => e.isFile() && /\.jpe?g$/i.test(e.name));
    if (hasJpg && needle.test(dir)) discovered.push(dir);
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(publicRoot);

  return [...new Set([...known, ...discovered])];
}

function listTemplatesDetailed(dir) {
  if (!fs.existsSync(dir)) return [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f));
  } catch {
    return [];
  }
  return names
    .map((file) => {
      const absolutePath = path.join(dir, file);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(absolutePath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { file, absolutePath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.file.localeCompare(b.file));
}

/** Prefer the public folder whose templates were updated most recently. */
function resolveTemplateDir(kind) {
  let best = null;
  let bestMtime = -1;
  for (const dir of templateDirCandidates(kind)) {
    const files = listTemplatesDetailed(dir);
    if (!files.length) continue;
    const newest = files[0].mtimeMs;
    if (newest >= bestMtime) {
      bestMtime = newest;
      best = dir;
    }
  }
  return (
    best ||
    (kind === 'anniversary'
      ? path.join(process.cwd(), 'public', 'templates', 'personal-letters', 'anniversary')
      : path.join(process.cwd(), 'public', 'templates', 'personal-letters', 'birthday'))
  );
}

function listTemplates(dir) {
  return listTemplatesDetailed(dir).map((f) => f.file);
}

/** Calibrated cover/draw regions for the baked-in "[Name]," placeholder (4K square templates). */
const LAYOUTS = {
  birthday: {
    coverX: 430,
    coverY: 1688,
    coverW: 1680,
    coverH: 110,
    textX: 468,
    textBaselineY: 1772,
    maxFont: 84,
    minFont: 44,
    color: '#8b1b1a',
    bg: '#fdfdfd',
  },
  anniversary: {
    coverX: 390,
    coverY: 1788,
    coverW: 1680,
    coverH: 100,
    textX: 426,
    textBaselineY: 1864,
    maxFont: 78,
    minFont: 40,
    color: '#8b1b1a',
    bg: '#f8f4e9',
  },
};

function istNow(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000);
}

function istHour(now = new Date()) {
  return istNow(now).getUTCHours();
}

function istTodayIso(now = new Date()) {
  return istNow(now).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD / dd-mm-yyyy / timestamp into { month:0-11, day }. */
function parseMonthDay(dateStr) {
  const raw = String(dateStr || '').trim();
  if (!raw) return null;
  let y;
  let m;
  let d;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (!dmy) return null;
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  }
  if (!y || !m || !d) return null;
  return { month: m - 1, day: d };
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isSameMonthDay(dateStr, ref) {
  const md = parseMonthDay(dateStr);
  if (!md) return false;
  const day = Math.min(md.day, daysInMonth(ref.getFullYear(), md.month));
  const occurrence = new Date(ref.getFullYear(), md.month, day);
  return occurrence.getMonth() === ref.getMonth() && occurrence.getDate() === ref.getDate();
}

function isActiveEmployee(e) {
  return String(e?.status || '').trim().toLowerCase() !== 'inactive';
}

function employeesWithBirthdayToday(employees, refDate) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      e?.birthday_reminder !== false &&
      e.date_of_birth &&
      isSameMonthDay(e.date_of_birth, refDate)
  );
}

function employeesWithAnniversaryToday(employees, refDate) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      e?.anniversary_reminder !== false &&
      e.date_of_anniversary &&
      isSameMonthDay(e.date_of_anniversary, refDate)
  );
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pickTemplate(kind) {
  const dir = resolveTemplateDir(kind);
  const files = listTemplatesDetailed(dir);
  if (!files.length) {
    throw new Error(
      `No ${kind} templates found under public/. Add JPGs to public/templates/personal-letters/${kind}/ (or the Indus 4K template folders).`
    );
  }
  // Random among current templates in the newest folder (all are "latest set").
  const chosen = files[Math.floor(Math.random() * files.length)];
  return { dir, file: chosen.file, absolutePath: chosen.absolutePath };
}

/** Find a named template file across public folders (latest folder first). */
function resolveTemplateFile(kind, templateFile) {
  const name = String(templateFile || '').trim();
  if (!name) return '';
  const dirs = [resolveTemplateDir(kind), ...templateDirCandidates(kind)];
  const seen = new Set();
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const absolutePath = path.join(dir, name);
    if (fs.existsSync(absolutePath)) return absolutePath;
  }
  return '';
}

/** Rough Arial-bold width estimate so long names still fit the cover band. */
export function fitFontSize(text, maxWidth, maxFont, minFont) {
  let size = maxFont;
  const approx = (s, font) => String(s).length * font * 0.56;
  while (size > minFont && approx(text, size) > maxWidth) size -= 2;
  return size;
}

export async function renderPersonalLetterCard({ kind, fullName, templatePath }) {
  const layout = LAYOUTS[kind] || LAYOUTS.birthday;
  const label = String(fullName || '').trim() || 'Colleague';
  const text = label.endsWith(',') ? label : `${label},`;
  const fontSize = fitFontSize(text, layout.coverW - 24, layout.maxFont, layout.minFont);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${IMAGE_W}" height="${IMAGE_H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${layout.coverX}" y="${layout.coverY}" width="${layout.coverW}" height="${layout.coverH}" fill="${layout.bg}"/>
  <text x="${layout.textX}" y="${layout.textBaselineY}"
        font-family="Arial, Helvetica, DejaVu Sans, sans-serif"
        font-weight="700" font-size="${fontSize}" fill="${layout.color}">${escapeXml(text)}</text>
</svg>`;

  return sharp(templatePath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

function safeFileStem(name) {
  return String(name || 'employee')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'employee';
}

async function uploadCard(getR2Client, getR2Bucket, { kind, employeeId, occasionDate, fullName, buffer }) {
  if (!getR2Client || !getR2Bucket) return null;
  let client;
  let bucket;
  try {
    client = getR2Client();
    bucket = getR2Bucket();
  } catch {
    return null;
  }
  if (!client || !bucket) return null;

  const fileName = `${safeFileStem(fullName)}-${kind}-${occasionDate}.jpg`;
  const objectKey = `${R2_PREFIX}${employeeId}/${occasionDate}/${kind}-${Date.now()}.jpg`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: 'image/jpeg',
    })
  );
  return { objectKey, fileName, contentType: 'image/jpeg', fileSize: buffer.length };
}

async function loadOccasionEmployees(svc) {
  const { data, error } = await svc
    .from('admin_ifsp_employee_master')
    .select(
      'id, employee_code, full_name, status, date_of_birth, date_of_anniversary, birthday_reminder, anniversary_reminder'
    )
    .not('status', 'ilike', 'inactive');
  if (error) throw error;
  return data || [];
}

async function createOneCard(svc, deps, { employee, kind, occasionDate }) {
  const fullName = String(employee.full_name || '').trim() || employee.employee_code || 'Colleague';
  const { file, absolutePath } = pickTemplate(kind);
  const buffer = await renderPersonalLetterCard({
    kind,
    fullName,
    templatePath: absolutePath,
  });

  const uploaded = await uploadCard(deps.getR2Client, deps.getR2Bucket, {
    kind,
    employeeId: employee.id,
    occasionDate,
    fullName,
    buffer,
  });

  const subject =
    kind === 'anniversary'
      ? `Happy Wedding Anniversary — ${fullName}`
      : `Happy Birthday — ${fullName}`;

  const row = {
    employee_master_id: employee.id,
    letter_kind: kind,
    occasion_date: occasionDate,
    subject,
    employee_full_name: fullName,
    template_file: file,
    object_key: uploaded?.objectKey || null,
    file_name: uploaded?.fileName || `${safeFileStem(fullName)}-${kind}-${occasionDate}.jpg`,
    content_type: 'image/jpeg',
    file_size: buffer.length,
  };

  const { data, error } = await svc.from(TABLE).insert(row).select('*').single();
  if (error) {
    // Unique violation = already generated today
    if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
      return { skipped: true, reason: 'already exists' };
    }
    throw error;
  }
  return { created: data, buffer: uploaded ? null : buffer };
}

/**
 * Generate today's birthday / anniversary cards.
 * @returns {{ created: number, skipped: number, failed: number, occasionDate: string }}
 */
export async function runPersonalLetterCards(svc, deps = {}, { now = new Date() } = {}) {
  const occasionDate = istTodayIso(now);
  const employees = await loadOccasionEmployees(svc);
  // Use IST calendar day as the "today" reference for month/day matching.
  const ist = istNow(now);
  const refDate = new Date(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());

  const birthdays = employeesWithBirthdayToday(employees, refDate);
  const anniversaries = employeesWithAnniversaryToday(employees, refDate);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const jobs = [
    ...birthdays.map((employee) => ({ employee, kind: 'birthday' })),
    ...anniversaries.map((employee) => ({ employee, kind: 'anniversary' })),
  ];

  for (const job of jobs) {
    try {
      const out = await createOneCard(svc, deps, {
        employee: job.employee,
        kind: job.kind,
        occasionDate,
      });
      if (out?.skipped) skipped += 1;
      else created += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        '[personal-letters] card failed',
        job.kind,
        job.employee?.employee_code,
        err?.message || err
      );
    }
  }

  return {
    created,
    skipped,
    failed,
    occasionDate,
    birthdayCount: birthdays.length,
    anniversaryCount: anniversaries.length,
  };
}

/** Re-render a stored letter from its template + name (used when R2 key is missing). */
export async function renderStoredPersonalLetter(row) {
  const kind = row.letter_kind === 'anniversary' ? 'anniversary' : 'birthday';
  let templatePath = resolveTemplateFile(kind, row.template_file);
  // If the stored file name is gone, fall back to a current template from public/.
  if (!templatePath) {
    const fallback = pickTemplate(kind);
    templatePath = fallback.absolutePath;
  }
  if (!templatePath || !fs.existsSync(templatePath)) {
    throw new Error('Greeting card template is missing on the server.');
  }
  return renderPersonalLetterCard({
    kind,
    fullName: row.employee_full_name,
    templatePath,
  });
}

export function startPersonalLetterCards({
  getSupabaseUrl,
  getServiceKey,
  getR2Client,
  getR2Bucket,
}) {
  if (String(process.env.PERSONAL_LETTER_CARDS || '').toLowerCase() === 'off') {
    console.log('[personal-letters] cards disabled (PERSONAL_LETTER_CARDS=off)');
    return null;
  }
  if (!getSupabaseUrl() || !getServiceKey()) {
    console.warn('[personal-letters] cards not started — Supabase service settings missing');
    return null;
  }

  const bdayDir = resolveTemplateDir('birthday');
  const annDir = resolveTemplateDir('anniversary');
  const bdayCount = listTemplates(bdayDir).length;
  const annCount = listTemplates(annDir).length;
  console.log(
    `[personal-letters] latest templates: birthday=${bdayCount} (${bdayDir}), anniversary=${annCount} (${annDir})`
  );
  if (!bdayCount || !annCount) {
    console.warn(
      '[personal-letters] template folders empty — place JPGs under public/templates/personal-letters/{birthday,anniversary}/ or the Indus 4K folders'
    );
  }

  const deps = { getR2Client, getR2Bucket };
  let lastRunDate = '';

  const tick = async () => {
    if (istHour() < RUN_AT_IST_HOUR) return;
    const today = istTodayIso();
    // Still re-check after first pass so late employees / retries can fill gaps;
    // unique constraint makes repeats cheap.
    try {
      const svc = createClient(getSupabaseUrl(), getServiceKey(), {
        auth: { persistSession: false },
      });
      const out = await runPersonalLetterCards(svc, deps);
      if (out.created || out.failed || today !== lastRunDate) {
        console.log('[personal-letters] run:', JSON.stringify(out));
      }
      lastRunDate = today;
    } catch (err) {
      console.warn('[personal-letters] run failed:', err?.message || err);
    }
  };

  const first = setTimeout(tick, 90_000);
  const timer = setInterval(tick, CHECK_EVERY_MS);
  first.unref?.();
  timer.unref?.();
  return timer;
}

export const PERSONAL_LETTERS_R2_PREFIX = R2_PREFIX;
export const PERSONAL_LETTERS_TABLE = TABLE;

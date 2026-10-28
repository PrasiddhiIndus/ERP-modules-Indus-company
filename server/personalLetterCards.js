/**
 * Personal letters — birthday & wedding-anniversary greeting cards.
 *
 * At 05:00 IST (and later the same day if the server was down), finds active
 * employees whose date_of_birth / date_of_anniversary falls today, personalizes
 * a random Indus 4K template (replacing the [Name] placeholder with full_name),
 * uploads to R2 when configured, and inserts admin_personal_letters.
 *
 * WhatsApp (Indus One outbox → send-whatsapp-notification):
 *  - celebration_self to the celebrant (card image header)
 *  - celebration_peer to every other active employee with a mobile (same card image)
 *
 * PERSONAL_LETTER_CARDS=off disables the job.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

/** Lazy-load sharp so a missing install does not crash the whole API process at boot. */
async function getSharp() {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch (err) {
    const detail = err?.message || String(err);
    const e = new Error(
      `Greeting-card image library is not available (${detail}). ` +
        `On production, Node.js 18.17+ is required with sharp ~0.34 (Node 20+ if using sharp 0.35+). ` +
        `Run npm install in the project root, then restart the API server.`
    );
    e.status = 503;
    throw e;
  }
}

const CHECK_EVERY_MS = 15 * 60 * 1000;
/** IST hour when the daily job may first run (override with PERSONAL_LETTER_CARDS_HOUR). */
const RUN_AT_IST_HOUR = (() => {
  const raw = Number(process.env.PERSONAL_LETTER_CARDS_HOUR);
  return Number.isFinite(raw) && raw >= 0 && raw <= 23 ? Math.floor(raw) : 5;
})();
const TABLE = 'admin_personal_letters';
const R2_PREFIX = 'admin-personal-letters/';
const IMAGE_W = 3840;
const IMAGE_H = 3840;
/** PostgREST caps a single select; page like Admin Ops Dashboard so birthdays past row 1000 are not missed. */
const EMPLOYEE_PAGE_SIZE = 1000;
const MAX_EMPLOYEE_PAGES = 20;

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

  const sharp = await getSharp();
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

/** India default MSISDN for Meta WhatsApp Cloud API. */
function normalizeWhatsAppMsisdn(raw, defaultCountryCode = '91') {
  if (!raw) return null;
  let digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  const cc = String(defaultCountryCode).replace(/\D+/g, '') || '91';
  if (digits.length === 10) digits = `${cc}${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) digits = `${cc}${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

async function resolveEmployeeWhatsAppPhone(svc, employee) {
  const code = String(employee?.employee_code || '').trim();
  // Prefer Indus One profile mobile (same source as leave/tour WhatsApp).
  if (code) {
    try {
      const { data: ioRows } = await svc
        .schema('indus_one')
        .from('profiles')
        .select('mobile_number')
        .eq('employee_code', code)
        .not('mobile_number', 'is', null)
        .limit(5);
      for (const row of ioRows || []) {
        const fromIo = normalizeWhatsAppMsisdn(row?.mobile_number);
        if (fromIo) return fromIo;
      }
    } catch (err) {
      console.warn('[personal-letters] Indus One mobile lookup failed:', err?.message || err);
    }
  }
  return normalizeWhatsAppMsisdn(employee?.personal_no);
}

function celebrationOccasionLabel(kind) {
  return kind === 'anniversary' ? 'wedding anniversary' : 'birthday';
}

function safeCelebrationName(fullName, fallback) {
  return (
    String(fullName || fallback || 'Colleague')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/ {4,}/g, ' ')
      .trim() || 'Colleague'
  );
}

async function requestWhatsAppDrain(svc) {
  try {
    await svc.schema('indus_one').rpc('request_whatsapp_outbox_drain');
  } catch {
    /* cron still drains */
  }
}

/** Map employee_code → WhatsApp MSISDN for every active employee who has a mobile. */
export async function loadEmployeeWhatsAppPhoneMap(svc, employees) {
  const profilePhone = new Map();
  for (let page = 0; page < MAX_EMPLOYEE_PAGES; page += 1) {
    const from = page * EMPLOYEE_PAGE_SIZE;
    const { data, error } = await svc
      .schema('indus_one')
      .from('profiles')
      .select('employee_code, mobile_number')
      .not('mobile_number', 'is', null)
      .range(from, from + EMPLOYEE_PAGE_SIZE - 1);
    if (error) {
      console.warn('[personal-letters] profile phone map failed:', error.message || error);
      break;
    }
    for (const row of data || []) {
      const code = String(row.employee_code || '').trim();
      const phone = normalizeWhatsAppMsisdn(row.mobile_number);
      if (code && phone) profilePhone.set(code, phone);
    }
    if (!data || data.length < EMPLOYEE_PAGE_SIZE) break;
  }

  const map = new Map();
  for (const emp of employees || []) {
    const code = String(emp?.employee_code || '').trim();
    if (!code) continue;
    const phone = profilePhone.get(code) || normalizeWhatsAppMsisdn(emp?.personal_no);
    if (phone) map.set(code, phone);
  }
  return map;
}

/**
 * Queue Meta WhatsApp self-wish (indus_celebration_self) with card image header.
 * Body: Dear {{1}}, Warm wishes on your {{2}}!
 */
async function enqueueCelebrationSelf(
  svc,
  { letterId, employee, kind, fullName, occasionDate, objectKey, phoneByCode }
) {
  const code = String(employee?.employee_code || '').trim();
  if (!letterId || !code) {
    return { queued: false, reason: 'missing_letter_or_code' };
  }
  const phone =
    (phoneByCode && phoneByCode.get(code)) || (await resolveEmployeeWhatsAppPhone(svc, employee));
  if (!phone) {
    console.warn('[personal-letters] WhatsApp self skipped — no mobile for', code);
    return { queued: false, reason: 'no_mobile' };
  }

  const occasionLabel = celebrationOccasionLabel(kind);
  const safeName = safeCelebrationName(fullName, code);
  const object_key = String(objectKey || '').trim().replace(/^\/+/, '') || null;
  const { data, error } = await svc
    .schema('indus_one')
    .from('approval_whatsapp_outbox')
    .insert({
      module_code: 'personal_letter',
      entity_id: letterId,
      event_type: 'celebration_self',
      recipient_employee_code: code,
      recipient_phone: phone,
      template_key: 'celebration_self',
      template_params: [safeName, occasionLabel],
      language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
      metadata: {
        role: 'self',
        letter_kind: kind,
        occasion_date: occasionDate,
        recipient_type: 'individual',
        source: 'admin_personal_letters',
        ...(object_key ? { object_key } : {}),
      },
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
      return { queued: false, reason: 'already_queued' };
    }
    console.warn('[personal-letters] WhatsApp self enqueue failed', code, error.message || error);
    return { queued: false, reason: error.message || 'enqueue_failed' };
  }

  return { queued: true, outboxId: data?.id || null, phone };
}

/**
 * Queue Meta WhatsApp peer notices (indus_celebration_peer) to all employees with a mobile,
 * except the celebrant. Template requires IMAGE header (greeting card) + body
 * {{1}} name, {{2}} birthday | wedding anniversary.
 */
async function enqueueCelebrationPeers(
  svc,
  { letterId, celebrantCode, kind, fullName, occasionDate, objectKey, phoneByCode }
) {
  const celebrant = String(celebrantCode || '').trim();
  if (!letterId || !celebrant || !phoneByCode?.size) {
    return { queued: 0, skipped: 0, reason: 'missing_letter_or_recipients' };
  }

  const occasionLabel = celebrationOccasionLabel(kind);
  const safeName = safeCelebrationName(fullName, celebrant);
  const object_key = String(objectKey || '').trim().replace(/^\/+/, '') || null;
  if (!object_key) {
    console.warn('[personal-letters] WhatsApp peer skipped — no card image for', celebrant);
    return { queued: 0, skipped: phoneByCode.size, reason: 'no_card_image' };
  }

  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';
  const rows = [];
  for (const [code, phone] of phoneByCode) {
    if (code === celebrant) continue;
    rows.push({
      module_code: 'personal_letter',
      entity_id: letterId,
      event_type: 'celebration_peer',
      recipient_employee_code: code,
      recipient_phone: phone,
      template_key: 'celebration_peer',
      template_params: [safeName, occasionLabel],
      language,
      metadata: {
        role: 'peer',
        letter_kind: kind,
        occasion_date: occasionDate,
        celebrant_code: celebrant,
        recipient_type: 'individual',
        object_key,
        source: 'admin_personal_letters',
      },
    });
  }

  let queued = 0;
  let skipped = 0;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await svc
      .schema('indus_one')
      .from('approval_whatsapp_outbox')
      .upsert(chunk, {
        onConflict: 'module_code,entity_id,event_type,recipient_employee_code,template_key',
        ignoreDuplicates: true,
      })
      .select('id');

    if (!error) {
      queued += (data || []).length;
      skipped += chunk.length - (data || []).length;
      continue;
    }

    // Fallback: insert one-by-one so one duplicate does not block the batch.
    for (const row of chunk) {
      const { error: oneErr } = await svc
        .schema('indus_one')
        .from('approval_whatsapp_outbox')
        .insert(row);
      if (oneErr) {
        if (oneErr.code === '23505' || /duplicate|unique/i.test(oneErr.message || '')) {
          skipped += 1;
        } else {
          skipped += 1;
          console.warn(
            '[personal-letters] WhatsApp peer enqueue failed',
            row.recipient_employee_code,
            oneErr.message || oneErr
          );
        }
      } else {
        queued += 1;
      }
    }
  }

  return { queued, skipped, total: rows.length };
}

/** Load all active employees for occasion matching (paginated — PostgREST row cap). */
export async function loadOccasionEmployees(svc) {
  const select =
    'id, employee_code, full_name, status, date_of_birth, date_of_anniversary, birthday_reminder, anniversary_reminder, personal_no';
  const rows = [];
  for (let page = 0; page < MAX_EMPLOYEE_PAGES; page += 1) {
    const from = page * EMPLOYEE_PAGE_SIZE;
    const { data, error } = await svc
      .from('admin_ifsp_employee_master')
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + EMPLOYEE_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < EMPLOYEE_PAGE_SIZE) break;
  }
  // Match dashboard: only exclude literal "inactive"; NULL/empty status stays eligible.
  return rows.filter(isActiveEmployee);
}

async function createOneCard(svc, deps, { employee, kind, occasionDate, phoneByCode }) {
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
    // Unique violation = already generated today — still try WhatsApp (idempotent outbox).
    if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
      const { data: existing } = await svc
        .from(TABLE)
        .select('id, object_key')
        .eq('employee_master_id', employee.id)
        .eq('letter_kind', kind)
        .eq('occasion_date', occasionDate)
        .maybeSingle();
      let whatsapp = { queued: false, reason: 'no_existing_letter' };
      if (existing?.id) {
        whatsapp = await enqueueCelebrationSelf(svc, {
          letterId: existing.id,
          employee,
          kind,
          fullName,
          occasionDate,
          objectKey: existing.object_key,
          phoneByCode,
        });
      }
      return {
        skipped: true,
        reason: 'already exists',
        letter: existing || null,
        fullName,
        whatsapp,
      };
    }
    throw error;
  }

  const objectKey = data.object_key || uploaded?.objectKey || null;
  const whatsapp = await enqueueCelebrationSelf(svc, {
    letterId: data.id,
    employee,
    kind,
    fullName,
    occasionDate,
    objectKey,
    phoneByCode,
  });
  return {
    created: data,
    letter: { id: data.id, object_key: objectKey },
    fullName,
    buffer: uploaded ? null : buffer,
    whatsapp,
  };
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
  let whatsappQueued = 0;
  let whatsappSkipped = 0;
  let whatsappPeerQueued = 0;
  let whatsappPeerSkipped = 0;
  const failureReasons = [];
  const whatsappSkipReasons = [];
  const jobs = [
    ...birthdays.map((employee) => ({ employee, kind: 'birthday' })),
    ...anniversaries.map((employee) => ({ employee, kind: 'anniversary' })),
  ];

  // Fail fast with a clear message when sharp is missing (common after a fresh clone).
  if (jobs.length) {
    try {
      await getSharp();
    } catch (err) {
      return {
        created: 0,
        skipped: 0,
        failed: jobs.length,
        whatsappQueued: 0,
        whatsappSkipped: 0,
        whatsappPeerQueued: 0,
        whatsappPeerSkipped: 0,
        occasionDate,
        birthdayCount: birthdays.length,
        anniversaryCount: anniversaries.length,
        error: err?.message || String(err),
      };
    }
  }

  const phoneByCode = jobs.length ? await loadEmployeeWhatsAppPhoneMap(svc, employees) : new Map();

  for (const job of jobs) {
    try {
      const out = await createOneCard(svc, deps, {
        employee: job.employee,
        kind: job.kind,
        occasionDate,
        phoneByCode,
      });
      if (out?.skipped) skipped += 1;
      else created += 1;
      if (out?.whatsapp?.queued) whatsappQueued += 1;
      else if (out?.whatsapp) {
        whatsappSkipped += 1;
        const r = out.whatsapp.reason || 'skipped';
        if (whatsappSkipReasons.length < 5 && !whatsappSkipReasons.includes(r)) {
          whatsappSkipReasons.push(r);
        }
      }

      const letterId = out?.letter?.id || out?.created?.id;
      const objectKey = out?.letter?.object_key || out?.created?.object_key;
      if (letterId && objectKey) {
        const peers = await enqueueCelebrationPeers(svc, {
          letterId,
          celebrantCode: job.employee?.employee_code,
          kind: job.kind,
          fullName: out.fullName || job.employee?.full_name,
          occasionDate,
          objectKey,
          phoneByCode,
        });
        whatsappPeerQueued += Number(peers.queued || 0);
        whatsappPeerSkipped += Number(peers.skipped || 0);
        if (peers.reason && whatsappSkipReasons.length < 5 && !whatsappSkipReasons.includes(peers.reason)) {
          whatsappSkipReasons.push(peers.reason);
        }
      } else if (letterId && !objectKey) {
        whatsappPeerSkipped += Math.max(phoneByCode.size - 1, 0);
        if (!whatsappSkipReasons.includes('no_card_image')) {
          whatsappSkipReasons.push('no_card_image');
        }
      }
    } catch (err) {
      failed += 1;
      const reason = err?.message || String(err);
      if (failureReasons.length < 3 && !failureReasons.includes(reason)) {
        failureReasons.push(reason);
      }
      console.warn(
        '[personal-letters] card failed',
        job.kind,
        job.employee?.employee_code,
        reason
      );
    }
  }

  if (whatsappQueued || whatsappPeerQueued) {
    await requestWhatsAppDrain(svc);
  }

  return {
    created,
    skipped,
    failed,
    whatsappQueued,
    whatsappSkipped,
    whatsappPeerQueued,
    whatsappPeerSkipped,
    whatsappRecipientsWithPhone: phoneByCode.size,
    occasionDate,
    birthdayCount: birthdays.length,
    anniversaryCount: anniversaries.length,
    ...(failureReasons.length ? { error: failureReasons.join(' · ') } : {}),
    ...(whatsappSkipReasons.length
      ? { whatsappNote: whatsappSkipReasons.join(' · ') }
      : {}),
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
    `[personal-letters] daily job from ${String(RUN_AT_IST_HOUR).padStart(2, '0')}:00 IST; latest templates: birthday=${bdayCount} (${bdayDir}), anniversary=${annCount} (${annDir})`
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

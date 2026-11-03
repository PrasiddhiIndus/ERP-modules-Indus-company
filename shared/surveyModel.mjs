/**
 * Survey Management — shared model for the ERP API server and admin UI.
 * Questions live in indus_one.survey_templates.questions (jsonb array); answers in
 * indus_one.survey_responses.answers (object keyed by question id).
 */

export const SURVEY_KINDS = [
  { value: 'engagement', label: 'Engagement' },
  { value: 'pulse', label: 'Pulse check' },
  { value: 'exit', label: 'Exit feedback' },
  { value: '360', label: '360° feedback' },
  { value: 'training', label: 'Training feedback' },
  { value: 'other', label: 'Other' },
];

/** Display label for list / detail — uses custom text when kind is Other. */
export function surveyKindLabel(surveyOrKind, kindOther) {
  const kind = typeof surveyOrKind === 'string' ? surveyOrKind : surveyOrKind?.kind;
  const other =
    typeof surveyOrKind === 'string'
      ? kindOther
      : surveyOrKind?.kind_other ?? kindOther;
  if (kind === 'other') {
    const custom = cleanText(other, 120);
    return custom || 'Other';
  }
  return SURVEY_KINDS.find((k) => k.value === kind)?.label || kind || '—';
}

export const SURVEY_QUESTION_TYPES = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multi_choice', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating (1–5)' },
];

export const SURVEY_STATUSES = ['draft', 'published', 'archived'];
export const SURVEY_AUDIENCE_TYPES = ['all', 'selected'];
export const RATING_MIN = 1;
export const RATING_MAX = 5;

const KIND_VALUES = new Set(SURVEY_KINDS.map((k) => k.value));
const QUESTION_TYPE_VALUES = new Set(SURVEY_QUESTION_TYPES.map((t) => t.value));
const CHOICE_TYPES = new Set(['single_choice', 'multi_choice']);

export function isChoiceQuestion(type) {
  return CHOICE_TYPES.has(type);
}

export function newQuestionId() {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

/** YYYY-MM-DD in Asia/Kolkata (due dates are calendar dates for Indian sites). */
export function todayIsoIst(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 10);
}

function cleanText(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeQuestion(raw, index) {
  const type = QUESTION_TYPE_VALUES.has(raw?.type) ? raw.type : 'short_text';
  const id = cleanText(raw?.id, 64) || `q_${index + 1}`;
  const question = {
    id,
    type,
    label: cleanText(raw?.label, 500),
    required: Boolean(raw?.required),
  };
  const help = cleanText(raw?.help, 500);
  if (help) question.help = help;
  if (isChoiceQuestion(type)) {
    const seen = new Set();
    question.options = (Array.isArray(raw?.options) ? raw.options : [])
      .map((o) => cleanText(o, 200))
      .filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()));
  }
  return question;
}

function normalizeEmployeeCodes(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const code = cleanText(raw, 64);
    if (!code || seen.has(code.toUpperCase())) continue;
    seen.add(code.toUpperCase());
    out.push(code);
  }
  return out;
}

/** Normalize an editor payload into the template row shape (without id/status/audit cols). */
export function normalizeSurveyInput(input = {}) {
  const usedIds = new Set();
  const questions = (Array.isArray(input.questions) ? input.questions : []).map((q, i) => {
    const nq = normalizeQuestion(q, i);
    while (usedIds.has(nq.id)) nq.id = `${nq.id}_${i + 1}`;
    usedIds.add(nq.id);
    return nq;
  });
  const minutes = Number(input.estimated_minutes);
  const kind = KIND_VALUES.has(input.kind) ? input.kind : 'pulse';
  const kindOther = kind === 'other' ? cleanText(input.kind_other, 120) || null : null;
  return {
    title: cleanText(input.title, 200),
    description: cleanText(input.description, 4000) || null,
    kind,
    kind_other: kindOther,
    anonymous: Boolean(input.anonymous),
    is_active: input.is_active === undefined ? true : Boolean(input.is_active),
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(input.due_date || '')) ? String(input.due_date) : null,
    estimated_minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.round(minutes), 240) : null,
    audience_type: input.audience_type === 'selected' ? 'selected' : 'all',
    audience_employee_codes: input.audience_type === 'selected' ? normalizeEmployeeCodes(input.audience_employee_codes) : [],
    questions,
  };
}

/**
 * Validate a normalized survey. Returns { field: message } — empty object when valid.
 * `checkDueDate` is false when re-saving an unchanged past due date.
 */
export function validateSurvey(survey, { checkDueDate = true, today = todayIsoIst() } = {}) {
  const errors = {};
  if (!survey.title) errors.title = 'Title is required.';
  if (survey.kind === 'other' && !survey.kind_other) {
    errors.kind_other = 'Enter a kind when Other is selected.';
  }
  if (!survey.questions.length) errors.questions = 'Add at least one question.';
  survey.questions.forEach((q, i) => {
    if (!q.label) errors[`question_${i}`] = `Question ${i + 1} needs a label.`;
    else if (isChoiceQuestion(q.type) && (q.options || []).length < 2) {
      errors[`question_${i}`] = `Question ${i + 1} needs at least two options.`;
    }
  });
  if (survey.audience_type === 'selected' && !survey.audience_employee_codes.length) {
    errors.audience = 'Select at least one employee.';
  }
  if (checkDueDate && survey.due_date && survey.due_date < today) {
    errors.due_date = 'Due date must be today or later.';
  }
  return errors;
}

function isAnswered(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim() !== '';
}

/** Human-readable answer for tables / CSV. */
export function formatAnswer(question, value) {
  if (!isAnswered(value)) return '';
  if (Array.isArray(value)) return value.map(String).join('; ');
  if (question?.type === 'rating') return `${value}/${RATING_MAX}`;
  return String(value);
}

/** Per-question aggregates for the analytics view. */
export function aggregateSurveyResponses(questions = [], responses = []) {
  return questions.map((q) => {
    const values = responses.map((r) => r?.answers?.[q.id]).filter(isAnswered);
    const base = { id: q.id, label: q.label, type: q.type, answered: values.length };
    if (q.type === 'rating') {
      const nums = values.map(Number).filter((n) => Number.isFinite(n) && n >= RATING_MIN && n <= RATING_MAX);
      const distribution = {};
      for (let n = RATING_MIN; n <= RATING_MAX; n += 1) distribution[n] = 0;
      nums.forEach((n) => {
        distribution[Math.round(n)] += 1;
      });
      const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
      return { ...base, average: avg == null ? null : Math.round(avg * 100) / 100, distribution };
    }
    if (isChoiceQuestion(q.type)) {
      const counts = Object.fromEntries((q.options || []).map((o) => [o, 0]));
      values.forEach((v) => {
        (Array.isArray(v) ? v : [v]).forEach((choice) => {
          const key = String(choice);
          counts[key] = (counts[key] || 0) + 1;
        });
      });
      return { ...base, counts };
    }
    return base;
  });
}

/** Progress counts from assignment rows (revoked rows are excluded). */
export function summarizeAssignments(assignments = []) {
  const live = assignments.filter((a) => a.status !== 'revoked');
  const completed = live.filter((a) => a.status === 'completed').length;
  const started = live.filter((a) => a.status === 'in_progress').length;
  const assigned = live.length;
  const pending = assigned - completed;
  return {
    assigned,
    started,
    completed,
    pending,
    completion_pct: assigned ? Math.round((completed / assigned) * 100) : 0,
  };
}

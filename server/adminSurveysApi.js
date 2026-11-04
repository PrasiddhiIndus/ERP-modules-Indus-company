import { createClient } from '@supabase/supabase-js';
import {
  aggregateSurveyResponses,
  normalizeSurveyInput,
  summarizeAssignments,
  todayIsoIst,
  validateSurvey,
} from '../shared/surveyModel.mjs';

/**
 * Survey Management (ERP admin) — create / assign surveys that employees fill in Indus One.
 * All reads and writes use service_role against indus_one.survey_*; routes are gated by
 * requireHrOrAdmin (same gate as the leave / tour inboxes).
 */

const INDUS_ONE = 'indus_one';
const EMPLOYEE_MASTER_TABLE = 'admin_ifsp_employee_master';
const PAGE = 1000;
const EMPLOYEE_SELECT = 'id, employee_code, employee_id, full_name, department, designation, location, status';

function httpError(status, message, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function sendError(res, err, label) {
  const status = Number(err?.status) || 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[surveys] ${label}`, status, err?.message || err);
  }
  res.status(status).json({ ok: false, message: err?.message || 'Survey request failed.', details: err?.details || null });
}

function empKey(code) {
  return String(code ?? '').trim().toUpperCase();
}

function employeeCodeOf(row) {
  return String(row?.employee_code || row?.employee_id || '').trim();
}

/** "All employees" = employee master rows with status Active and a non-empty employee code. */
function isActiveEmployee(row) {
  return String(row?.status || '').trim().toLowerCase() === 'active' && Boolean(employeeCodeOf(row));
}

async function fetchAllPages(buildQuery) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function toEmployeeOption(row) {
  return {
    employee_code: employeeCodeOf(row),
    full_name: row.full_name || '',
    department: row.department || '',
    designation: row.designation || '',
    site: row.location || '',
    status: row.status || '',
  };
}

export function registerAdminSurveyRoutes(app, deps) {
  const { requireHrOrAdmin, getSupabaseUrl, getServiceKey } = deps;

  const db = () => {
    const url = getSupabaseUrl();
    const key = getServiceKey();
    if (!url || !key) {
      throw httpError(503, 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.server). Surveys are unavailable.');
    }
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  };

  const surveys = (client) => client.schema(INDUS_ONE);

  async function loadEmployees(client) {
    return fetchAllPages(() =>
      client.from(EMPLOYEE_MASTER_TABLE).select(EMPLOYEE_SELECT).order('employee_code', { ascending: true })
    );
  }

  async function loadTemplate(client, id) {
    const { data, error } = await surveys(client).from('survey_templates').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, 'Survey not found.');
    return data;
  }

  async function loadAssignments(client, templateIds) {
    if (!templateIds.length) return [];
    const rows = [];
    for (const ids of chunk(templateIds, 100)) {
      rows.push(
        ...(await fetchAllPages(() =>
          surveys(client)
            .from('survey_assignments')
            .select('id, template_id, employee_code, status, due_date, assigned_at, started_at, completed_at')
            .in('template_id', ids)
            .order('assigned_at', { ascending: true })
        ))
      );
    }
    return rows;
  }

  /** Target employee codes for a template's audience (codes as stored in employee master). */
  async function resolveAudience(client, template) {
    const employees = await loadEmployees(client);
    if (template.audience_type === 'all') {
      return employees.filter(isActiveEmployee).map(employeeCodeOf);
    }
    const byKey = new Map(employees.map((e) => [empKey(employeeCodeOf(e)), employeeCodeOf(e)]));
    const missing = [];
    const codes = [];
    for (const code of template.audience_employee_codes || []) {
      const match = byKey.get(empKey(code));
      if (match) codes.push(match);
      else missing.push(code);
    }
    if (missing.length) {
      throw httpError(400, `Unknown employee code(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
    }
    return codes;
  }

  /**
   * Upsert one assignment per target employee and revoke open assignments for employees no
   * longer in the audience. Completed assignments are never reset or revoked.
   */
  async function syncAssignments(client, template, actorId) {
    const targetCodes = await resolveAudience(client, template);
    if (!targetCodes.length) throw httpError(400, 'No active employees match this audience.');

    const existing = await loadAssignments(client, [template.id]);
    const existingByKey = new Map(existing.map((a) => [empKey(a.employee_code), a]));
    const targetKeys = new Set(targetCodes.map(empKey));
    const now = new Date().toISOString();

    const inserts = [];
    const reopenIds = [];
    const dueUpdateIds = [];
    for (const code of targetCodes) {
      const row = existingByKey.get(empKey(code));
      if (!row) {
        inserts.push({
          template_id: template.id,
          employee_code: code,
          due_date: template.due_date,
          status: 'pending',
          assigned_at: now,
          assigned_by: actorId || null,
          updated_at: now,
        });
      } else if (row.status === 'revoked') {
        reopenIds.push(row.id);
      } else if (row.status !== 'completed' && row.due_date !== template.due_date) {
        dueUpdateIds.push(row.id);
      }
    }
    const revokeIds = existing
      .filter((a) => !targetKeys.has(empKey(a.employee_code)) && (a.status === 'pending' || a.status === 'in_progress'))
      .map((a) => a.id);

    for (const batch of chunk(inserts, 500)) {
      const { error } = await surveys(client)
        .from('survey_assignments')
        .upsert(batch, { onConflict: 'template_id,employee_code', ignoreDuplicates: true });
      if (error) throw error;
    }
    for (const ids of chunk(reopenIds, 200)) {
      const { error } = await surveys(client)
        .from('survey_assignments')
        .update({ status: 'pending', started_at: null, due_date: template.due_date, assigned_at: now, updated_at: now })
        .in('id', ids);
      if (error) throw error;
    }
    for (const ids of chunk(dueUpdateIds, 200)) {
      const { error } = await surveys(client)
        .from('survey_assignments')
        .update({ due_date: template.due_date, updated_at: now })
        .in('id', ids);
      if (error) throw error;
    }
    for (const ids of chunk(revokeIds, 200)) {
      const { error } = await surveys(client)
        .from('survey_assignments')
        .update({ status: 'revoked', updated_at: now })
        .in('id', ids);
      if (error) throw error;
    }

    return {
      targeted: targetCodes.length,
      created: inserts.length,
      reopened: reopenIds.length,
      revoked: revokeIds.length,
    };
  }

  function parseSurvey(body, existing) {
    const survey = normalizeSurveyInput(body?.survey || body || {});
    const dueChanged = !existing || existing.due_date !== survey.due_date;
    const errors = validateSurvey(survey, { checkDueDate: dueChanged, today: todayIsoIst() });
    if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], { fields: errors });
    return survey;
  }

  function assertPublishable(template) {
    if (template.status === 'archived') throw httpError(400, 'Archived surveys cannot be published. Duplicate it instead.');
    // A live survey may be re-synced after its due date; only a first publish needs a future date.
    if (template.status !== 'published' && template.due_date && template.due_date < todayIsoIst()) {
      throw httpError(400, 'Due date is in the past. Update it before publishing.');
    }
  }

  async function publish(client, template, actorId) {
    assertPublishable(template);
    const now = new Date().toISOString();
    const { data, error } = await surveys(client)
      .from('survey_templates')
      .update({ status: 'published', published_at: template.published_at || now, updated_at: now })
      .eq('id', template.id)
      .select('*')
      .single();
    if (error) throw error;
    const assignment = await syncAssignments(client, data, actorId);
    return { template: data, assignment };
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  app.get('/api/admin/surveys', requireHrOrAdmin, async (_req, res) => {
    try {
      const client = db();
      const { data: templates, error } = await surveys(client)
        .from('survey_templates')
        .select('id, title, description, kind, kind_other, status, is_active, anonymous, audience_type, audience_employee_codes, due_date, questions, created_at, updated_at, published_at, created_by_email')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const assignments = await loadAssignments(client, (templates || []).map((t) => t.id));
      const byTemplate = new Map();
      assignments.forEach((a) => {
        if (!byTemplate.has(a.template_id)) byTemplate.set(a.template_id, []);
        byTemplate.get(a.template_id).push(a);
      });
      res.json({
        ok: true,
        surveys: (templates || []).map(({ questions, audience_employee_codes, ...t }) => ({
          ...t,
          question_count: Array.isArray(questions) ? questions.length : 0,
          selected_count: (audience_employee_codes || []).length,
          summary: summarizeAssignments(byTemplate.get(t.id) || []),
        })),
      });
    } catch (err) {
      sendError(res, err, 'list');
    }
  });

  app.get('/api/admin/surveys/employees', requireHrOrAdmin, async (_req, res) => {
    try {
      const rows = await loadEmployees(db());
      res.json({
        ok: true,
        employees: rows.filter(isActiveEmployee).map(toEmployeeOption),
      });
    } catch (err) {
      sendError(res, err, 'employees');
    }
  });

  app.get('/api/admin/surveys/:id', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const template = await loadTemplate(client, req.params.id);
      const assignments = await loadAssignments(client, [template.id]);
      const responseRows = await fetchAllPages(() =>
        surveys(client)
          .from('survey_responses')
          .select('id, assignment_id, employee_code, answers, submitted_at')
          .eq('template_id', template.id)
          .order('submitted_at', { ascending: false })
      );

      const anonymous = Boolean(template.anonymous);
      const employees = anonymous ? [] : await loadEmployees(client);
      const empByKey = new Map(employees.map((e) => [empKey(employeeCodeOf(e)), e]));
      const nameOf = (code) => empByKey.get(empKey(code)) || null;

      const liveAssignments = assignments.filter((a) => a.status !== 'revoked');
      const responses = responseRows.map((r, i) => {
        if (anonymous) {
          // No employee code / assignment link / exact time — anonymous responses stay unlinkable.
          return { id: `anon-${i + 1}`, submitted_on: String(r.submitted_at || '').slice(0, 10), answers: r.answers || {} };
        }
        const emp = nameOf(r.employee_code);
        return {
          id: r.id,
          assignment_id: r.assignment_id,
          employee_code: r.employee_code,
          full_name: emp?.full_name || '',
          department: emp?.department || '',
          submitted_at: r.submitted_at,
          answers: r.answers || {},
        };
      });

      res.json({
        ok: true,
        survey: template,
        summary: summarizeAssignments(assignments),
        aggregates: aggregateSurveyResponses(template.questions || [], responseRows),
        assignments: anonymous
          ? []
          : liveAssignments.map((a) => {
              const emp = nameOf(a.employee_code);
              return {
                id: a.id,
                employee_code: a.employee_code,
                full_name: emp?.full_name || '',
                department: emp?.department || '',
                site: emp?.location || '',
                status: a.status,
                due_date: a.due_date,
                assigned_at: a.assigned_at,
                started_at: a.started_at,
                completed_at: a.completed_at,
              };
            }),
        responses,
      });
    } catch (err) {
      sendError(res, err, 'detail');
    }
  });

  app.post('/api/admin/surveys', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const survey = parseSurvey(req.body);
      const now = new Date().toISOString();
      const { data, error } = await surveys(client)
        .from('survey_templates')
        .insert({
          ...survey,
          status: 'draft',
          created_by: req.user?.id || null,
          created_by_email: req.user?.email || null,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (error) throw error;
      if (req.body?.mode === 'publish') {
        const out = await publish(client, data, req.user?.id);
        return res.json({ ok: true, survey: out.template, assignment: out.assignment });
      }
      res.json({ ok: true, survey: data });
    } catch (err) {
      sendError(res, err, 'create');
    }
  });

  app.put('/api/admin/surveys/:id', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const existing = await loadTemplate(client, req.params.id);
      if (existing.status === 'archived') throw httpError(400, 'Archived surveys cannot be edited. Duplicate it instead.');
      const survey = parseSurvey(req.body, existing);
      const { data, error } = await surveys(client)
        .from('survey_templates')
        .update({ ...survey, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      // Publishing (or saving a survey that is already live) re-syncs the audience.
      if (req.body?.mode === 'publish' || data.status === 'published') {
        const out = await publish(client, data, req.user?.id);
        return res.json({ ok: true, survey: out.template, assignment: out.assignment });
      }
      res.json({ ok: true, survey: data });
    } catch (err) {
      sendError(res, err, 'update');
    }
  });

  app.post('/api/admin/surveys/:id/publish', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const template = await loadTemplate(client, req.params.id);
      const errors = validateSurvey(normalizeSurveyInput(template), { checkDueDate: false });
      if (Object.keys(errors).length) throw httpError(400, Object.values(errors)[0], { fields: errors });
      const out = await publish(client, template, req.user?.id);
      res.json({ ok: true, survey: out.template, assignment: out.assignment });
    } catch (err) {
      sendError(res, err, 'publish');
    }
  });

  app.post('/api/admin/surveys/:id/unpublish', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const template = await loadTemplate(client, req.params.id);
      if (template.status !== 'published') throw httpError(400, 'Survey is not published.');
      // Assignments stay (completed answers are kept); Indus One hides the survey until re-published.
      const { data, error } = await surveys(client)
        .from('survey_templates')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', template.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json({ ok: true, survey: data });
    } catch (err) {
      sendError(res, err, 'unpublish');
    }
  });

  /** Pause / resume without opening the editor (list-page Active toggle). */
  app.post('/api/admin/surveys/:id/active', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const template = await loadTemplate(client, req.params.id);
      if (template.status === 'archived') {
        throw httpError(400, 'Archived surveys cannot be activated. Duplicate or restore it first.');
      }
      const isActive = req.body?.is_active === true || req.body?.is_active === 'true' || req.body?.is_active === 1;
      const { data, error } = await surveys(client)
        .from('survey_templates')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', template.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json({ ok: true, survey: data });
    } catch (err) {
      sendError(res, err, 'active');
    }
  });

  app.post('/api/admin/surveys/:id/duplicate', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const t = await loadTemplate(client, req.params.id);
      const now = new Date().toISOString();
      const { data, error } = await surveys(client)
        .from('survey_templates')
        .insert({
          title: `${t.title} (copy)`.slice(0, 200),
          description: t.description,
          kind: t.kind,
          kind_other: t.kind_other || null,
          anonymous: t.anonymous,
          is_active: true,
          questions: t.questions || [],
          audience_type: t.audience_type,
          audience_employee_codes: t.audience_employee_codes || [],
          due_date: t.due_date && t.due_date >= todayIsoIst() ? t.due_date : null,
          estimated_minutes: t.estimated_minutes,
          status: 'draft',
          created_by: req.user?.id || null,
          created_by_email: req.user?.email || null,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (error) throw error;
      res.json({ ok: true, survey: data });
    } catch (err) {
      sendError(res, err, 'duplicate');
    }
  });

  app.post('/api/admin/surveys/:id/archive', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const template = await loadTemplate(client, req.params.id);
      const now = new Date().toISOString();
      const { data, error } = await surveys(client)
        .from('survey_templates')
        .update({ status: 'archived', is_active: false, archived_at: now, updated_at: now })
        .eq('id', template.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json({ ok: true, survey: data });
    } catch (err) {
      sendError(res, err, 'archive');
    }
  });

  /** Permanent delete — removes responses, assignments, then the template. */
  app.delete('/api/admin/surveys/:id', requireHrOrAdmin, async (req, res) => {
    try {
      const client = db();
      const template = await loadTemplate(client, req.params.id);
      const { error: respErr } = await surveys(client)
        .from('survey_responses')
        .delete()
        .eq('template_id', template.id);
      if (respErr) throw respErr;
      const { error: asgErr } = await surveys(client)
        .from('survey_assignments')
        .delete()
        .eq('template_id', template.id);
      if (asgErr) throw asgErr;
      const { error: tplErr } = await surveys(client)
        .from('survey_templates')
        .delete()
        .eq('id', template.id);
      if (tplErr) throw tplErr;
      res.json({ ok: true, deleted_id: template.id });
    } catch (err) {
      sendError(res, err, 'delete');
    }
  });
}

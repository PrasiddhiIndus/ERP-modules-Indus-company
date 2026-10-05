import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  deleteInHouseGroup,
  deleteInHouseTemplate,
  fetchInHouseCampaigns,
  loadInHouseSnapshot,
  saveInHouseGroup,
  saveInHouseTemplate,
  sendInHouseCampaignBatch,
  startInHouseCampaign,
} from '../../../services/crmInHouseMailApi';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';

const InHouseOutreachContext = createContext(null);

const IDLE_PROGRESS = { phase: 'idle', campaignId: null, total: 0, delivered: 0, failed: 0, skipped: 0, remaining: 0, results: [], error: '' };

export function useInHouseOutreach() {
  const ctx = useContext(InHouseOutreachContext);
  if (!ctx) throw new Error('useInHouseOutreach must be used within InHouseOutreachProvider');
  return ctx;
}

export function InHouseOutreachProvider({ children }) {
  const [employees, setEmployees] = useState([]);
  const [employeeStats, setEmployeeStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => new Set());

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeGroupIds, setComposeGroupIds] = useState([]);
  const [composeIncludeSelected, setComposeIncludeSelected] = useState(true);
  const [progress, setProgress] = useState(IDLE_PROGRESS);

  const [templateEditor, setTemplateEditor] = useState({ open: false, id: null, draft: null });
  const [groupEditor, setGroupEditor] = useState({ open: false, id: null, initialMemberIds: null });

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      setError(null);
      const snap = await loadInHouseSnapshot();
      setEmployees(snap.employees);
      setEmployeeStats(snap.employeeStats);
      setTemplates(snap.templates);
      setGroups(snap.groups);
      setCampaigns(snap.campaigns);
    } catch (err) {
      setError(crmOutreachErrorMsg(err, 'Could not load In-House mail data.'));
      throw err;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh({ silent: true }).catch(() => {});
  }, [refresh]);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const counts = useMemo(
    () => ({
      employees: employees.length,
      groups: groups.length,
      templates: templates.length,
      history: campaigns.length,
    }),
    [employees.length, groups.length, templates.length, campaigns.length]
  );

  const openCompose = useCallback((groupIds = [], { includeSelected = true } = {}) => {
    setComposeGroupIds(Array.isArray(groupIds) ? groupIds : []);
    setComposeIncludeSelected(includeSelected);
    setProgress(IDLE_PROGRESS);
    setComposeOpen(true);
  }, []);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeGroupIds([]);
    setProgress(IDLE_PROGRESS);
  }, []);

  const openTemplateEditor = useCallback((id = null, draft = null) => {
    setTemplateEditor({ open: true, id, draft });
  }, []);
  const closeTemplateEditor = useCallback(() => {
    setTemplateEditor({ open: false, id: null, draft: null });
  }, []);

  const saveTemplate = useCallback(async (data, id) => {
    const saved = await saveInHouseTemplate(data, id);
    setTemplates((prev) =>
      (id ? prev.map((t) => (t.id === id ? saved : t)) : [...prev, saved]).sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    return saved;
  }, []);

  const deleteTemplate = useCallback(async (id) => {
    await deleteInHouseTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openGroupEditor = useCallback((id = null, initialMemberIds = null) => {
    setGroupEditor({ open: true, id, initialMemberIds });
  }, []);
  const closeGroupEditor = useCallback(() => {
    setGroupEditor({ open: false, id: null, initialMemberIds: null });
  }, []);

  const saveGroup = useCallback(async (data, id) => {
    const saved = await saveInHouseGroup(data, id);
    setGroups((prev) =>
      (id ? prev.map((g) => (g.id === id ? saved : g)) : [...prev, saved]).sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    return saved;
  }, []);

  const deleteGroup = useCallback(async (id) => {
    await deleteInHouseGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  /** Start a campaign, then send batch by batch so progress stays visible. */
  const sendMail = useCallback(async (payload) => {
    setProgress({ ...IDLE_PROGRESS, phase: 'starting' });
    let started;
    try {
      started = await startInHouseCampaign(payload);
    } catch (err) {
      const message = crmOutreachErrorMsg(err, 'Could not start sending.');
      setProgress({ ...IDLE_PROGRESS, phase: 'error', error: message });
      throw err;
    }

    let state = {
      phase: 'sending',
      campaignId: started.campaignId,
      total: started.total,
      delivered: 0,
      failed: 0,
      skipped: started.skipped || 0,
      remaining: started.remaining,
      results: [],
      error: '',
    };
    setProgress(state);

    try {
      let stalledBatches = 0;
      while (state.remaining > 0) {
        const batch = await sendInHouseCampaignBatch(started.campaignId);
        stalledBatches = batch.batch?.length || batch.remaining < state.remaining ? 0 : stalledBatches + 1;
        state = {
          ...state,
          delivered: batch.delivered,
          failed: batch.failed,
          skipped: batch.skipped,
          remaining: batch.remaining,
          results: [...state.results, ...(batch.batch || [])],
        };
        setProgress(state);
        if (batch.status !== 'Sending' || stalledBatches >= 3) break;
      }
      state = { ...state, phase: 'done' };
      setProgress(state);
    } catch (err) {
      state = {
        ...state,
        phase: 'error',
        error: crmOutreachErrorMsg(err, 'Sending stopped before all mails went out.'),
      };
      setProgress(state);
    } finally {
      fetchInHouseCampaigns()
        .then(setCampaigns)
        .catch(() => {});
    }
    return state;
  }, []);

  const value = useMemo(
    () => ({
      employees,
      employeesById,
      employeeStats,
      templates,
      groups,
      campaigns,
      loading,
      refreshing,
      error,
      counts,
      refresh,
      selectedEmployeeIds,
      setSelectedEmployeeIds,
      composeOpen,
      composeGroupIds,
      composeIncludeSelected,
      openCompose,
      closeCompose,
      progress,
      sendMail,
      templateEditor,
      openTemplateEditor,
      closeTemplateEditor,
      saveTemplate,
      deleteTemplate,
      groupEditor,
      openGroupEditor,
      closeGroupEditor,
      saveGroup,
      deleteGroup,
    }),
    [
      employees,
      employeesById,
      employeeStats,
      templates,
      groups,
      campaigns,
      loading,
      refreshing,
      error,
      counts,
      refresh,
      selectedEmployeeIds,
      composeOpen,
      composeGroupIds,
      composeIncludeSelected,
      openCompose,
      closeCompose,
      progress,
      sendMail,
      templateEditor,
      openTemplateEditor,
      closeTemplateEditor,
      saveTemplate,
      deleteTemplate,
      groupEditor,
      openGroupEditor,
      closeGroupEditor,
      saveGroup,
      deleteGroup,
    ]
  );

  return <InHouseOutreachContext.Provider value={value}>{children}</InHouseOutreachContext.Provider>;
}

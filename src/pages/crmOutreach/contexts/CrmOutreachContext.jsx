import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  crmOutreachErrorMsg,
  deleteMailTemplate,
  deleteSenderMailbox,
  fetchMailCampaigns,
  fetchMailTemplates,
  fetchOutreachClients,
  fetchOutreachStats,
  fetchSenderMailboxes,
  loadCrmOutreachSnapshot,
  renderOutreachTokens,
  saveMailTemplate,
  saveOutreachClient,
  saveSenderMailbox,
  sendMailCampaign,
} from '../../../services/crmOutreachApi';
import { PREVIEW_SAMPLE } from '../data/outreachConstants';

const CrmOutreachContext = createContext(null);

export function useCrmOutreach() {
  const ctx = useContext(CrmOutreachContext);
  if (!ctx) throw new Error('useCrmOutreach must be used within CrmOutreachProvider');
  return ctx;
}

export function CrmOutreachProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [senders, setSenders] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, modules: 0, mails30d: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipientIds, setComposeRecipientIds] = useState([]);

  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateDraft, setTemplateDraft] = useState(null);

  const [senderEditorOpen, setSenderEditorOpen] = useState(false);
  const [editingSenderId, setEditingSenderId] = useState(null);

  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);

  const applySnapshot = useCallback((snapshot) => {
    setClients(snapshot.clients || []);
    setTemplates(snapshot.templates || []);
    setSenders(snapshot.senders || []);
    setCampaigns(snapshot.campaigns || []);
    setStats(snapshot.stats || { total: 0, active: 0, modules: 0, mails30d: 0 });
  }, []);

  const refresh = useCallback(async (clientOptions = {}, { silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      setError(null);
      const snapshot = await loadCrmOutreachSnapshot(clientOptions);
      applySnapshot(snapshot);
    } catch (err) {
      setError(crmOutreachErrorMsg(err, 'Could not load CRM & Outreach data.'));
      throw err;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    refresh(undefined, { silent: false }).catch(() => {});
  }, [refresh]);

  const activeSenders = useMemo(
    () => senders.filter((s) => s.status !== 'Disabled'),
    [senders]
  );

  const verifiedSenders = useMemo(
    () => senders.filter((s) => s.status === 'Verified'),
    [senders]
  );

  const counts = useMemo(
    () => ({
      clients: clients.length,
      templates: templates.length,
      campaigns: campaigns.length,
      senders: senders.length,
    }),
    [clients.length, templates.length, campaigns.length, senders.length]
  );

  const openCompose = useCallback((recipientIds) => {
    setComposeRecipientIds(Array.isArray(recipientIds) ? recipientIds : []);
    setComposeOpen(true);
  }, []);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeRecipientIds([]);
  }, []);

  const openTemplateEditor = useCallback((templateId = null, draft = null) => {
    setEditingTemplateId(templateId);
    setTemplateDraft(draft);
    setTemplateEditorOpen(true);
  }, []);

  const closeTemplateEditor = useCallback(() => {
    setTemplateEditorOpen(false);
    setEditingTemplateId(null);
    setTemplateDraft(null);
  }, []);

  const saveTemplate = useCallback(async (data, id) => {
    const saved = await saveMailTemplate(data, id);
    setTemplates((prev) =>
      id ? prev.map((t) => (t.id === id ? saved : t)) : [saved, ...prev]
    );
    closeTemplateEditor();
    return saved;
  }, [closeTemplateEditor]);

  const deleteTemplate = useCallback(async (id) => {
    await deleteMailTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    closeTemplateEditor();
  }, [closeTemplateEditor]);

  const openSenderEditor = useCallback((senderId = null) => {
    setEditingSenderId(senderId);
    setSenderEditorOpen(true);
  }, []);

  const closeSenderEditor = useCallback(() => {
    setSenderEditorOpen(false);
    setEditingSenderId(null);
  }, []);

  const saveSender = useCallback(async (data, id) => {
    const saved = await saveSenderMailbox(data, id);
    setSenders((prev) =>
      id ? prev.map((s) => (s.id === id ? saved : s)) : [saved, ...prev]
    );
    closeSenderEditor();
    return saved;
  }, [closeSenderEditor]);

  const deleteSender = useCallback(async (id) => {
    await deleteSenderMailbox(id);
    setSenders((prev) => prev.filter((s) => s.id !== id));
    closeSenderEditor();
  }, [closeSenderEditor]);

  const openClientEditor = useCallback((clientId = null) => {
    setEditingClientId(clientId);
    setClientEditorOpen(true);
  }, []);

  const closeClientEditor = useCallback(() => {
    setClientEditorOpen(false);
    setEditingClientId(null);
  }, []);

  const saveClient = useCallback(async (data, id) => {
    const saved = await saveOutreachClient(data, id);
    setClients((prev) =>
      id ? prev.map((c) => (c.id === id ? saved : c)) : [saved, ...prev]
    );
    const nextStats = await fetchOutreachStats();
    setStats(nextStats);
    closeClientEditor();
    return saved;
  }, [closeClientEditor]);

  const sendCampaign = useCallback(async (payload) => {
    setSending(true);
    try {
      const result = await sendMailCampaign(payload);
      const [nextCampaigns, nextClients, nextStats] = await Promise.all([
        fetchMailCampaigns(),
        fetchOutreachClients(),
        fetchOutreachStats(),
      ]);
      setCampaigns(nextCampaigns);
      setClients(nextClients);
      setStats(nextStats);
      return result;
    } finally {
      setSending(false);
    }
  }, []);

  const reloadClients = useCallback(async (filters) => {
    const rows = await fetchOutreachClients(filters);
    setClients(rows);
  }, []);

  const value = useMemo(
    () => ({
      clients,
      templates,
      senders,
      campaigns,
      stats,
      loading,
      refreshing,
      sending,
      error,
      activeSenders,
      verifiedSenders,
      counts,
      refresh,
      reloadClients,
      composeOpen,
      composeRecipientIds,
      openCompose,
      closeCompose,
      templateEditorOpen,
      editingTemplateId,
      templateDraft,
      openTemplateEditor,
      closeTemplateEditor,
      saveTemplate,
      deleteTemplate,
      senderEditorOpen,
      editingSenderId,
      openSenderEditor,
      closeSenderEditor,
      saveSender,
      deleteSender,
      clientEditorOpen,
      editingClientId,
      openClientEditor,
      closeClientEditor,
      saveClient,
      sendCampaign,
      renderTokens: renderOutreachTokens,
    }),
    [
      clients,
      templates,
      senders,
      campaigns,
      stats,
      loading,
      refreshing,
      sending,
      error,
      activeSenders,
      verifiedSenders,
      counts,
      refresh,
      reloadClients,
      composeOpen,
      composeRecipientIds,
      openCompose,
      closeCompose,
      templateEditorOpen,
      editingTemplateId,
      templateDraft,
      openTemplateEditor,
      closeTemplateEditor,
      saveTemplate,
      deleteTemplate,
      senderEditorOpen,
      editingSenderId,
      openSenderEditor,
      closeSenderEditor,
      saveSender,
      deleteSender,
      clientEditorOpen,
      editingClientId,
      openClientEditor,
      closeClientEditor,
      saveClient,
      sendCampaign,
    ]
  );

  return (
    <CrmOutreachContext.Provider value={value}>{children}</CrmOutreachContext.Provider>
  );
}

export { PREVIEW_SAMPLE };

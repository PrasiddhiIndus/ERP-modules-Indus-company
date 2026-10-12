export function blankStatutoryRow(form) {
  return Object.fromEntries((form.columns || []).map((column) => [column.key, ""]));
}

export function emptyStatutoryHeader(form) {
  return Object.fromEntries((form.header || []).map((field) => [field.key, ""]));
}

export function newStatutoryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `form-${Date.now()}`;
}

export function createStatutoryPack(forms) {
  const packForms = {};
  forms.forEach((form) => {
    const rowCount = Math.max(1, Number(form.initialRows) || 1);
    packForms[form.id] = {
      header: emptyStatutoryHeader(form),
      rows: Array.from({ length: rowCount }, () => blankStatutoryRow(form)),
    };
  });
  return { id: newStatutoryId(), forms: packForms };
}

export function listStatutoryPacks(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStatutoryPack(storageKey, pack) {
  const all = listStatutoryPacks(storageKey);
  const next = { ...pack, savedAt: new Date().toISOString() };
  const index = all.findIndex((item) => item.id === next.id);
  if (index >= 0) all[index] = next;
  else all.unshift(next);
  localStorage.setItem(storageKey, JSON.stringify(all));
  return next;
}

export function deleteStatutoryPack(storageKey, id) {
  localStorage.setItem(
    storageKey,
    JSON.stringify(listStatutoryPacks(storageKey).filter((pack) => pack.id !== id))
  );
}

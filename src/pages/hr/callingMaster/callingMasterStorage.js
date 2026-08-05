import {
  CALLING_MASTER_DROPDOWNS_EVENT,
  CALLING_MASTER_RECORDS_EVENT,
} from "./callingMasterConfig";
import {
  clearAllDropdownOptions,
  clearDropdownOptionsForMaster,
  createDropdownOption,
  deleteCallingCandidates,
  deleteDropdownOptionRow,
  listCallingCandidates,
  listDropdownCatalog,
  listSelectOptionsMap,
  updateDropdownOptionRow,
  upsertCallingCandidate,
  updateCandidatePipelineStatus,
} from "./callingMasterApi";

function notify(eventName) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName));
}

export async function loadCallingMasterRecords() {
  return listCallingCandidates();
}

export async function upsertCallingMasterRecord(record) {
  const saved = await upsertCallingCandidate(record);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function updateCallingMasterPipelineStatus(id, hiringStatus) {
  const saved = await updateCandidatePipelineStatus(id, hiringStatus);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function deleteCallingMasterRecords(ids) {
  const deleted = await deleteCallingCandidates(ids);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return deleted;
}

export async function loadCallingMasterDropdownCatalog() {
  return listDropdownCatalog();
}

export async function getCallingMasterSelectOptions() {
  return listSelectOptionsMap();
}

export async function addDropdownOption(key, label) {
  const created = await createDropdownOption(key, label);
  notify(CALLING_MASTER_DROPDOWNS_EVENT);
  return created;
}

export async function updateDropdownOption(key, optionId, label) {
  const updated = await updateDropdownOptionRow(optionId, label);
  notify(CALLING_MASTER_DROPDOWNS_EVENT);
  return updated;
}

export async function deleteDropdownOption(key, optionId) {
  await deleteDropdownOptionRow(optionId);
  notify(CALLING_MASTER_DROPDOWNS_EVENT);
}

export async function resetDropdownMaster(key) {
  await clearDropdownOptionsForMaster(key);
  notify(CALLING_MASTER_DROPDOWNS_EVENT);
}

export async function resetAllDropdownMasters() {
  await clearAllDropdownOptions();
  notify(CALLING_MASTER_DROPDOWNS_EVENT);
}

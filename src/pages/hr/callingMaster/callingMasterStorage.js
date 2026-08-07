import {
  autoExpireOffers,
  clearAllDropdownOptions,
  clearDropdownOptionsForMaster,
  closeNoShowCandidate,
  convertCandidateToEmployeeMaster,
  createDropdownOption,
  deleteCallingCandidates,
  deleteDropdownOptionRow,
  flagCandidateNoShow,
  getOfferExpiryDays,
  issueCandidateIom,
  listCallingCandidates,
  listConversionCandidates,
  listDropdownCatalog,
  listIomCandidates,
  listJoiningCandidates,
  listOfferResponseCandidates,
  listSelectOptionsMap,
  listSelectedOfferCandidates,
  markCandidateJoined,
  peekNextEmployeeCode,
  saveCandidateOfferDetails,
  setCandidateOfferResponse,
  setOfferExpiryDays,
  updateIomDepartments,
  updateJoiningChecklist,
  updateOfferDetailsOnly,
  updateDropdownOptionRow,
  upsertCallingCandidate,
  updateCandidatePipelineStatus,
} from "./callingMasterApi";
import {
  CALLING_MASTER_DROPDOWNS_EVENT,
  CALLING_MASTER_RECORDS_EVENT,
} from "./callingMasterConfig";

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

export async function loadSelectedOfferCandidates() {
  return listSelectedOfferCandidates();
}

export async function peekOfferEmployeeCodeSuggestion() {
  return peekNextEmployeeCode();
}

export async function saveOfferAndAllocateCodes(record) {
  const saved = await saveCandidateOfferDetails(record);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

/** Save offer fields from Selected register without allocating codes. */
export async function saveSelectedOfferDetails(record) {
  const saved = await updateOfferDetailsOnly(record);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function loadOfferResponseCandidates() {
  return listOfferResponseCandidates();
}

export async function loadOfferExpiryDays() {
  return getOfferExpiryDays();
}

export async function saveOfferExpiryDays(days) {
  const saved = await setOfferExpiryDays(days);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function recordOfferResponse(id, response) {
  const saved = await setCandidateOfferResponse(id, response);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function runAutoExpireOffers() {
  const count = await autoExpireOffers();
  if (count > 0) notify(CALLING_MASTER_RECORDS_EVENT);
  return count;
}

export async function loadJoiningCandidates() {
  return listJoiningCandidates();
}

export async function saveJoiningChecklist(id, checklist) {
  const saved = await updateJoiningChecklist(id, checklist);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function markJoined(id, actualJoiningDate) {
  const saved = await markCandidateJoined(id, actualJoiningDate);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function flagNoShow(id) {
  const saved = await flagCandidateNoShow(id);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function closeNoShow(id) {
  const saved = await closeNoShowCandidate(id);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function loadIomCandidates() {
  return listIomCandidates();
}

export async function saveIomDepartments(id, departments) {
  const saved = await updateIomDepartments(id, departments);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function issueIomAndAllocate(record) {
  const saved = await issueCandidateIom(record);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return saved;
}

export async function loadConversionCandidates() {
  return listConversionCandidates();
}

export async function convertToEmployeeMaster(id) {
  const result = await convertCandidateToEmployeeMaster(id);
  notify(CALLING_MASTER_RECORDS_EVENT);
  return result;
}

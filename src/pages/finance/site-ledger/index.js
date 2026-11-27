export {
  EXPLICIT_FIGURE_SAVE_STORAGE_KEY,
  ATOMIC_CONCURRENCY_STORAGE_KEY,
  isExplicitFigureSaveEnabled,
  isAtomicConcurrencyEnabled,
} from "./featureFlags.js";

export {
  FINANCE_ERROR_CODES,
  parseFinanceSaveResult,
  analyzeConflictMerge,
  newFinanceRequestId,
  isRevisionConflict,
} from "./persistence/financeConcurrency.js";

export {
  SaveCoordinator,
  getSharedSaveCoordinator,
  __resetSharedSaveCoordinatorForTests,
} from "./persistence/saveCoordinator.js";

export {
  putDraft,
  getDraft,
  deleteDraft,
  deleteDraftIfUnchanged,
  listDraftsForUser,
  sanitizeDraftPayload,
  fingerprintPayload,
  classifyDraftStorageError,
  onLedgerUserContextChange,
  __resetDraftMemoryForTests,
  __setDraftIdbAdapterForTests,
} from "./persistence/draftStore.js";

export {
  compareDraftToServer,
  collectFieldDiffs,
  formatDraftReviewLines,
} from "./persistence/draftCompare.js";

export {
  getLedgerTabId,
  __resetLedgerTabIdForTests,
} from "./persistence/draftSession.js";

export {
  createWorkingCopy,
  applyWorkingEdit,
  markSaveSucceeded,
  markSaveFailed,
  discardWorkingCopy,
  hydrateFromServer,
  restoreDraftIntoWorking,
  periodRecordKey,
  setupRecordKey,
  deepClone,
  fingerprintsEqual,
} from "./state/workingCopy.js";

export {
  attachLedgerNavigationGuard,
  confirmLeaveIfDirty,
} from "./hooks/navigationGuard.js";

export {
  parseEntryAmount,
  profitAndMargin,
  recognizedExpensesForPeriod,
  computeSignedRevenue,
  calcSitePeriod,
  calcSiteOverPeriods,
  estimateTotals,
  portfolioTotalsForPeriod,
} from "./calculations/ledgerMath.js";

export {
  buildFinanceAuditEvent,
  summarizeFinanceAuditEvent,
} from "./audit/financeAuditEvent.js";

export * from "./domain/constants.js";
export * from "./domain/siteStructure.js";
export * from "./domain/siteLifecycle.js";
export * from "./domain/formatMoney.js";

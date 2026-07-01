function normContactDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normContactName(value) {
  return String(value || '').trim().toLowerCase();
}

function contactsAreSame(aName, aNumber, bName, bNumber) {
  return normContactName(aName) === normContactName(bName) && normContactDigits(aNumber) === normContactDigits(bNumber);
}

/**
 * Build contact history for PO save.
 * - New PO: one open entry for the current coordinator.
 * - Edit / new PO for existing Site+OC: keep prior log, close open row on change, append new current row.
 * - Empty log: bootstrap from previous coordinator on file or the form values.
 */
export function buildContactHistoryLogForSave({
  prevLog = [],
  prevCoordinator = '',
  prevContactNumber = '',
  currentCoordinator = '',
  contactNumber = '',
  startDate = '',
  asOfDate,
} = {}) {
  const today = asOfDate || new Date().toISOString().slice(0, 10);
  const fromDate = String(startDate || '').trim() || today;
  const name = String(currentCoordinator || '').trim();
  const number = String(contactNumber || '').trim();

  if (!name && !number) return Array.isArray(prevLog) ? [...prevLog] : [];

  const log = Array.isArray(prevLog) ? prevLog.map((entry) => ({ ...entry })) : [];
  const prevName = String(prevCoordinator || '').trim();
  const prevNum = String(prevContactNumber || '').trim();

  if (log.length === 0) {
    if (prevName || prevNum) {
      if (contactsAreSame(prevName, prevNum, name, number)) {
        return [{ name: name || prevName, number: number || prevNum, from: fromDate, to: null }];
      }
      return [
        { name: prevName, number: prevNum, from: fromDate, to: today },
        { name, number, from: today, to: null },
      ];
    }
    if (!name && !number) return [];
    return [{ name, number, from: fromDate, to: null }];
  }

  const changed = !contactsAreSame(prevCoordinator, prevContactNumber, name, number);

  if (!changed) {
    const lastIdx = log.length - 1;
    const last = log[lastIdx];
    if (last && !last.to) {
      log[lastIdx] = {
        ...last,
        name: name || last.name,
        number: number || last.number,
      };
    }
    return log;
  }

  const closed = log.map((entry) => (!entry.to ? { ...entry, to: today } : entry));
  closed.push({ name, number, from: today, to: null });
  return closed;
}

/** Rows for history UI when po_contact_log is empty but current coordinator exists on the PO. */
export function contactHistoryRowsForDisplay(po) {
  const log = Array.isArray(po?.contactHistoryLog) ? po.contactHistoryLog.filter(Boolean) : [];
  if (log.length) return log;
  const name = String(po?.currentCoordinator || '').trim();
  const number = String(po?.contactNumber || '').trim();
  if (!name && !number) return [];
  return [
    {
      name,
      number,
      from: po?.startDate || po?.start_date || '—',
      to: null,
      isCurrentFallback: true,
    },
  ];
}

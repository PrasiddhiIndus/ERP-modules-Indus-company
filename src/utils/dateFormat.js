import { formatDateDdMmYyyy } from './dateDisplay';

/**
 * UI date format: dd-mm-yyyy (canonical app format).
 * @deprecated Prefer formatDateDdMmYyyy from utils/dateDisplay.js
 */
export function formatDdMonYyyy(value) {
  const formatted = formatDateDdMmYyyy(value);
  return formatted || '–';
}


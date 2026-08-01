import { TOKENS } from '../../../theme/tokens';

export const STATUS_COLORS = {
  Draft: { bg: TOKENS.divider, text: TOKENS.textSecondary, border: TOKENS.borderStrong },
  'Awaiting Client Response': { bg: TOKENS.infoSoft, text: TOKENS.info, border: TOKENS.borderStrong },
  'Revised Offer Sent': { bg: TOKENS.infoSoft, text: TOKENS.info, border: TOKENS.accentBorder },
  'Client Has Hold Enquiry': { bg: TOKENS.warningSoft, text: TOKENS.warning, border: TOKENS.warningBorder },
  'Order Lost': { bg: TOKENS.criticalSoft, text: TOKENS.critical, border: TOKENS.criticalBorder },
  'Order Converted on Revised Value': { bg: TOKENS.successSoft, text: TOKENS.success, border: TOKENS.accentBorder },
  'Order Converted': { bg: TOKENS.successSoft, text: TOKENS.success, border: TOKENS.accentBorder },
  Superseded: { bg: TOKENS.surfaceSunken, text: TOKENS.textMuted, border: TOKENS.borderStrong },
};

export function getStatusStyle(status) {
  return STATUS_COLORS[status] || { bg: TOKENS.surfaceRaised, text: TOKENS.textMuted, border: TOKENS.border };
}

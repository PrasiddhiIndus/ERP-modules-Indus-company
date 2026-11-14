import { UI_TOKENS } from '../../../theme/tokens';

export const STATUS_COLORS = {
  Draft: { bg: UI_TOKENS.divider, text: UI_TOKENS.textSecondary, border: UI_TOKENS.borderStrong },
  'Awaiting Client Response': { bg: UI_TOKENS.infoSoft, text: UI_TOKENS.info, border: UI_TOKENS.borderStrong },
  'Revised Offer Sent': { bg: UI_TOKENS.infoSoft, text: UI_TOKENS.info, border: UI_TOKENS.accentBorder },
  'Client Has Hold Enquiry': { bg: UI_TOKENS.warningSoft, text: UI_TOKENS.warning, border: UI_TOKENS.warningBorder },
  'Order Lost': { bg: UI_TOKENS.criticalSoft, text: UI_TOKENS.critical, border: UI_TOKENS.criticalBorder },
  'Order Converted on Revised Value': { bg: UI_TOKENS.successSoft, text: UI_TOKENS.success, border: UI_TOKENS.accentBorder },
  'Order Converted': { bg: UI_TOKENS.successSoft, text: UI_TOKENS.success, border: UI_TOKENS.accentBorder },
  Superseded: { bg: UI_TOKENS.surfaceSunken, text: UI_TOKENS.textMuted, border: UI_TOKENS.borderStrong },
};

export function getStatusStyle(status) {
  return STATUS_COLORS[status] || { bg: UI_TOKENS.surfaceRaised, text: UI_TOKENS.textMuted, border: UI_TOKENS.border };
}

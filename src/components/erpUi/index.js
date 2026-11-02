/**
 * Central ERP UI kit — single source of truth for shared chrome.
 *
 * Prefer:
 *   import { PageTaskHeader, SectionCard, DenseTable } from "../../components/erpUi";
 *
 * Do NOT deep-import adminOperations/components/AdminUi.
 * Do NOT create parallel SectionCard / DenseTable / Modal forks under pages/.
 *
 * Look & spacing: edit src/theme/tokens.css (+ typography.css).
 * Component structure: edit files in this folder.
 */

export {
  PageTaskHeader,
  CollapsibleHelp,
  SectionCard,
  Badge,
  TinyInput,
  TinySelect,
  StatusChip,
  KpiTile,
  FilterBar,
  DenseTable,
  Drawer,
  Modal,
  LinkedChip,
  Timeline,
  InlineAlert,
} from "./primitives";

export {
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  FormField,
  PageShell,
} from "./actions";

export {
  Skeleton,
  LoadingBlock,
  Breadcrumbs,
  PaginationBar,
} from "./feedback";

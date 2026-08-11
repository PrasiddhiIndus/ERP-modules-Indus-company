/**
 * Central ERP UI kit — re-exports Admin Ops primitives so every module
 * can import from one place without deep-linking into adminOperations.
 *
 * Prefer: import { PageTaskHeader, SectionCard, ... } from "../../components/erpUi";
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
} from "../../pages/adminOperations/components/AdminUi";

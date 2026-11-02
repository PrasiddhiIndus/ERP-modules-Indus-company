# ERP UI kit (`src/components/erpUi`)

Single component kit for the whole ERP. Change primitives here (and tokens in `src/theme/`) to update every screen that imports this package.

## Import rule

```js
import { PageTaskHeader, SectionCard, DenseTable, Modal } from "../../components/erpUi";
```

- **Do** import only from `components/erpUi`.
- **Do not** deep-import `pages/adminOperations/components/AdminUi` (deprecated re-export).
- **Do not** define a second `SectionCard`, `DenseTable`, `Modal`, `FilterBar`, etc. under a module `*Ui.jsx`. Domain wrappers may re-export from `erpUi` and add module-only helpers.

## Two layers

| Layer | Edit | Effect |
|-------|------|--------|
| Tokens | `src/theme/tokens.css`, `typography.css`, `tailwind.config.js` | Colors, spacing, type, radius |
| Components | `primitives.jsx`, `actions.jsx` | Headers, cards, tables, modals, buttons |

## Primitives

`PageTaskHeader`, `CollapsibleHelp`, `SectionCard`, `Badge`, `TinyInput`, `TinySelect`, `StatusChip`, `KpiTile`, `FilterBar`, `DenseTable`, `Drawer`, `Modal`, `LinkedChip`, `Timeline`, `InlineAlert`

## Shared actions

`PrimaryButton`, `SecondaryButton`, `EmptyState`, `FormField`, `PageShell`

## Feedback / chrome

`Skeleton`, `LoadingBlock`, `Breadcrumbs`, `PaginationBar`

App shell extras (not in this barrel): `CommandPalette`, `ThemeProvider` (`data-theme="dark"`).

Add new shared components here only when **3+ modules** need the same pattern.

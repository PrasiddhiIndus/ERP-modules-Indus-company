# IT Support module

Internal IT ticketing for Indus ERP — raise, assign, resolve, and track SLA.

## Stack

Same as the rest of this ERP:

- React + Vite + Tailwind (`src/pages/itSupport/`)
- Supabase Postgres + RLS + RPCs
- Express R2 uploads (`/api/it-support/r2/*`)
- Supabase scheduled function / `pg_cron` for SLA + auto-close

## Access (User Management)

Grant under **IT/IS**:

| Key | Who | What |
|-----|-----|------|
| `itIs.helpdesk` | Employees | Raise ticket, My Tickets, own detail |
| `itIs.helpdesk-agent` | IT team | Dashboard, Queue, assign / priority / status / internal notes |
| `itIs.helpdesk-admin` | IT managers | Masters (categories, SLA), Reports, SLA breach alerts |

Super Admin and full `itIs` module grant act as admin/agent.

## Routes

| Path | Screen |
|------|--------|
| `/app/it-support/raise` | Raise ticket |
| `/app/it-support/my` | My tickets |
| `/app/it-support/tickets/:id` | Ticket detail |
| `/app/it-support` | IT dashboard |
| `/app/it-support/queue` | Queue + Kanban |
| `/app/it-support/masters` | Categories & SLA |
| `/app/it-support/reports` | Reports + CSV export |

## Setup

1. Apply migration:

```bash
# via your usual Supabase migration flow
supabase db push
# or run: supabase/migrations/20261119160000_it_support_ticketing.sql
```

2. Deploy SLA cron (if `pg_cron` is not enabled on the project):

```bash
supabase functions deploy it-support-sla-cron
```

Set secret `IT_SUPPORT_CRON_SECRET` (optional) and schedule every 5 minutes to:

`POST /functions/v1/it-support-sla-cron` with `Authorization: Bearer <SERVICE_ROLE_KEY>` or `x-cron-secret`.

When `pg_cron` is available, migration schedules `it-support-sla-autoclose` automatically.

3. Env (already used by ERP):

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Server (`.env.server`): R2 + Microsoft Graph mail vars; `SUPABASE_SERVICE_ROLE_KEY`

4. Run locally:

```bash
npm run dev
```

5. In User Management, grant the helpdesk keys above. The queue starts empty — raise real tickets to test. Categories and SLA rules are pre-loaded.

## Ticket IDs

`IT-YYYY-#####` via `it_allocate_ticket_no()` / `it_create_ticket()`.

## Workflow

`New → Open → In Progress → On Hold → Resolved → Closed` (+ `Reopened` within 7 days).

- SLA pauses while **On hold**.
- Resolved tickets auto-close after **3 days** with no response.
- Priority (IT only) drives first-response / resolution due times from `it_sla_rules`.

## Attachments (Cloudflare R2)

Flow (same pattern as Software Subscriptions):

1. Browser uploads the file to Express → **Cloudflare R2** (`POST /api/it-support/r2/upload`).
2. Object key looks like `it-support/<ticket-id>/<timestamp>-filename.png`.
3. A row is written to **`it_ticket_attachments`** with:
   - `storage = 'r2'`
   - `file_path` / `r2_key` = that R2 object key
   - `file_name`, `content_type`, `size_bytes`
4. Download uses `POST /api/it-support/r2/presign-get` (short-lived URL).

Up to **10 MB** each. Requires R2 env on the API server: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

## User guide

See [USER_GUIDE.md](./USER_GUIDE.md).

# Personal letter templates (birthday / anniversary)

Used by the API server (`server/personalLetterCards.js`) to generate greeting cards at 05:00 IST and to regenerate previews when R2 is unavailable.

## Paths (must be committed so production git deploy has them)

- `birthday/*.jpg`
- `anniversary/*.jpg`

On production the Node process cwd is `/root/indus-erp` (PM2). It resolves:

`public/templates/personal-letters/{birthday|anniversary}/`

Legacy local folders are still accepted as a fallback:

- `public/indus_birthday_templates_4K (2)/indus_birthday_templates_4K`
- `public/indus_anniversary_templates_4K/indus_anniversary_templates_4K`

## Live site (indus-erp.in)

1. Commit these JPGs and deploy (`scripts/deploy.sh` warns if missing).
2. Card **View** popup loads via same-origin `GET /api/admin/personal-letters/:id/image` (nginx → Node :8787) — never open R2 in the browser.
3. Prefer R2 object stream when `object_key` is set; otherwise compose from these templates.

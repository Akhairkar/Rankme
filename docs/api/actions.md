# Action Center API (`backend/src/actions.js`)

All endpoints: `auth: session`, JSON, errors `{error, code}`. Business access goes through the standard business ownership check; other tenants' ids return `404 not_found`.

Task object: `{id, business_id, source_type:"audit_finding"|"manual"|"assistant", source_id, finding_key, title, description, reason, evidence, priority:"critical"|"high"|"medium"|"low", effort_minutes|null, due_date:"YYYY-MM-DD"|null, status:"open"|"in_progress"|"done"|"reopened"|"ignored", assignee_user_id|null, created_by, completed_at|null, completed_by|null, verified_audit_id|null, verified_at|null, before_evidence, after_evidence, created_at, updated_at}` (lists add `note_count`, `attachment_count`).

## GET /api/actions?business_id=&status=&assignee=
`assignee`: a user id, `me`, or `unassigned`. Response `200 {tasks:[...]}` sorted by priority, due date, age. Errors: `400 business_id_required|invalid_status`, `404`.

## GET /api/actions/detail?id=
`200 {task, notes:[{id,user_id,note,created_at}], attachments:[{id,filename,url,created_by,created_at}]}`

## POST /api/actions
Manual task. Body `{business_id, title (<=200), description?, reason?, evidence?, priority? (default medium), effort_minutes? (1-10080), due_date? (YYYY-MM-DD), assignee_user_id?}` -> `201 {task}`. Errors: `400 validation_failed|invalid_assignee`.

## POST /api/actions/from-audit
Body `{audit_id}`. Creates one task per OPEN finding of that audit, deduplicated by finding key (`<code>|<source>`).
Priority: severity high -> `high` (`critical` when the finding blocks indexing, i.e. `site_noindex`), medium -> `medium`, low -> `low`. `effort_minutes` from the audit plan effort scale (15 / 60 / 240) when known. `before_evidence` stores the evidence at creation.
Response `201|200 {created:[task], skipped:[{key, task_id, reason:"already_tracked"|"ignored"}], reopened:[taskId], audit_id}`. A task already `done` is set to `reopened` only when this audit (run after it was completed) still lists the finding.

## POST /api/actions/update
Body `{id, status?, assignee_user_id?, due_date?, priority?, after_evidence?, verified_audit_id?}`; unknown fields are rejected (`400 unknown_field`).
- `status:"done"` records `completed_at` and `completed_by` (the caller). Leaving `done` clears them. `reopened` is only allowed from `done`/`ignored` (`409 invalid_transition`).
- `assignee_user_id` (or null) must be the owner or an active member of the business's workspace (`400 invalid_assignee`); falls back to owner-only if workspaces are unavailable.
- `verified_audit_id` (only with `status:"done"`) is accepted only when `/rerun-audit` would say `verified_fixed` for exactly that audit, else `409 verification_failed`. Then `verified_audit_id`/`verified_at` are stored. Without it, "done" means "marked done by a person".
Response `200 {task}`.

## POST /api/actions/note
Body `{id, note (<=2000)}` -> `201 {note}`.

## POST /api/actions/attachment
Body `{id, url, filename}`; `url` must be an `https://` link without credentials (max 2000), `filename` max 120 chars with no slashes, max 20 per task. -> `201 {attachment, storage:"link_only"}`.
Attachments are links only (for example Google Drive). Real file upload needs object storage (Cloudflare R2), which is not provisioned.

## GET /api/actions/progress?business_id=
`200 {total, done, by_priority:{critical|high|medium|low:{total,done}}, percent:number|null, note}`. Ignored tasks are excluded; `percent` is `null` when there are no tasks (never 0%).

## POST /api/actions/rerun-audit
Body `{id}`. Read-only: never changes the task. Response `200 {verification, task_status}` where `verification` is
`{task_id, suggestion, finding_still_open:true|false|null, reason, latest_audit_id?, latest_audit_at?, current_evidence?, rerun:{method:"POST", path:"/api/audits/run", body:{business_id}}}`.
`suggestion`: `no_audit`, `no_newer_audit` (run the audit first via `rerun`), `still_open`, `verified_fixed` (a newer audit ran the check and it passed), `cannot_verify` (check unavailable in the newer audit), `unverified` (newer audit lists it as fixed/ignored by a person), `not_applicable` (manual task).

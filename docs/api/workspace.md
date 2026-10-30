# Workspace API (module `backend/src/workspace.js`)

Workspaces, team roles, invitations, audit log, session management. All routes need the session cookie (`lb_session`, `credentials: "include"`), JSON bodies, and are rate limited (HTTP 429 `{code:"rate_limited"}`; the limiter fails closed). Errors are `{ "error": "message", "code": "snake_case" }`. Responses are `cache-control: no-store`.

## Concepts
- Every user gets a **personal workspace** lazily on first workspace call; their existing businesses are mapped into it (`business_workspace`). Nothing to migrate.
- **Which workspace?** Pass `workspace_id` (query string on GET, body field on POST) to act in a team you were invited to. Omitted = your personal workspace. If you are not an *active* member of the given workspace the answer is always **404 `workspace_not_found`** (never 403), so ids cannot be probed.
- `GET /api/workspace` returns `workspaces: [{id,name,is_personal,role}]` so the UI can render a switcher.
- Reading an invite: send the invitee to `https://www.localboost.in/dashboard/accept-invite.html?token=...`; that page must call `POST /api/workspace/accept` (user must be signed in first).

## Role matrix (`PERMISSIONS`, `can(role, action)`)
| Action | owner | admin | manager | analyst | client |
|---|---|---|---|---|---|
| `billing.manage`, `workspace.settings` (rename), `workspace.transfer` | yes | - | - | - | - |
| `team.manage` (invite, revoke, change role/status, remove), `audit_log.read`, `business.manage` (attach) | yes | yes | - | - | - |
| `business.operate` (audits, scans, review replies with confirmation, report generation) | yes | yes | yes | - | - |
| `team.view` (member list) | yes | yes | yes | yes | - (sees only self) |
| `business.read`, `analysis.read`, `reports.read` | yes | yes | yes | yes (all workspace businesses) | yes (**assigned businesses only**) |

Rules: admins cannot grant `owner`, cannot change/remove an owner, and cannot change/remove other admins. A workspace always keeps at least one active owner (`last_owner`). Billing stays owner-only. Analyst and client are read-only everywhere.

## Sensitive actions: `reauth_required`
Ownership transfer, member removal (and account deletion, see below) need a sign-in from the last 15 minutes (`sessions.created_at`). Otherwise: `403 {"error":"...","code":"reauth_required","reauth_url":"/auth/google/start","max_age_seconds":900}`. The UI must send the user through `/auth/google/start` again (full-page navigation) and then retry the action.

## Endpoints

### GET /api/workspace
Any member. Query: `workspace_id?`.
200: `{ workspace:{id,name,owner_user_id,is_personal,created_at}, role, members:[{user_id,email,name,role,status,invited_by,created_at,business_ids?}], businesses:[{id,name,city,status}], usage:{members,pending_invitations,member_limit,plan_code,businesses}, workspaces:[{id,name,is_personal,role}] }`
Analyst/manager see all members; `client` sees only itself and only its assigned businesses. Errors: 404 `workspace_not_found`.

### POST /api/workspace/rename  (owner)
`{ name (1-80 chars), workspace_id? }` -> 200 `{ workspace }`. Errors: 400 `invalid_name`, 403 `forbidden`, 404.

### GET /api/workspace/members  (owner, admin, manager, analyst)
-> 200 `{ workspace_id, role, members:[...as above], invitations:[{id,email,role,business_ids?,invited_by,expires_at,created_at}] }` (`invitations` only for owner/admin; pending only; tokens are never returned). Errors: 403 `forbidden`, 404.

### POST /api/workspace/invite  (owner, admin)
`{ email, role: "admin"|"manager"|"analyst"|"client", business_ids?: string[] (required and non-empty for client; must belong to the workspace), workspace_id? }`
201: `{ invitation:{id,email,role,expires_at,created_at}, invite_url, email_sent:boolean, note }`. `invite_url` (`https://www.localboost.in/dashboard/accept-invite.html?token=...`) is **shown once**; only a hash is stored. Valid 7 days. An email is sent through the notifications module when configured (`email_sent`); a missing provider never fails the invite. Re-inviting an email revokes the earlier pending invitation.
Errors: 400 `invalid_email` | `invalid_role` (including `owner`; use transfer) | `invalid_business_ids`; 403 `forbidden`; 403 `upgrade_required` `{feature:"team_members",plan_code,member_limit}`; 409 `already_member`; 429.

### POST /api/workspace/invitations/revoke  (owner, admin)
`{ invitation_id, workspace_id? }` -> 200 `{ok:true}`. Errors: 404 `invitation_not_found`, 409 `invitation_not_pending`.

### POST /api/workspace/accept  (signed in; no role needed)
`{ token }` -> 200 `{ ok:true, workspace_id, workspace_name, role }`. The invitation email must equal the signed-in Google account email (case-insensitive). One-time use.
Errors: 400 `invalid_token`; 403 `email_mismatch` (invite is not consumed; ask the user to sign in with the invited account) | `upgrade_required`; 404 `invitation_not_found`; 409 `already_member`; 410 `invitation_revoked` | `invitation_used` | `invitation_expired`.

### POST /api/workspace/members/role  (owner, admin)
`{ user_id, role?: owner|admin|manager|analyst|client, status?: "active"|"suspended", business_ids? (required when making someone client), workspace_id? }` -> 200 `{ ok, user_id, role, status }`. Suspended members have no access at all until reactivated.
Errors: 400 `invalid_role` | `invalid_status` | `invalid_business_ids`; 403 `forbidden_role` (admin granting owner) | `forbidden_target`; 404 `member_not_found`; 409 `last_owner`.

### POST /api/workspace/members/remove  (owner, admin; **reauth**)
`{ user_id, workspace_id? }` -> 200 `{ok:true}`. Access is lost immediately, client assignments are deleted. Errors: 400 `use_leave` (own id), 403 `forbidden_target` | `reauth_required`, 404 `member_not_found`, 409 `last_owner`.

### POST /api/workspace/leave  (any member)
`{ workspace_id? }` -> 200 `{ok:true}`. Errors: 400 `cannot_leave_personal`, 409 `last_owner`.

### POST /api/workspace/transfer-ownership  (owner; **reauth**)
`{ user_id, confirm: "TRANSFER", workspace_id? }` -> 200 `{ ok, owner_user_id, your_role:"admin" }`. The previous owner becomes admin. Seat limits follow the new owner's plan afterwards. Errors: 400 `confirmation_required` | `invalid_request`, 403 `reauth_required` | `forbidden`, 404 `member_not_found`.

### POST /api/workspace/businesses/attach  (owner, admin)
`{ business_id, workspace_id? }` moves a business **you created** into the (team) workspace so its members can reach it. -> 200 `{ok,business_id,workspace_id}`. Errors: 404 `business_not_found` (also when you are not the creator). Client assignments from the previous workspace are cleared.

### GET /api/audit-logs?limit=&before=&workspace_id=  (owner, admin)
`limit` 1-200 (default 50). Newest first. 200: `{ logs:[{id,actor_user_id,actor_email,action,target_type,target_id,metadata:{},created_at}], next_before: string|null }`; pass `next_before` as `before` for the next page. Errors: 400 `invalid_cursor`, 403 `forbidden`.
Actions: `workspace.rename`, `invitation.create|accept|revoke`, `member.update|remove|leave`, `workspace.transfer_ownership`, `business.attach`, `sessions.revoke_all`. Metadata never contains tokens; IPs are stored hashed and not returned.

### GET /api/me/permissions?workspace_id=
200 `{ workspace_id, role, permissions:["team.manage", ...] }` - use it to hide UI actions (the server still enforces).

### GET /api/sessions
200 `{ sessions:[{created_at, expires_at, current:boolean}] }` (own, unexpired; no identifiers).

### POST /api/sessions/revoke-all
Deletes every session of the user, including the current one, and clears the cookie. 200 `{ok:true, revoked:n}`. The UI must redirect to sign-in.

## Plan gating (`upgrade_required`)
Seats = active members + pending invitations, limited by the **workspace owner's** plan: free 1 (owner only), pro 3, agency 25. Over the limit: `403 {code:"upgrade_required", feature:"team_members", plan_code, member_limit}`.

## Existing endpoints and roles
`ctx.getUserBusiness` now succeeds for the business creator and for active owner/admin/manager members of the business's workspace, and never for analyst/client. `ctx.getBusinessAccess(id)` -> `{business, role, canWrite}` also covers analyst and assigned clients (read-only).

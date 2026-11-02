# FAVMED local ZIP → Vercel Online

## Source of truth

The user-provided `FAVMED(1).zip` is the reference for the local workflow and visual organization. The online app remains a Vite application under `online/`, connected to Supabase for authenticated, shared state.

## Local workflow preserved in the online app

- Reception 1/2/3 check-in and patient registration.
- Shared daily queue for reception and the four professional rooms.
- Separate public waiting-room route (`/sala`) that displays calls only.
- Per-exam call / in-progress / completion states.
- Patient sheet viewing, priority, ASO pending/completed status, CSV export and reception JSON backup.
- Exam catalog additions represented in the online reception form.
- Responsive reception form + queue layout, using the local ZIP's modular form style and card-like queue presentation.

## Vercel deployment

- Vercel project: `favmed`, linked to `danielmarkpsn-pixel/FAVMED`.
- Application root/build lives in `online/` (Vite).
- Preview deployments are used for branch validation; production remains on the configured production branch.
- Required client environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. These must be configured in Vercel Preview and Production. Never put the service-role key in client variables.
- Supabase remains the shared database/auth provider; no schema or external database changes are performed by this UI alignment.

## This branch

The reception queue table is styled as responsive cards to follow the local interface more closely while retaining the existing Supabase query/render logic and delegated action handlers. No changes are made to `main`, production aliases, Supabase data, or Edge Functions in this branch.

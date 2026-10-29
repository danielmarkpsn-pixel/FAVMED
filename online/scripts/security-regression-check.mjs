import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [edge, frontend, queueFile] = await Promise.all([
  readFile(new URL('../supabase/functions/master-users/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../../fila.json', import.meta.url), 'utf8'),
]);

// Regression guardrails for security-sensitive administrative operations.
// These checks complement (but do not replace) live Supabase RLS/integration tests.
assert.match(edge, /Access-Control-Allow-Origin["']?\s*:\s*allowedOrigin/);
assert.doesNotMatch(edge, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
assert.match(edge, /requestOrigin !== allowedOrigin/);
assert.match(edge, /auth\.getUser\(token\)/);
assert.match(edge, /caller\.role !== "master" \|\| caller\.active !== true/);
assert.match(edge, /new Set\(\["recepcao", "profissional", "sala"\]\)/);
assert.match(edge, /INVITE_RATE_LIMITED/);
assert.match(edge, /INVITE_EMAIL_EXISTS/);
assert.match(edge, /set_active/);
assert.match(frontend, /response\.clone\(\)\.json\(\)/);
assert.match(frontend, /profile\.active !== true/);
// Password recovery must be recognized through Supabase's auth event too,
// because PKCE links can carry only ?code=... and omit type=recovery.
assert.match(frontend, /event === 'PASSWORD_RECOVERY'/);
assert.match(frontend, /passwordRecoveryInProgress \|\| isInvite \|\| isRecovery/);
assert.match(frontend, /renderPasswordUpdate\(true\)/);

// Patient data must never be committed to the legacy local queue file.
assert.deepEqual(JSON.parse(queueFile), [], 'fila.json must remain empty in the repository; use synthetic fixtures outside tracked production data.');

console.log('Security regression guardrails passed. Live RLS and session-revocation tests remain required.');

const operationalMigration = await readFile(new URL('../supabase/migrations/20261029150000_operational_foundation.sql', import.meta.url), 'utf8');
assert.match(frontend, /renderOperationalModules\(profile, userId\)/);
assert.match(frontend, /patient-checkin-form/);
assert.match(frontend, /room-setup-form/);
assert.match(frontend, /visit_exams/);
assert.match(operationalMigration, /alter table public\.patients enable row level security/);
assert.match(operationalMigration, /alter table public\.patient_visits force row level security/);
assert.match(operationalMigration, /security definer/);
assert.match(operationalMigration, /profiles_select_staff_directory/);
assert.match(operationalMigration, /room_type text not null default 'outro'/);
assert.doesNotMatch(operationalMigration, /room_type text not null default 'atendimento'/);
assert.match(operationalMigration, /visit_exams_update_room/);
assert.match(operationalMigration, /grant update \\(status, result_summary, completed_at, display_order, updated_at\\) on public\\.visit_exams/);
assert.doesNotMatch(operationalMigration, /grant update \\(status, result_summary, completed_by/);
assert.match(operationalMigration, /create or replace function private\\.set_visit_exam_completion/);
assert.match(operationalMigration, /new\\.completed_by := \\(select auth\\.uid\\(\\)\\)/);
assert.match(frontend, /payload\\.completed_at = new Date\\(\\)\\.toISOString\\(\\)/);
assert.doesNotMatch(frontend, /payload\\.completed_by = userId/);
assert.match(operationalMigration, /grant update \(visit_date, attendance_type, status, company_name, professional_id, room_id, started_at, completed_at, updated_at\) on public\.patient_visits/);
assert.match(operationalMigration, /create policy patients_select_authorized/);
assert.match(operationalMigration, /create policy patient_visits_update_professional/);
assert.match(operationalMigration, /create policy visit_exams_update_professional/);

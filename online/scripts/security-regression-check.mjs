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
assert.ok(operationalMigration.includes('grant update (status, result_summary, display_order, updated_at) on public.visit_exams to authenticated;'));
assert.ok(!operationalMigration.includes('grant update (status, result_summary, completed_by'));
assert.ok(operationalMigration.includes('create or replace function private.set_visit_exam_completion'));
assert.ok(operationalMigration.includes('new.completed_by := (select auth.uid());'));
assert.ok(!frontend.includes('payload.completed_at = new Date().toISOString()'));
assert.ok(!frontend.includes('payload.started_at = new Date().toISOString()'));
assert.ok(!frontend.includes('payload.completed_by = userId'));
assert.match(operationalMigration, /grant update \(visit_date, attendance_type, status, company_name, professional_id, room_id, started_at, completed_at, updated_at\) on public\.patient_visits/);
assert.match(operationalMigration, /create policy patients_select_authorized/);
const integrityMigration = await readFile(new URL('../supabase/migrations/20261029195000_visit_timestamp_integrity.sql', import.meta.url), 'utf8');
assert.ok(integrityMigration.includes('create or replace function private.set_patient_visit_timestamps'));
assert.ok(integrityMigration.includes('revoke update (started_at, completed_at) on public.patient_visits from authenticated;'));
assert.ok(integrityMigration.includes('create or replace function private.set_audit_created_by'));
assert.match(integrityMigration, /patients_created_by_idx/);
assert.match(integrityMigration, /patient_visits_created_by_idx/);
assert.match(operationalMigration, /create policy patient_visits_update_professional/);
assert.match(operationalMigration, /create policy visit_exams_update_professional/);

// Each role gets its own page; Master must not contain operational setup.
assert.match(frontend, /master: '\/master', recepcao: '\/recepcao', profissional: '\/profissional', sala: '\/sala'/);
assert.match(frontend, /if \(!isMaster\) \{ renderOperationalModules\(profile, userId\); return; \}/);
assert.match(frontend, /async function renderPublicWaitingRoom\(\)/);
assert.match(frontend, /window\.location\.pathname === '\/sala'\) return renderPublicWaitingRoom\(\)/);
assert.match(frontend, /public_waiting_room_calls/);
assert.doesNotMatch(frontend, /<option value="sala">Sala de espera<\/option>/);

const publicWaitingMigration = await readFile(new URL('../supabase/migrations/20261029201000_public_waiting_room.sql', import.meta.url), 'utf8');
assert.match(publicWaitingMigration, /create or replace view public\.public_waiting_room_calls/);
assert.match(publicWaitingMigration, /grant select on public\.public_waiting_room_calls to anon/);
assert.match(publicWaitingMigration, /revoke all on public\.public_waiting_room_calls from public, authenticated/);
assert.match(publicWaitingMigration, /v\.status = 'em_atendimento'/);
const publicWaitingColumns = publicWaitingMigration.split('as\nselect')[1]?.split('\nfrom public.patient_visits')[0] || '';
assert.doesNotMatch(publicWaitingColumns, /cpf|birth_date|company_name|exam_name/i);

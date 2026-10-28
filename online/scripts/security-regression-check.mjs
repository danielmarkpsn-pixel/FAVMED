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
assert.match(frontend, /profile\.active !== true/);\n\n// Patient data must never be committed to the legacy local queue file.\nassert.deepEqual(JSON.parse(queueFile), [], 'fila.json must remain empty in the repository; use synthetic fixtures outside tracked production data.');

console.log('Security regression guardrails passed. Live RLS and session-revocation tests remain required.');

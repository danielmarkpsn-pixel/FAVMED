import { readFileSync } from "node:fs";
import vm from "node:vm";

const htmlFiles = ["index.html", "consultorio.html", "importar-backup.html"];
for (const file of htmlFiles) {
  const source = readFileSync(file, "utf8");
  const scripts = source.split("<script").slice(1).map(block => {
    const openEnd = block.indexOf(">");
    const closeStart = block.indexOf("</script>");
    return openEnd >= 0 && closeStart >= 0 ? block.slice(openEnd + 1, closeStart) : "";
  }).filter(code => code.trim());
  for (let index = 0; index < scripts.length; index += 1) {
    new vm.Script(scripts[index], { filename: file + "#script-" + index });
  }
}

const reception = readFileSync("index.html", "utf8");
const professional = readFileSync("consultorio.html", "utf8");
const cloud = readFileSync("favmed-cloud.js", "utf8");
const auth = readFileSync("favmed-auth.js", "utf8");

for (const id of ["patientForm", "patientList", "calledDisplay", "publicScreen", "slideshowFiles", "visualizarFicha", "clearToday"]) {
  if (!reception.includes('id="' + id + '"')) throw new Error("Tela local da recepção perdeu o elemento " + id);
}
if (!professional.includes("FAVMED — Painel do profissional")) throw new Error("Painel profissional local não encontrado.");
if (!reception.includes("FAVMED_LOCAL_MODE") || !professional.includes("FAVMED_LOCAL_MODE") || !auth.includes("if (localMode)")) {
  throw new Error("O modo local precisa continuar sem autenticação.");
}
for (const rpc of ["favmed_get_queue", "favmed_get_public_queue", "favmed_set_queue"]) {
  if (!cloud.includes(rpc)) throw new Error("Integração Supabase ausente: " + rpc);
}
for (const feature of ["uploadPatientDocument", "listSlideshow", "uploadSlideshow"]) {
  if (!cloud.includes(feature)) throw new Error("Integração Storage ausente: " + feature);
}
if (reception.includes("dashboard-shell") || reception.includes("createRoot(")) {
  throw new Error("A interface reconstruída da pasta online não pode substituir a tela local.");
}

const dailyMigration = readFileSync("online/supabase/migrations/20261103153000_daily_queue_partition_and_cleanup.sql", "utf8");
for (const required of ["favmed_queue_days", "America/Manaus", "favmed_daily_cleanup", "33554432", "favmed-daily-reset"]) {
  if (!dailyMigration.includes(required)) throw new Error("Rotina diária ausente ou incompleta: " + required);
}
if (!dailyMigration.includes("delete from public.visit_exams") || !dailyMigration.includes("delete from public.patient_visits") || !dailyMigration.includes("delete from public.patients")) {
  throw new Error("A limpeza inicial dos dados antigos não está registrada na migração.");
}

const waitingRoomMigration = readFileSync("online/supabase/migrations/20261103180000_reception_waiting_room_access.sql", "utf8");
for (const required of ["v_role is null or v_role not in ('master', 'recepcao')", "security definer", "revoke all on function public.favmed_get_public_queue(text) from public, anon", "grant execute on function public.favmed_get_public_queue(text) to authenticated"]) {
  if (!waitingRoomMigration.includes(required)) throw new Error("Acesso seguro da sala de espera ausente ou incompleto: " + required);
}
for (const required of [
  'if (publicMode) {',
  'role: "public_display"',
  'cloud.resolveAuth({ role: "public_display", active: true })'
]) {
  if (!auth.includes(required)) throw new Error("A sala de espera deve abrir sem login: " + required);
}
for (const required of [
  'const publicClient = window.supabase.createClient',
  'persistSession: false',
  'publicClient.rpc("favmed_get_public_queue"'
]) {
  if (!cloud.includes(required)) throw new Error("A leitura pública isolada da fila está ausente: " + required);
}
const publicDisplayMigration = readFileSync("online/supabase/migrations/20261106163834_public_waiting_room_display.sql", "utf8");
const publicDisplayGrantMigration = readFileSync("online/supabase/migrations/20261106164044_limit_waiting_room_rpc_to_anon.sql", "utf8");
if (!publicDisplayGrantMigration.includes("from authenticated") || !publicDisplayGrantMigration.includes("to anon")) {
  throw new Error("A RPC pública da sala deve ser acessível somente ao cliente anônimo dedicado.");
}
for (const required of [
  "if auth.uid() is not null then",
  "grant execute on function public.favmed_get_public_queue(text) to anon, authenticated",
  "p_day <> v_today::text",
  "'name', p.value->'name'",
  "'room', p.value->'room'"
]) {
  if (!publicDisplayMigration.includes(required)) throw new Error("Acesso público limitado da sala de espera ausente: " + required);
}
for (const forbidden of ["'cpf'", "'birthDate'", "'insurance'", "'document'"]) {
  if (publicDisplayMigration.includes(forbidden)) throw new Error("A fila pública não pode expor dados pessoais: " + forbidden);
}

console.log("FAVMED local parity checks passed.");

import { readFileSync } from "node:fs";
import vm from "node:vm";

const htmlFiles = ["index.html", "consultorio.html", "importar-backup.html"];
for (const file of htmlFiles) {
  const source = readFileSync(file, "utf8");
  const scripts = [...source.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)]
    .map(match => match[1])
    .filter(code => code.trim());
  for (let index = 0; index < scripts.length; index += 1) {
    new vm.Script(scripts[index], { filename: file + "#script-" + index });
  }
}

const reception = readFileSync("index.html", "utf8");
const professional = readFileSync("consultorio.html", "utf8");
const cloud = readFileSync("favmed-cloud.js", "utf8");
const auth = readFileSync("favmed-auth.js", "utf8");

for (const id of ["patientForm", "patientList", "calledDisplay", "publicScreen", "slideshowFiles", "visualizarFicha"]) {
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
console.log("FAVMED local parity checks passed.");

import { createClient } from '@supabase/supabase-js';
import './style.css';
import logoFavmed from '../../logo-favmed.png';

const root = document.querySelector('#app');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const configured = Boolean(supabaseUrl && supabaseKey);
// Supabase PKCE recovery links can arrive as ?code=... without type=recovery.
// PASSWORD_RECOVERY is the reliable signal for that flow.
let passwordRecoveryInProgress = false;
const supabase = configured ? createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
}) : null;

const roleLabels = {
  master: 'Administrador Master',
  recepcao: 'Recepção',
  profissional: 'Profissional',
  sala: 'Sala de espera',
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderSetup() {
  root.innerHTML = `
    <main class="shell"><section class="login-card">
      <img class="brand-logo" src="${logoFavmed}" alt="Logo Clínica Favmed" />
      <p class="eyebrow">CLÍNICA FAVMED</p><h1>FAVMED Online</h1>
      <p class="muted">Acesso centralizado e seguro à clínica.</p>
      <div class="notice" role="alert">O ambiente ainda não foi configurado. Defina
        <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
        Nenhum banco externo foi conectado ou alterado por esta etapa.</div>
    </section></main>`;
}

function renderLogin(message = '', isError = false) {
  root.innerHTML = `
    <main class="shell"><section class="login-card" aria-labelledby="page-title">
      <img class="brand-logo" src="${logoFavmed}" alt="Logo Clínica Favmed" />
      <p class="eyebrow">CLÍNICA FAVMED · MEDICINA OCUPACIONAL</p>
      <h1 id="page-title">Bem-vindo ao FAVMED</h1>
      <p class="muted">Entre com a conta fornecida pelo administrador da clínica.</p>
      <form id="login-form" novalidate>
        <label for="email">E-mail de acesso</label>
        <input id="email" name="email" type="email" autocomplete="username" placeholder="usuario@clinica.com.br" required maxlength="254" />
        <label for="password">Senha</label>
        <div class="password-wrap">
          <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required />
          <button class="reveal" id="toggle-password" type="button" aria-label="Mostrar senha">Mostrar</button>
        </div>
        <button class="submit" id="submit-button" type="submit">Entrar com segurança</button>
        <button class="secondary" id="recover-password" type="button">Esqueci minha senha</button>
        <p id="form-message" class="message ${isError ? 'error' : ''}" role="status">${escapeHtml(message)}</p>
      </form>
      <p class="footnote">A criação de contas é restrita ao administrador Master. Não há cadastro público.</p>
    </section><footer>FAVMED Online · Acesso restrito à Clínica Favmed</footer></main>`;

  const form = document.querySelector('#login-form');
  const submit = document.querySelector('#submit-button');
  const status = document.querySelector('#form-message');
  document.querySelector('#toggle-password').addEventListener('click', () => {
    const input = document.querySelector('#password');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    document.querySelector('#toggle-password').textContent = showing ? 'Mostrar' : 'Ocultar';
    document.querySelector('#toggle-password').setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
  });

  document.querySelector('#recover-password').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim();
    if (!email) {
      status.textContent = 'Informe seu e-mail para receber o link de redefinição.';
      status.className = 'message error';
      document.querySelector('#email').focus();
      return;
    }
    const recoverButton = document.querySelector('#recover-password');
    recoverButton.disabled = true;
    status.textContent = 'Enviando link de redefinição…';
    status.className = 'message';
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      status.textContent = 'Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.';
      status.className = 'message';
    } catch (error) {
      status.textContent = error.message || 'Não foi possível enviar o link. Tente novamente.';
      status.className = 'message error';
    } finally {
      recoverButton.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = new FormData(form).get('email')?.toString().trim();
    const password = new FormData(form).get('password')?.toString();
    if (!email || !password) {
      status.textContent = 'Informe seu e-mail e sua senha.';
      status.className = 'message error';
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Verificando acesso…';
    status.textContent = '';
    status.className = 'message';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new Error('Não foi possível entrar. Confira os dados ou solicite ajuda ao administrador.');
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('role, active, display_name').eq('id', data.user.id).maybeSingle();
      if (profileError || !profile || profile.active !== true || !roleLabels[profile.role]) {
        await supabase.auth.signOut();
        throw new Error('A conta não possui perfil autorizado ou está inativa. Contate o administrador Master.');
      }
      const homePath = ({ master: '/master', recepcao: '/recepcao', profissional: '/profissional', sala: '/sala' })[profile.role];
      window.history.replaceState({}, document.title, homePath);
      if (profile.role === 'sala') return renderPublicWaitingRoom();
      renderHome(profile, data.user.id);
    } catch (error) {
      status.textContent = error.message || 'Falha ao validar o acesso.';
      status.className = 'message error';
      submit.disabled = false;
      submit.textContent = 'Entrar com segurança';
    }
  });
}

function renderPasswordUpdate(isRecovery = false) {
  const heading = isRecovery ? 'Redefinir senha' : 'Concluir seu acesso';
  const description = isRecovery
    ? 'Crie uma nova senha para voltar a acessar o FAVMED.'
    : 'Defina uma senha para concluir o convite.';
  const submitLabel = isRecovery ? 'Salvar nova senha' : 'Salvar senha e concluir';
  const expiredMessage = isRecovery
    ? 'O link de recuperação expirou ou já foi utilizado. Solicite outro link e tente novamente.'
    : 'O convite expirou ou já foi utilizado. Solicite um novo convite ao administrador.';
  root.innerHTML = `<main class="shell"><section class="login-card"><img class="brand-logo" src="${logoFavmed}" alt="Logo Clínica Favmed" /><p class="eyebrow">CLÍNICA FAVMED</p><h1>${heading}</h1><p class="muted">${description}</p><form id="update-password-form"><label for="new-password">Nova senha</label><input id="new-password" name="password" type="password" minlength="8" autocomplete="new-password" required><label for="confirm-new-password">Confirmar nova senha</label><input id="confirm-new-password" name="confirm_password" type="password" minlength="8" autocomplete="new-password" required><button class="submit" id="update-password-submit" type="submit">${submitLabel}</button><p id="update-password-message" class="message" role="status"></p></form></section><footer>FAVMED Online · Acesso restrito à Clínica Favmed</footer></main>`;
  const form = document.querySelector('#update-password-form');
  const button = document.querySelector('#update-password-submit');
  const status = document.querySelector('#update-password-message');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const password = String(values.password || '');
    if (password.length < 8) { status.textContent = 'A senha deve ter pelo menos 8 caracteres.'; status.className = 'message error'; return; }
    if (password !== String(values.confirm_password || '')) { status.textContent = 'As senhas não coincidem.'; status.className = 'message error'; return; }
    button.disabled = true; button.textContent = 'Salvando senha…';
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user) throw new Error(expiredMessage);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      const user = sessionData.session.user;
      const { data: profile, error: profileError } = await supabase.from('profiles').select('role, active, display_name').eq('id', user.id).maybeSingle();
      if (profileError || !profile || profile.active !== true || !roleLabels[profile.role]) { await supabase.auth.signOut(); throw new Error('A conta não possui perfil autorizado ou está inativa. Contate o administrador Master.'); }
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      renderHome(profile, user.id);
    } catch (error) { status.textContent = error.message || 'Não foi possível atualizar a senha.'; status.className = 'message error'; button.disabled = false; button.textContent = submitLabel; }
  });
}
async function callMasterAction(body) {
  const { data, error } = await supabase.functions.invoke('master-users', { body });
  if (error) {
    // FunctionsHttpError may carry the structured JSON response on its
    // Response context. Clone it before reading so the original stays usable.
    let serverMessage = '';
    try {
      const response = error.context;
      if (response && typeof response.clone === 'function') {
        const payload = await response.clone().json();
        serverMessage = typeof payload?.error === 'string' ? payload.error : '';
      }
    } catch {
      // Fall back to the SDK error if the response has no JSON body.
    }
    throw new Error(serverMessage || data?.error || error.message || 'Falha ao comunicar com a função administrativa.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function renderUserRows(users) {
  if (!users.length) return '<tr><td colspan="4">Nenhuma conta encontrada.</td></tr>';
  return users.map((user) => `
    <tr>
      <td><strong>${escapeHtml(user.display_name)}</strong><br><small>${escapeHtml(user.id)}</small></td>
      <td>${escapeHtml(roleLabels[user.role] || user.role)}</td>
      <td><span class="status-pill ${user.active ? 'active' : 'inactive'}">${user.active ? 'Ativa' : 'Bloqueada'}</span></td>
      <td>${user.role === 'master' ? '<span class="muted">Protegida</span>' : `
        <button class="secondary user-toggle" type="button" data-user-id="${escapeHtml(user.id)}" data-next-active="${!user.active}">
          ${user.active ? 'Bloquear' : 'Ativar'}
        </button>`}</td>
    </tr>`).join('');
}


const operationalStatuses = {
  aguardando: 'Aguardando',
  chamado: 'Chamado',
  em_atendimento: 'Em atendimento',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
};
const examCatalog = {
  'Sala 1': ['Raio-X', 'Tórax PA', 'Tórax Perfil', 'Tórax OIT', 'Tórax AP', 'Coluna Lombar', 'Coluna Lombo Sacra', 'Coluna Total', 'Coluna Cervical', 'Coluna Torácica', 'Coluna Dorsal', 'Ombros', 'Ombro D', 'Ombro E', 'Mãos', 'Mão D', 'Mão E', 'Joelhos', 'Joelhos D', 'Joelhos E', 'Punhos', 'Punhos D', 'Punhos E'],
  'Sala 2': ['Coleta de sangue', 'Hemograma C.', 'Glicose', 'Creatinina', 'Tipagem S.', 'Beta', 'Colesterol', 'Colinesterase', 'Cultura F', 'EPF', 'EAS', 'Acetona', 'Teste Ergonométrico', 'Acetona na Urina', 'Ácido Mandélico', 'Hemoglobina Glicada', 'Lipidograma', 'Chumbo na Urina', 'Micológico', 'Toxicológico', 'Triglicerídeos', 'TGO', 'TGP', 'Chumbo sanguíneo', 'Hepatite HBsAg', 'Hepatite Anti-HBs', 'Hepatite Anti-HCV', 'Hepatite B - ANTI-HBC TOTAL', 'Metil etil cetona', 'Ácido metil-hipúrico', 'Ácido hipúrico', 'Ácido delta-aminolevulínico'],
  'Sala 3': ['Audiometria', 'Audiometria Tonal', 'Audiometria Vocal', 'Audiometria Ocupacional', 'Audiometria Concurso', 'Teste Otoneurológico', 'Teste Vestibular'],
  'Sala 4': ['EEG', 'ECG', 'Espirometria', 'Acuidade', 'Acuidade com percepção de cores', 'Av Psico', 'Mapa 24h', 'Holter 24h', 'Risco Cirúrgico'],
};
const defaultExams = [...new Set(Object.values(examCatalog).flat().concat(['ASO']))];
const todayLocal = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

function operationalMessage(target, message, isError = false) {
  const node = document.querySelector(target);
  if (!node) return;
  node.textContent = message;
  node.className = isError ? 'message error' : 'message';
}

async function renderOperationalModules(profile, userId) {
  const panel = document.querySelector('#operational-panel');
  if (!panel) return;
  const canRegister = profile.role === 'recepcao';
  panel.innerHTML = `
    <div class="operational-heading">
      <div><p class="eyebrow">OPERAÇÃO CLÍNICA</p><h2>Módulos operacionais: ${profile.role === 'recepcao' ? 'RECEPÇÃO' : 'PROFISSIONAIS'}</h2><p class="muted">${profile.role === 'recepcao' ? 'Cadastro de pacientes, organização de salas, chamadas e acompanhamento da fila.' : 'Fila de atendimentos, chamadas, execução e conclusão dos exames.'}</p></div>
      <div class="operational-heading-actions"><a class="secondary" href="/sala" target="_blank" rel="noopener noreferrer">Abrir tela de chamadas</a><button class="secondary" id="refresh-operational" type="button">Atualizar dados</button></div>
    </div>
    ${canRegister ? `
      <section class="module-card">
        <h3>Recepção · Cadastrar paciente e atendimento</h3>
        <p class="muted">Cadastre o paciente, registre a entrada na fila e associe os exames solicitados.</p>
        <form id="patient-checkin-form" class="operational-form">
          <details class="form-module" open>
            <summary>Cadastrar Paciente</summary>
            <div class="module-content">
              <div class="field"><label for="patient-name">NOME DO PACIENTE *</label><input id="patient-name" name="full_name" required maxlength="160" autocomplete="name" placeholder="Nome completo"></div>
              <div class="field"><label for="patient-cpf">CPF (somente números)</label><input id="patient-cpf" name="cpf" inputmode="numeric" pattern="[0-9]{11}" maxlength="11" placeholder="11 dígitos"></div>
              <div class="field"><label for="patient-birth">DATA DE NASCIMENTO</label><input id="patient-birth" name="birth_date" type="date"></div>
              <div class="field"><label for="patient-company">EMPRESA</label><input id="patient-company" name="company_name" maxlength="160" placeholder="Nome da empresa"></div>
              <div class="field"><label for="patient-insurance">CONVÊNIO / PARTICULAR</label><input id="patient-insurance" name="insurance" maxlength="100" placeholder="Convênio ou particular"></div>
              <div class="field"><label for="patient-job">FUNÇÃO / CARGO</label><input id="patient-job" name="job_title" maxlength="100" placeholder="Função do paciente"></div>
              <div class="field"><label for="patient-pdf">DOCUMENTO DO PACIENTE (PDF — ATÉ 10 MB)</label><input id="patient-pdf" name="patient_pdf" type="file" accept="application/pdf,.pdf"><p class="sub">Documento privado; somente equipe autorizada poderá abrir.</p></div>
            </div>
          </details>
          <details class="form-module">
            <summary>Tipo de Exame / Atendimento</summary>
            <div class="module-content">
              <div class="field"><label for="visit-type">TIPO DE EXAME / ATENDIMENTO *</label><select id="visit-type" name="attendance_type" required><option value="Admissional">Admissional</option><option value="Demissional">Demissional</option><option value="Periódico">Periódico</option><option value="Retorno">Retorno</option><option value="Mudança de riscos">Mudança de riscos</option><option value="Particular">Particular</option><option value="Pontual">Pontual</option><option value="Consulta Ocupacional">Consulta Ocupacional</option><option value="Concurso">Concurso</option><option value="Agendado">Agendado</option></select></div>
              <div class="field"><label for="visit-room">SALA</label><select id="visit-room" name="room_ids" multiple size="5" aria-describedby="visit-room-help"></select><p class="sub" id="visit-room-help">Selecione uma ou várias salas. Use Ctrl (Windows) ou Command (Mac) para marcar mais de uma.</p></div>
            </div>
          </details>
          <details class="form-module">
            <summary>Marcar Exames Específicos</summary>
            <div class="module-content">
              <div class="field"><label>EXAMES SOLICITADOS (MARQUE TODOS POR SALA)</label>
                ${Object.entries(examCatalog).map(([roomName, exams]) => `<details class="exam-room-menu"><summary>${escapeHtml(roomName)} — ${roomName === 'Sala 1' ? 'RX' : roomName === 'Sala 2' ? 'Coleta / laboratório' : roomName === 'Sala 3' ? 'Audiometria' : 'Exames complementares'}</summary><div class="service-options">${exams.map((exam) => `<label class="service-option"><input type="checkbox" name="exam_names" data-room-name="${roomName}" value="${escapeHtml(exam)}"> ${escapeHtml(exam)}</label>`).join('')}</div></details>`).join('')}
                <div class="service-options"><label class="service-option"><input type="checkbox" name="exam_names" value="ASO"> ASO</label></div>
              </div>
              <div class="field"><label for="other-exams">OUTROS EXAMES (OPCIONAL)</label><textarea id="other-exams" name="other_exam_names" rows="3" placeholder="Digite outros exames, um por linha"></textarea></div>
            </div>
          </details>
          <div class="module-content reception-flags">
            <label class="service-option"><input type="checkbox" name="priority" value="true"> Prioridade no atendimento</label>
            <label class="service-option"><input type="checkbox" name="aso_pending" value="true"> ASO pendente</label>
          </div>
          <button class="submit" id="checkin-submit" type="submit">Cadastrar paciente e gerar ficha</button>
          <p id="checkin-message" class="message" role="status"></p>
        </form>
      </section>` : ''}

    ${profile.role === 'recepcao' ? `
      <section class="module-card">
        <h3>Editar salas</h3>
        <p class="muted">Cadastre e organize as salas utilizadas pela recepção e pelos profissionais. O painel de chamadas funciona sem login.</p>
        <form id="room-setup-form" class="operational-form">
          <div class="form-grid">
            <div><label for="room-name">Nome da sala *</label><input id="room-name" name="name" required maxlength="80" placeholder="Ex.: Audiometria"></div>
            <div><label for="room-type">Tipo</label><select id="room-type" name="room_type"><option value="exame">Exame</option><option value="consulta">Consulta</option><option value="recepcao">Recepção</option><option value="espera">Espera</option><option value="outro">Outro</option></select></div>
          </div>
          <button class="submit" id="room-create-submit" type="submit">Salvar sala</button>
          <p id="room-setup-message" class="message" role="status"></p>
        </form>
        <div class="table-wrap"><table class="users-table"><thead><tr><th>Sala</th><th>Tipo</th><th>Status</th><th>Ação</th></tr></thead><tbody id="room-list-rows"><tr><td colspan="4">Carregando salas…</td></tr></tbody></table></div>
      </section>` : ''}
    <section class="module-card">
      <div class="users-heading"><h3>${profile.role === 'sala' ? 'Exames desta sala' : profile.role === 'profissional' ? 'Painel do profissional' : 'Pacientes na fila'}</h3><span class="muted" id="operational-count"></span></div>
      <div class="operational-tools">
        <input id="operational-search" type="search" placeholder="Buscar paciente ou exame..." aria-label="Buscar paciente ou exame" />
        ${profile.role === 'profissional' ? '<select id="professional-room-filter" aria-label="Filtrar por sala"><option value="">Todas as salas</option></select>' : ''}
        <button class="secondary" id="export-operational-csv" type="button">Exportar CSV</button>
        ${profile.role === 'recepcao' ? '<button class="secondary" id="backup-operational-json" type="button">Backup JSON</button>' : ''}
      </div>
      <div class="table-wrap"><table class="users-table operational-table">
        <thead><tr><th>Paciente / Atendimento</th><th>Exames</th><th>Status</th><th>Ação</th></tr></thead>
        <tbody id="operational-rows"><tr><td colspan="4">Carregando dados…</td></tr></tbody>
      </table></div>
      <p id="operational-message" class="message" role="status"></p>
    </section>`;

  const professionalSelect = document.querySelector('#visit-professional');
  const roomSelect = document.querySelector('#visit-room');
  const professionalRoomFilter = document.querySelector('#professional-room-filter');
  let lastPatientsById = new Map();
    if (profile.role === 'recepcao') {
    const { data: savedRooms, error: savedRoomsError } = await supabase.from('rooms')
      .select('id, name, room_type, active').order('display_order').order('name');
    const roomRows = document.querySelector('#room-list-rows');
    if (roomRows) roomRows.innerHTML = savedRoomsError
      ? '<tr><td colspan="3">Não foi possível carregar as salas.</td></tr>'
      : (savedRooms || []).map((room) => `<tr><td>${escapeHtml(room.name)}</td><td>${escapeHtml(room.room_type)}</td><td><span class="status-pill ${room.active ? 'active' : 'inactive'}">${room.active ? 'Ativa' : 'Inativa'}</span></td></tr>`).join('') || '<tr><td colspan="3">Nenhuma sala cadastrada.</td></tr>';
    const roomForm = document.querySelector('#room-setup-form');
    roomForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = document.querySelector('#room-create-submit');
      const values = Object.fromEntries(new FormData(form).entries());
      button.disabled = true;
      try {
        const roomId = form.dataset.editRoomId;
        const payload = { name: String(values.name || '').trim(), room_type: values.room_type };
        const { error } = roomId ? await supabase.from('rooms').update(payload).eq('id', roomId) : await supabase.from('rooms').insert(payload);
        if (error) throw error;
        form.reset(); delete form.dataset.editRoomId; document.querySelector('#room-create-submit').textContent = 'Salvar sala';
        operationalMessage('#room-setup-message', roomId ? 'Sala atualizada.' : 'Sala cadastrada.');
        await renderOperationalModules(profile, userId);
      } catch (error) {
        operationalMessage('#room-setup-message', error.message || 'Não foi possível cadastrar a sala.', true);
        button.disabled = false;
      }
    });
  }
  const [professionalResult, roomResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('role', 'profissional').eq('active', true).order('display_name'),
    supabase.from('rooms').select('id, name, room_type').eq('active', true).order('display_order').order('name'),
  ]);
  if (professionalSelect && !professionalResult.error) {
    professionalSelect.innerHTML = '<option value="">A definir</option>' + (professionalResult.data || []).map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.display_name || 'Profissional')}</option>`).join('');
  }
  if (roomSelect && !roomResult.error) {
    roomSelect.innerHTML = (roomResult.data || []).filter((r) => r.room_type !== 'recepcao').map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('');
  }
  if (professionalRoomFilter && !roomResult.error) {
    professionalRoomFilter.innerHTML = '<option value="">Todas as salas</option>' + (roomResult.data || []).filter((r) => r.room_type !== 'recepcao').map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('');
  }

  const roomRows = document.querySelector('#room-list-rows');
  if (roomRows && roomResult.data) roomRows.innerHTML = roomResult.data.map((room) => `<tr><td>${escapeHtml(room.name)}</td><td>${escapeHtml(room.room_type)}</td><td><span class="status-pill active">Ativa</span></td><td><button type="button" class="secondary edit-room-button" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}" data-room-type="${escapeHtml(room.room_type)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="4">Nenhuma sala cadastrada.</td></tr>';
  roomRows?.addEventListener('click', (event) => { const edit = event.target.closest('.edit-room-button'); if (!edit) return; const form = document.querySelector('#room-setup-form'); if (!form) return; form.dataset.editRoomId = edit.dataset.roomId; form.elements.name.value = edit.dataset.roomName; form.elements.room_type.value = edit.dataset.roomType; document.querySelector('#room-create-submit').textContent = 'Atualizar sala'; form.scrollIntoView({behavior:'smooth',block:'center'}); });

  async function loadOperationalRows() {
    const rows = document.querySelector('#operational-rows');
    if (!rows) return;
    rows.innerHTML = '<tr><td colspan="4">Carregando dados…</td></tr>';

    let visits = [];
    let workflows = [];
    let exams = [];
    let patients = [];
    if (profile.role === 'sala') {
      const { data: assignedRoom, error: assignedRoomError } = await supabase.from('rooms')
        .select('id').eq('assigned_profile_id', userId).eq('active', true).maybeSingle();
      if (assignedRoomError || !assignedRoom) {
        rows.innerHTML = '<tr><td colspan="4">Nenhuma sala ativa está vinculada a esta conta. Solicite a configuração ao Master.</td></tr>';
        return;
      }
      const { data: workflowRows, error: workflowError } = await supabase.from('visit_room_workflows')
        .select('id, visit_id, service_key, service_label, room_id, status, call_label, called_at, started_at, released_at, display_order')
        .eq('room_id', assignedRoom.id).in('status', ['chamado', 'em_atendimento'])
        .order('display_order').limit(100);
      if (workflowError) {
        rows.innerHTML = '<tr><td colspan="4">Não foi possível carregar os atendimentos desta sala. Verifique a migração de compatibilidade.</td></tr>';
        return;
      }
      workflows = workflowRows || [];
      const visitIds = [...new Set(workflows.map((workflow) => workflow.visit_id))];
      if (visitIds.length) {
        const { data, error } = await supabase.from('patient_visits')
          .select('id, patient_id, visit_date, attendance_type, status, checked_in_at, priority, aso_pending, aso_completed, initial_room_ids')
          .in('id', visitIds).eq('visit_date', todayLocal()).order('checked_in_at', { ascending: false });
        if (error) {
          rows.innerHTML = '<tr><td colspan="4">Não foi possível carregar a fila desta sala.</td></tr>';
          return;
        }
        visits = data || [];
      }
      return renderRows(visits, exams, true, patients, workflows);
    }

    let visitsQuery = supabase.from('patient_visits')
      .select('id, patient_id, visit_date, attendance_type, exam_types, status, professional_id, room_id, initial_room_ids, checked_in_at, priority, aso_pending, aso_completed, reception_call_room_id, reception_call_label, reception_called_at')
      .eq('visit_date', todayLocal())
      .order('checked_in_at', { ascending: false }).limit(100);
    if (profile.role === 'profissional') visitsQuery = visitsQuery.eq('professional_id', userId);
    const { data: visitRows, error: visitsError } = await visitsQuery;
    if (visitsError) {
      rows.innerHTML = '<tr><td colspan="4">Não foi possível carregar a fila. Verifique as permissões e a migração operacional.</td></tr>';
      return;
    }
    visits = visitRows || [];
    const visitIds = visits.map((visit) => visit.id);
    const patientIds = [...new Set(visits.map((visit) => visit.patient_id))];
    const [patientsResult, examsResult, workflowResult] = await Promise.all([
      patientIds.length ? supabase.from('patients').select('id, full_name, cpf, birth_date, company_name, insurance, job_title, document_path').in('id', patientIds) : Promise.resolve({ data: [], error: null }),
      visitIds.length ? supabase.from('visit_exams').select('id, visit_id, exam_name, status, room_id, display_order').in('visit_id', visitIds).order('display_order') : Promise.resolve({ data: [], error: null }),
      visitIds.length ? supabase.from('visit_room_workflows').select('id, visit_id, service_key, service_label, room_id, status, call_label, called_at, started_at, released_at, display_order').in('visit_id', visitIds).order('display_order') : Promise.resolve({ data: [], error: null }),
    ]);
    if (patientsResult.error || examsResult.error || workflowResult.error) {
      rows.innerHTML = '<tr><td colspan="4">Os dados foram parcialmente bloqueados. Confirme se a migração de fluxos por sala foi aplicada e revise a RLS.</td></tr>';
      return;
    }
    patients = patientsResult.data || [];
    exams = examsResult.data || [];
    workflows = workflowResult.data || [];
    renderRows(visits, exams, false, patients, workflows);
  }

  function renderRows(visits, exams, roomMode, patients = [], workflows = []) {
    const rows = document.querySelector('#operational-rows');
    const count = document.querySelector('#operational-count');
    if (!rows) return;
    lastPatientsById = new Map(patients.map((patient) => [patient.id, patient]));
    const roomById = new Map((roomResult.data || []).map((room) => [room.id, room]));
    const term = document.querySelector('#operational-search')?.value.trim().toLocaleLowerCase('pt-BR') || '';
    const selectedRoomId = document.querySelector('#professional-room-filter')?.value || '';
    visits = visits.filter((visit) => {
      const patient = lastPatientsById.get(visit.patient_id);
      const visitWorkflows = workflows.filter((workflow) => workflow.visit_id === visit.id);
      const visitExams = exams.filter((exam) => exam.visit_id === visit.id);
      const matchesRoom = !selectedRoomId || visitWorkflows.some((workflow) => workflow.room_id === selectedRoomId);
      const searchable = [patient?.full_name, patient?.cpf, patient?.company_name,
        ...visitWorkflows.map((workflow) => workflow.service_label),
        ...visitExams.map((exam) => exam.exam_name)].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return matchesRoom && (!term || searchable.includes(term));
    }).sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || new Date(a.checked_in_at || 0) - new Date(b.checked_in_at || 0));
    count.textContent = `${visits.length} atendimento(s)`;
    if (!visits.length) {
      rows.innerHTML = '<tr><td colspan="4">Nenhum atendimento encontrado.</td></tr>';
      return;
    }
    rows.innerHTML = visits.map((visit) => {
      const patient = lastPatientsById.get(visit.patient_id);
      const visitWorkflows = workflows.filter((workflow) => workflow.visit_id === visit.id);
      const visitExams = exams.filter((exam) => exam.visit_id === visit.id);
      const allReleased = visitWorkflows.length > 0 && visitWorkflows.every((workflow) => workflow.status === 'liberado');
      const status = allReleased ? 'atendido'
        : visitWorkflows.some((workflow) => workflow.status === 'em_atendimento') ? 'em_atendimento'
          : visitWorkflows.some((workflow) => workflow.status === 'chamado') ? 'chamado' : 'aguardando';
      const sheetButton = !roomMode && patient ? `<button type="button" class="secondary patient-sheet-button" data-patient-id="${escapeHtml(patient.id)}">Visualizar Ficha</button>` : '';
      const editButton = profile.role === 'recepcao' && patient ? `<button type="button" class="secondary edit-patient-button" data-patient-id="${escapeHtml(patient.id)}" data-visit-id="${escapeHtml(visit.id)}">Editar / adicionar exames</button>` : '';
      const workflowActions = visitWorkflows.map((workflow) => {
        const roomName = roomById.get(workflow.room_id)?.name || workflow.service_label;
        if (roomMode) {
          const next = workflow.status === 'chamado' ? 'em_atendimento' : 'liberado';
          const label = workflow.status === 'chamado' ? 'Iniciar atendimento' : 'Marcar realizado';
          return `<button type="button" class="secondary workflow-status-button" data-workflow-id="${escapeHtml(workflow.id)}" data-next-status="${next}">${escapeHtml(roomName)} · ${label}</button>`;
        }
        if (profile.role !== 'profissional') return '';
        if (workflow.status === 'aguardando') return `<button type="button" class="secondary workflow-status-button" data-workflow-id="${escapeHtml(workflow.id)}" data-next-status="chamado">🔊 Chamar ${escapeHtml(roomName)}</button>`;
        if (workflow.status === 'chamado') return `<button type="button" class="secondary workflow-status-button" data-workflow-id="${escapeHtml(workflow.id)}" data-next-status="em_atendimento">Iniciar ${escapeHtml(roomName)}</button><button type="button" class="secondary workflow-status-button" data-workflow-id="${escapeHtml(workflow.id)}" data-next-status="aguardando">Cancelar chamada</button>`;
        if (workflow.status === 'em_atendimento') return `<button type="button" class="secondary workflow-status-button" data-workflow-id="${escapeHtml(workflow.id)}" data-next-status="liberado">Concluir ${escapeHtml(roomName)}</button>`;
        return `<span class="status-pill active">${escapeHtml(roomName)} · liberado</span>`;
      }).join(' ');
      const receptionStations = ['Recepção 1', 'Recepção 2', 'Recepção 3'].map((label) => {
        const station = (roomResult.data || []).find((room) => room.name.toLowerCase() === label.toLowerCase());
        if (!station) return '';
        const isActive = visit.reception_call_room_id === station.id;
        return `<button type="button" class="secondary reception-call-button" data-visit-id="${escapeHtml(visit.id)}" data-room-id="${escapeHtml(station.id)}" data-active="${isActive}">${isActive ? 'Cancelar ' : 'Chamar na '}${label}</button>`;
      }).join(' ');
      const action = roomMode ? workflowActions
        : profile.role === 'profissional' ? `${sheetButton} ${workflowActions}`
          : profile.role === 'recepcao'
            ? `${sheetButton} ${editButton} ${receptionStations}
              <button type="button" class="secondary priority-toggle-button" data-visit-id="${escapeHtml(visit.id)}" data-next-priority="${!visit.priority}">${visit.priority ? 'Retirar prioridade' : 'Marcar prioridade'}</button>
              <button type="button" class="secondary aso-toggle-button ${visit.aso_completed ? 'aso-completed' : visit.aso_pending ? 'aso-pending' : ''}" data-visit-id="${escapeHtml(visit.id)}" data-next-aso="${visit.aso_completed ? 'reset' : visit.aso_pending ? 'complete' : 'pending'}">${visit.aso_completed ? 'ASO REALIZADO ✓' : visit.aso_pending ? 'ASO PENDENTE · Marcar realizado' : 'Marcar ASO pendente'}</button>`
            : '';
      const roomLabels = [...new Set(visitWorkflows.map((workflow) => roomById.get(workflow.room_id)?.name || workflow.service_label))];
      const examLabels = roomLabels.length ? roomLabels.map((name) => `<span class="exam-pill">${escapeHtml(name)}</span>`).join(' ')
        : visitExams.length ? visitExams.map((exam) => `<span class="exam-pill">${escapeHtml(exam.exam_name)}</span>`).join(' ')
          : '<span class="muted">Sem salas vinculadas</span>';
      const patientLabel = roomMode ? 'Atendimento em andamento' : escapeHtml(patient?.full_name || 'Paciente não visível');
      const flags = profile.role === 'recepcao' ? `${visit.priority ? '<span class="priority-flag">PRIORIDADE</span>' : ''}${visit.aso_completed ? '<span class="aso-flag aso-completed">ASO REALIZADO</span>' : visit.aso_pending ? '<span class="aso-flag aso-pending">ASO PENDENTE</span>' : ''}` : '';
      const company = patient?.company_name ? `<br><small>${escapeHtml(patient.company_name)}</small>` : '';
      const extraPatient = patient?.insurance || patient?.job_title ? `<br><small>${escapeHtml([patient.insurance, patient.job_title].filter(Boolean).join(' · '))}</small>` : '';
      return `<tr><td><strong>${patientLabel}</strong> ${flags}${company}${extraPatient}<br><small>${escapeHtml(visit.attendance_type)} · ${escapeHtml(visit.visit_date)}</small></td><td>${examLabels}</td><td><span class="status-pill ${status === 'atendido' ? 'active' : ''}">${escapeHtml(operationalStatuses[status] || status)}</span></td><td>${action || '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
  }

  if (canRegister) {
    document.querySelector('#patient-checkin-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = document.querySelector('#checkin-submit');
      const formData = new FormData(form);
      const values = Object.fromEntries(formData.entries());
      const selectedRoomIds = formData.getAll('room_ids').filter(Boolean);
      const cpf = String(values.cpf || '').replace(/\D/g, '');
      const documentFile = form.querySelector('#patient-pdf')?.files?.[0] || null;
      if (documentFile && (documentFile.size > 10 * 1024 * 1024 || (documentFile.type && documentFile.type !== 'application/pdf') || !documentFile.name.toLowerCase().endsWith('.pdf'))) {
        operationalMessage('#checkin-message', 'O documento deve ser um PDF de até 10 MB.', true); return;
      }
      if (cpf && !/^\d{11}$/.test(cpf)) {
        operationalMessage('#checkin-message', 'O CPF deve conter exatamente 11 números.', true);
        return;
      }
      const selectedExamInputs = [...form.querySelectorAll('input[name="exam_names"]:checked')];
      const examNames = [...new Map(selectedExamInputs.map((input) => [input.value.trim(), { name: input.value.trim(), roomName: input.dataset.roomName || '' }]).concat(String(values.other_exam_names || '').split(/[\n,;]/).map((name) => name.trim()).filter(Boolean).map((name) => [name, { name, roomName: '' }]))).values()];
      button.disabled = true;
      button.textContent = 'Salvando cadastro…';
      operationalMessage('#checkin-message', '');
      try {
        const roomById = new Map((roomResult.data || []).map((room) => [room.id, room]));
        const serviceByRoomName = new Map([
          ['Sala 1', 'RX'],
          ['Sala 2', 'Coleta / laboratório'],
          ['Sala 3', 'Audiometria'],
          ['Sala 4', 'Exames complementares'],
        ]);
        const workflowRows = selectedRoomIds.map((roomId, index) => {
          const room = roomById.get(roomId);
          if (!room) throw new Error('Uma das salas selecionadas não está disponível. Atualize a página.');
          const service = serviceByRoomName.get(room.name) || room.name;
          return {
            service_key: service,
            room_id: roomId,
            service_label: service,
            status: 'aguardando',
            call_label: room.name,
            display_order: index,
          };
        });
        const roomIdByName = new Map((roomResult.data || []).map((room) => [room.name, room.id]));
        const examRows = examNames.map((exam, index) => ({
          exam_name: exam.name,
          room_id: roomIdByName.get(exam.roomName) || selectedRoomIds[0] || null,
          display_order: index,
        }));
        const { data: visitId, error: checkinError } = await supabase.rpc('create_local_compatible_visit', {
          p_patient: {
            full_name: String(values.full_name || '').trim(),
            cpf: cpf || null,
            birth_date: values.birth_date || null,
            company_name: String(values.company_name || '').trim() || null,
            insurance: String(values.insurance || '').trim() || null,
            job_title: String(values.job_title || '').trim() || null,
          },
          p_visit: {
            attendance_type: values.attendance_type || 'Pontual',
            exam_types: values.attendance_type ? [values.attendance_type] : [],
            initial_room_ids: selectedRoomIds,
            room_id: selectedRoomIds[0] || null,
            company_name: String(values.company_name || '').trim() || null,
            priority: values.priority === 'true',
            aso_pending: values.aso_pending === 'true',
            aso_completed: false,
          },
          p_workflows: workflowRows,
          p_exams: examRows,
        });
        if (checkinError) throw checkinError;
        const { data: visitRecord, error: visitLookupError } = await supabase
          .from('patient_visits').select('patient_id').eq('id', visitId).single();
        if (visitLookupError) throw visitLookupError;
        const patientId = visitRecord.patient_id;
        if (documentFile) {
          const documentPath = `${patientId}/${crypto.randomUUID()}.pdf`;
          const { error: uploadError } = await supabase.storage.from('patient-documents').upload(documentPath, documentFile, { contentType: 'application/pdf', upsert: false });
          if (uploadError) throw new Error(`Atendimento criado, mas o PDF não foi anexado: ${uploadError.message}`);
          const { error: documentUpdateError } = await supabase.from('patients').update({ document_path: documentPath }).eq('id', patientId);
          if (documentUpdateError) throw new Error(`PDF enviado, mas não foi possível vincular o documento à ficha: ${documentUpdateError.message}`);
        }
        form.reset();
        operationalMessage('#checkin-message', 'Paciente cadastrado e atendimento enviado à fila.');
        await loadOperationalRows();
      } catch (error) {
        operationalMessage('#checkin-message', error.message || 'Não foi possível cadastrar o atendimento.', true);
      } finally {
        button.disabled = false;
        button.textContent = 'Cadastrar e colocar na fila';
      }
    });
  }

  document.querySelector('#refresh-operational').addEventListener('click', loadOperationalRows);
  document.querySelector('#operational-search').addEventListener('input', () => loadOperationalRows());
  professionalRoomFilter?.addEventListener('change', () => loadOperationalRows());
  document.querySelector('#export-operational-csv').addEventListener('click', () => {
    const tableRows = [...document.querySelectorAll('#operational-rows tr')].map((tr) => [...tr.cells].slice(0, 3).map((cell) => cell.innerText.replace(/\s+/g, ' ').trim()));
    const csv = tableRows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `favmed-atendimentos-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  });
  document.querySelector('#backup-operational-json')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true; button.textContent = 'Gerando backup…';
    try {
      const { data: visits, error: visitsError } = await supabase.from('patient_visits')
        .select('id, patient_id, visit_date, attendance_type, status, company_name, professional_id, room_id, checked_in_at, started_at, completed_at, priority, aso_pending, aso_completed, created_at')
        .eq('visit_date', todayLocal()).order('checked_in_at', { ascending: true });
      if (visitsError) throw visitsError;
      const patientIds = [...new Set((visits || []).map((visit) => visit.patient_id))];
      const visitIds = (visits || []).map((visit) => visit.id);
      const [patientsResult, examsResult] = await Promise.all([
        patientIds.length ? supabase.from('patients').select('id, full_name, cpf, birth_date, company_name, insurance, job_title, document_path, created_at').in('id', patientIds) : Promise.resolve({ data: [], error: null }),
        visitIds.length ? supabase.from('visit_exams').select('id, visit_id, exam_name, room_id, status, result_summary, completed_by, completed_at, display_order').in('visit_id', visitIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (patientsResult.error || examsResult.error) throw patientsResult.error || examsResult.error;
      const payload = { exported_at: new Date().toISOString(), date: todayLocal(), visits: visits || [], patients: patientsResult.data || [], exams: examsResult.data || [] };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' }));
      const link = document.createElement('a'); link.href = url; link.download = `favmed-backup-${todayLocal()}.json`; link.click(); URL.revokeObjectURL(url);
      operationalMessage('#operational-message', 'Backup JSON gerado. Guarde o arquivo em local seguro.');
    } catch (error) { operationalMessage('#operational-message', error.message || 'Não foi possível gerar o backup.', true); }
    finally { button.disabled = false; button.textContent = 'Backup JSON'; }
  });
  document.querySelector('#operational-rows').addEventListener('click', async (event) => {
    const examButton = event.target.closest('.exam-status-button');
    const visitButton = event.target.closest('.visit-status-button');
    const receptionCallButton = event.target.closest('.reception-call-button');
    const priorityButton = event.target.closest('.priority-toggle-button');
    const asoButton = event.target.closest('.aso-toggle-button');
    const sheetButton = event.target.closest('.patient-sheet-button');
    const editPatientButton = event.target.closest('.edit-patient-button');
    const repeatCallButton = event.target.closest('.repeat-call-button');
    const cancelCallButton = event.target.closest('.cancel-call-button');
    const repeatExamCallButton = event.target.closest('.repeat-exam-call-button');
    const cancelExamCallButton = event.target.closest('.cancel-exam-call-button');
    if (sheetButton) {
      const patient = lastPatientsById.get(sheetButton.dataset.patientId);
      if (!patient) return;
      const dialog = document.createElement('dialog');
      dialog.className = 'patient-sheet-dialog';
      dialog.innerHTML = `<form method="dialog"><button class="secondary dialog-close" aria-label="Fechar">Fechar</button></form><h2>Ficha do paciente</h2><dl><dt>Nome</dt><dd>${escapeHtml(patient.full_name || '')}</dd><dt>CPF</dt><dd>${escapeHtml(patient.cpf || '—')}</dd><dt>Data de nascimento</dt><dd>${escapeHtml(patient.birth_date || '—')}</dd><dt>Empresa</dt><dd>${escapeHtml(patient.company_name || '—')}</dd><dt>Convênio</dt><dd>${escapeHtml(patient.insurance || '—')}</dd><dt>Função / cargo</dt><dd>${escapeHtml(patient.job_title || '—')}</dd></dl>${patient.document_path ? '<button type="button" class="secondary" id="generate-patient-pdf-link">Gerar link seguro do PDF</button><a id="patient-pdf-link" class="secondary" hidden target="_blank" rel="noopener noreferrer">Abrir PDF (expira em 5 minutos)</a><p id="patient-pdf-message" class="message" role="status"></p>' : '<p class="muted">Nenhum PDF anexado.</p>'}`;
      document.body.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      if (patient.document_path) {
        dialog.querySelector('#generate-patient-pdf-link')?.addEventListener('click', async (clickEvent) => {
          const button = clickEvent.currentTarget;
          const message = dialog.querySelector('#patient-pdf-message');
          button.disabled = true;
          try {
            const { data, error } = await supabase.storage.from('patient-documents').createSignedUrl(patient.document_path, 300);
            if (error) throw error;
            const link = dialog.querySelector('#patient-pdf-link');
            link.href = data.signedUrl; link.hidden = false;
            message.textContent = 'Link seguro criado. Ele expira em 5 minutos.';
          } catch (error) { message.textContent = error.message || 'Não foi possível gerar o link do documento.'; message.className = 'message error'; }
          finally { button.disabled = false; }
        });
      }
      return;
    }
    if (editPatientButton) {
      const patient = lastPatientsById.get(editPatientButton.dataset.patientId);
      if (!patient) return;
      const visitId = editPatientButton.dataset.visitId;
      const { data: existingExams } = await supabase.from('visit_exams').select('exam_name').eq('visit_id', visitId);
      const existingNames = new Set((existingExams || []).map((exam) => exam.exam_name));
      const examMarkup = Object.entries(examCatalog).map(([roomName, exams]) => `<details class="exam-room-menu"><summary>${escapeHtml(roomName)} — exames disponíveis</summary><div class="service-options">${exams.map((exam) => `<label class="service-option"><input type="checkbox" name="edit_exam_names" data-room-name="${roomName}" value="${escapeHtml(exam)}" ${existingNames.has(exam) ? 'disabled' : ''}> ${escapeHtml(exam)} ${existingNames.has(exam) ? '<small>(já cadastrado)</small>' : ''}</label>`).join('')}</div></details>`).join('');
      const dialog = document.createElement('dialog');
      dialog.className = 'patient-sheet-dialog patient-edit-dialog';
      dialog.innerHTML = `<form id="edit-patient-form"><div class="users-heading"><h2>Editar paciente / adicionar exames</h2><button type="button" class="secondary edit-dialog-close">Fechar</button></div><label>Nome completo *</label><input name="full_name" required maxlength="160" value="${escapeHtml(patient.full_name || '')}"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="11" value="${escapeHtml(patient.cpf || '')}"><label>Data de nascimento</label><input name="birth_date" type="date" value="${escapeHtml(patient.birth_date || '')}"><label>Empresa</label><input name="company_name" maxlength="160" value="${escapeHtml(patient.company_name || '')}"><label>Convênio / particular</label><input name="insurance" maxlength="100" value="${escapeHtml(patient.insurance || '')}"><label>Função / cargo</label><input name="job_title" maxlength="100" value="${escapeHtml(patient.job_title || '')}"><label>Documento do paciente (PDF até 10 MB)</label><input name="patient_pdf" type="file" accept="application/pdf,.pdf"><h3>Adicionar exames (os existentes serão preservados)</h3>${examMarkup}<label>Outros exames</label><textarea name="other_exam_names" rows="3" placeholder="Um exame por linha"></textarea><button class="submit" type="submit">Salvar alterações</button><p class="message" id="edit-patient-message" role="status"></p></form>`;
      document.body.append(dialog);
      const closeEdit = () => { if (dialog.open && typeof dialog.close === 'function') dialog.close(); else dialog.remove(); };
      dialog.querySelector('.edit-dialog-close').addEventListener('click', closeEdit);
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      dialog.querySelector('#edit-patient-form').addEventListener('submit', async (submitEvent) => {
        submitEvent.preventDefault();
        const form = submitEvent.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());
        const status = dialog.querySelector('#edit-patient-message');
        const save = form.querySelector('button[type="submit"]');
        const cpf = String(values.cpf || '').replace(/\D/g, '');
        const documentFile = form.querySelector('input[name="patient_pdf"]')?.files?.[0] || null;
        if (documentFile && (documentFile.size > 10 * 1024 * 1024 || (documentFile.type && documentFile.type !== 'application/pdf') || !documentFile.name.toLowerCase().endsWith('.pdf'))) { status.textContent = 'O documento deve ser um PDF de até 10 MB.'; status.className = 'message error'; return; }
        if (cpf && !/^\d{11}$/.test(cpf)) { status.textContent = 'O CPF deve conter 11 números.'; status.className = 'message error'; return; }
        save.disabled = true;
        try {
          const { error: patientUpdateError } = await supabase.from('patients').update({
            full_name: String(values.full_name || '').trim(), cpf: cpf || null,
            birth_date: values.birth_date || null, company_name: String(values.company_name || '').trim() || null,
            insurance: String(values.insurance || '').trim() || null, job_title: String(values.job_title || '').trim() || null,
          }).eq('id', patient.id);
          if (patientUpdateError) throw patientUpdateError;
          if (documentFile) {
            const documentPath = `${patient.id}/${crypto.randomUUID()}.pdf`;
            const { error: uploadError } = await supabase.storage.from('patient-documents').upload(documentPath, documentFile, { contentType: 'application/pdf', upsert: false });
            if (uploadError) throw uploadError;
            const { error: documentUpdateError } = await supabase.from('patients').update({ document_path: documentPath }).eq('id', patient.id);
            if (documentUpdateError) throw documentUpdateError;
          }
          const { error: visitUpdateError } = await supabase.from('patient_visits').update({ company_name: String(values.company_name || '').trim() || null }).eq('id', visitId);
          if (visitUpdateError) throw visitUpdateError;
          const selected = [...form.querySelectorAll('input[name="edit_exam_names"]:checked')].map((input) => ({ name: input.value.trim(), roomName: input.dataset.roomName || '' }));
          const other = String(values.other_exam_names || '').split(/[\\n,;]/).map((name) => name.trim()).filter(Boolean).map((name) => ({ name, roomName: '' }));
          const additions = [...new Map(selected.concat(other).filter((exam) => exam.name && !existingNames.has(exam.name)).map((exam) => [exam.name, exam])).values()];
          if (additions.length) {
            const roomIdByName = new Map((roomResult.data || []).map((room) => [room.name, room.id]));
            const { error: examsError } = await supabase.from('visit_exams').insert(additions.map((exam, index) => ({ visit_id: visitId, exam_name: exam.name, room_id: roomIdByName.get(exam.roomName) || null, display_order: (existingExams || []).length + index })));
            if (examsError) throw examsError;
          }
          closeEdit();
          await loadOperationalRows();
        } catch (error) { status.textContent = error.message || 'Não foi possível salvar as alterações.'; status.className = 'message error'; save.disabled = false; }
      });
      return;
    }
    try {
      if (receptionCallButton) {
        receptionCallButton.disabled = true;
        const visitId = receptionCallButton.dataset.visitId;
        const roomId = receptionCallButton.dataset.roomId;
        const { data: pendingExam, error: pendingError } = await supabase.from('visit_exams').select('id').eq('visit_id', visitId).eq('status', 'pendente').order('display_order').limit(1).maybeSingle();
        if (pendingError) throw pendingError;
        if (pendingExam) {
          const { error } = await supabase.from('visit_exams').update({ status: 'chamado', room_id: roomId }).eq('id', pendingExam.id);
          if (error) throw error;
        }
        const { error: visitError } = await supabase.from('patient_visits').update({ status: 'chamado', room_id: roomId }).eq('id', visitId);
        if (visitError) throw visitError;
        operationalMessage('#operational-message', 'Paciente chamado pela recepção.');
        await loadOperationalRows();
      } else if (examButton) {
        examButton.disabled = true;
        const nextStatus = examButton.dataset.nextStatus;
        const payload = { status: nextStatus, updated_at: new Date().toISOString() };
        const { error } = await supabase.from('visit_exams').update(payload).eq('id', examButton.dataset.examId);
        if (error) throw error;
        if (profile.role === 'profissional') {
          const { data: examRecord, error: examRecordError } = await supabase.from('visit_exams').select('visit_id').eq('id', examButton.dataset.examId).single();
          if (examRecordError) throw examRecordError;
          let visitStatus = nextStatus === 'chamado' ? 'chamado' : nextStatus === 'em_atendimento' ? 'em_atendimento' : '';
          if (nextStatus === 'realizado') {
            const { data: siblingExams, error: siblingError } = await supabase.from('visit_exams').select('status').eq('visit_id', examRecord.visit_id);
            if (siblingError) throw siblingError;
            visitStatus = siblingExams?.length && siblingExams.every((item) => item.status === 'realizado') ? 'atendido'
              : siblingExams?.some((item) => item.status === 'em_atendimento') ? 'em_atendimento'
              : siblingExams?.some((item) => item.status === 'chamado') ? 'chamado' : 'aguardando';
          }
          if (visitStatus) {
            const { error: visitUpdateError } = await supabase.from('patient_visits').update({ status: visitStatus }).eq('id', examRecord.visit_id);
            if (visitUpdateError) throw visitUpdateError;
          }
        }
        operationalMessage('#operational-message', nextStatus === 'chamado' ? 'Exame chamado. O painel público será atualizado.' : 'Status do exame atualizado.');
        await loadOperationalRows();
      } else if (visitButton) {
        visitButton.disabled = true;
        const nextStatus = visitButton.dataset.nextStatus;
        const payload = { status: nextStatus, updated_at: new Date().toISOString() };
        const { error } = await supabase.from('patient_visits').update(payload).eq('id', visitButton.dataset.visitId);
        if (error) throw error;
        operationalMessage('#operational-message', nextStatus === 'chamado' ? 'Paciente chamado. O painel público será atualizado.' : 'Status do atendimento atualizado.');
        await loadOperationalRows();
      } else if (repeatCallButton) {
        repeatCallButton.disabled = true;
        const { error } = await supabase.from('patient_visits').update({ updated_at: new Date().toISOString() }).eq('id', repeatCallButton.dataset.visitId).eq('status', 'chamado');
        if (error) throw error;
        operationalMessage('#operational-message', 'Chamada repetida no painel público.');
        await loadOperationalRows();
      } else if (cancelCallButton) {
        cancelCallButton.disabled = true;
        const { error } = await supabase.from('patient_visits').update({ status: 'aguardando' }).eq('id', cancelCallButton.dataset.visitId).eq('status', 'chamado');
        if (error) throw error;
        operationalMessage('#operational-message', 'Chamada cancelada.');
        await loadOperationalRows();
      } else if (repeatExamCallButton) {
        repeatExamCallButton.disabled = true;
        const { error } = await supabase.from('visit_exams').update({ updated_at: new Date().toISOString() }).eq('id', repeatExamCallButton.dataset.examId).eq('status', 'chamado');
        if (error) throw error;
        operationalMessage('#operational-message', 'Chamada do exame repetida.');
        await loadOperationalRows();
      } else if (cancelExamCallButton) {
        cancelExamCallButton.disabled = true;
        const { data: examRecord, error: examRecordError } = await supabase.from('visit_exams').select('visit_id').eq('id', cancelExamCallButton.dataset.examId).single();
        if (examRecordError) throw examRecordError;
        const { error } = await supabase.from('visit_exams').update({ status: 'pendente' }).eq('id', cancelExamCallButton.dataset.examId).eq('status', 'chamado');
        if (error) throw error;
        const { data: siblingExams, error: siblingError } = await supabase.from('visit_exams').select('status').eq('visit_id', examRecord.visit_id);
        if (siblingError) throw siblingError;
        const visitStatus = siblingExams?.some((item) => item.status === 'em_atendimento') ? 'em_atendimento'
          : siblingExams?.some((item) => item.status === 'chamado') ? 'chamado'
          : siblingExams?.length && siblingExams.every((item) => item.status === 'realizado') ? 'atendido' : 'aguardando';
        const { error: visitUpdateError } = await supabase.from('patient_visits').update({ status: visitStatus }).eq('id', examRecord.visit_id);
        if (visitUpdateError) throw visitUpdateError;
        operationalMessage('#operational-message', 'Chamada do exame cancelada.');
        await loadOperationalRows();
      } else if (priorityButton) {
        priorityButton.disabled = true;
        const { error } = await supabase.from('patient_visits').update({ priority: priorityButton.dataset.nextPriority === 'true' }).eq('id', priorityButton.dataset.visitId);
        if (error) throw error;
        await loadOperationalRows();
      } else if (asoButton) {
        asoButton.disabled = true;
        const next = asoButton.dataset.nextAso;
        const flags = next === 'complete' ? { aso_pending: false, aso_completed: true } : next === 'pending' ? { aso_pending: true, aso_completed: false } : { aso_pending: false, aso_completed: false };
        const { error } = await supabase.from('patient_visits').update(flags).eq('id', asoButton.dataset.visitId);
        if (error) throw error;
        operationalMessage('#operational-message', next === 'complete' ? 'ASO marcado como realizado.' : next === 'pending' ? 'ASO marcado como pendente.' : 'Status do ASO removido.');
        await loadOperationalRows();
      }
    } catch (error) {
      operationalMessage('#operational-message', error.message || 'Não foi possível atualizar o status.', true);
      if (examButton) examButton.disabled = false;
      if (receptionCallButton) receptionCallButton.disabled = false;
      if (visitButton) visitButton.disabled = false;
      if (priorityButton) priorityButton.disabled = false;
      if (asoButton) asoButton.disabled = false;
      if (repeatCallButton) repeatCallButton.disabled = false;
      if (cancelCallButton) cancelCallButton.disabled = false;
      if (repeatExamCallButton) repeatExamCallButton.disabled = false;
      if (cancelExamCallButton) cancelExamCallButton.disabled = false;
    }
  });
  await loadOperationalRows();
}

function renderHome(profile, userId) {
  const label = roleLabels[profile.role];
  const isMaster = profile.role === 'master';
  const requiredPath = ({ master: '/master', recepcao: '/recepcao', profissional: '/profissional', sala: '/sala' })[profile.role];
  if (window.location.pathname !== requiredPath) window.history.replaceState({}, document.title, requiredPath);
  root.innerHTML = `
    <main class="shell dashboard-shell">
      <section class="login-card home-card">
        <header class="app-header">
          <div class="brand">
            <img class="brand-logo" src="${logoFavmed}" alt="Logo Clínica Favmed" />
            <div class="brand-copy">
              <h1>Clínica Favmed - Medicina Ocupacional</h1>
              <p>Olá, ${escapeHtml(profile.display_name || label)} · Sessão autenticada · Perfil: ${escapeHtml(label)}</p>
            </div>
          </div>
        </header>
        ${isMaster ? `
          <section class="admin-panel" aria-labelledby="admin-title">
            <h2 id="admin-title">Administração de usuários</h2>
            <p class="muted">Convide usuários por e-mail e controle contas da equipe. O perfil Master não pode ser criado nesta tela.</p>
            <form id="create-user-form" class="admin-form">
              <label for="new-name">Nome de exibição</label>
              <input id="new-name" name="display_name" required maxlength="120" autocomplete="name" />
              <label for="new-email">E-mail</label>
              <input id="new-email" name="email" type="email" required maxlength="254" autocomplete="email" />
              <label for="new-role">Perfil</label>
              <select id="new-role" name="role" required>
                <option value="recepcao">Recepção</option>
                <option value="profissional">Profissional</option>
              </select>
              <button class="submit" id="create-user-submit" type="submit">Criar usuário</button>
              <p id="admin-message" class="message" role="status"></p>
            </form>
            <div class="users-heading"><h3>Contas cadastradas</h3><button class="secondary" id="refresh-users" type="button">Atualizar lista</button></div>
            <div class="table-wrap"><table class="users-table">
              <thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody id="users-body"><tr><td colspan="4">Carregando contas…</td></tr></tbody>
            </table></div>
          </section>` : ``}
        ${isMaster ? '' : '<section id="operational-panel" class="operational-panel" aria-label="Módulo operacional"></section>'}
        <button class="secondary" id="sign-out" type="button">Sair da conta</button>
      </section>
      <footer>FAVMED Online · Acesso restrito à Clínica Favmed</footer>
    </main>`;

  document.querySelector('#sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin('Você saiu da sua conta.');
  });

  if (!isMaster) { renderOperationalModules(profile, userId); return; }
  const adminMessage = document.querySelector('#admin-message');
  const usersBody = document.querySelector('#users-body');
  const refreshButton = document.querySelector('#refresh-users');

  async function loadUsers() {
    usersBody.innerHTML = '<tr><td colspan="4">Carregando contas…</td></tr>';
    try {
      const data = await callMasterAction({ action: 'list_users' });
      usersBody.innerHTML = renderUserRows(data.users || []);
    } catch (error) {
      usersBody.innerHTML = '<tr><td colspan="4">Não foi possível carregar a lista.</td></tr>';
      adminMessage.textContent = error.message;
      adminMessage.className = 'message error';
    }
  }

  document.querySelector('#create-user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.querySelector('#create-user-submit');
    const values = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    button.textContent = 'Criando conta…';
    adminMessage.textContent = '';
    adminMessage.className = 'message';
    try {
      await callMasterAction({ action: 'create_user', ...values });
      form.reset();
      adminMessage.textContent = 'Convite enviado. O usuário deverá concluir o acesso pelo e-mail.';
      await loadUsers();
    } catch (error) {
      adminMessage.textContent = error.message || 'Não foi possível criar a conta.';
      adminMessage.className = 'message error';
    } finally {
      button.disabled = false;
      button.textContent = 'Criar usuário';
    }
  });

  refreshButton.addEventListener('click', loadUsers);
  usersBody.addEventListener('click', async (event) => {
    const button = event.target.closest('.user-toggle');
    if (!button) return;
    button.disabled = true;
    adminMessage.textContent = '';
    try {
      await callMasterAction({
        action: 'set_active',
        user_id: button.dataset.userId,
        active: button.dataset.nextActive === 'true',
      });
      adminMessage.textContent = 'Status da conta atualizado.';
      await loadUsers();
    } catch (error) {
      adminMessage.textContent = error.message || 'Não foi possível alterar o acesso.';
      adminMessage.className = 'message error';
      button.disabled = false;
    }
  });
  loadUsers();
}

async function renderPublicWaitingRoom() {
  root.innerHTML = `
    <main class="waiting-screen">
      <header class="waiting-brand"><img class="brand-logo" src="${logoFavmed}" alt="Clínica Favmed"/><div><h1>Clínica Favmed</h1><p>PAINEL DE CHAMADAS</p></div><button class="secondary audio-enable" id="enable-call-audio" type="button">Ativar voz</button><span class="public-live"><i></i> AO VIVO</span></header>
      <section class="waiting-content"><p class="eyebrow">ATENÇÃO</p><h2>Paciente chamado</h2><div id="public-calls" class="public-calls"><p class="muted">Carregando chamadas…</p></div><p class="waiting-note">Aguarde a chamada da recepção ou do profissional.</p></section>
    </main>`;
  const calls = document.querySelector('#public-calls');
  const audioButton = document.querySelector('#enable-call-audio');
  let audioEnabled = false;
  let lastSpokenCall = '';
  audioButton.addEventListener('click', async () => {
    audioEnabled = true;
    audioButton.textContent = 'Voz ativada';
    audioButton.disabled = true;
    await refreshCalls();
  });
  async function refreshCalls() {
    const { data, error } = await supabase.from('public_waiting_room_calls').select('display_name, room_name, called_at').order('called_at', { ascending: false }).limit(5);
    if (error) { calls.innerHTML = '<p class="muted">Painel temporariamente indisponível. Solicite ajuda à recepção.</p>'; return; }
    calls.innerHTML = data?.length ? data.map((call, index) => `<article class="call-card ${index === 0 ? 'current-call' : ''}"><div><span class="call-label">${index === 0 ? 'CHAMADA ATUAL' : 'CHAMADA RECENTE'}</span><h3>${escapeHtml(call.display_name)}</h3></div><div class="call-room"><span>DIRIJA-SE À</span><strong>${escapeHtml(call.room_name || 'Recepção')}</strong></div></article>`).join('') : '<div class="no-calls"><h3>Nenhuma chamada no momento</h3><p>Por favor, aguarde.</p></div>';
    const current = data?.[0];
    const callKey = current ? `${current.called_at}|${current.display_name}|${current.room_name}` : '';
    if (audioEnabled && current && callKey !== lastSpokenCall && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      lastSpokenCall = callKey;
      const utterance = new SpeechSynthesisUtterance(`Atenção. ${current.display_name}. Favor dirigir-se à ${current.room_name || 'recepção'}.`);
      utterance.lang = 'pt-BR';
      const voices = window.speechSynthesis.getVoices();
      const portugueseVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith('pt-br')) || voices.find((voice) => voice.lang?.toLowerCase().startsWith('pt'));
      if (portugueseVoice) utterance.voice = portugueseVoice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }
  await refreshCalls();
  window.setInterval(refreshCalls, 5000);
}

async function start() {
  if (!configured) return renderSetup();
  if (window.location.pathname.replace(/\/+$/, '') === '/sala') return renderPublicWaitingRoom();
  // Supabase may return the flow type in the URL hash (implicit flow)
  // or the query string (depending on the email template / redirect setup).
  // Capture it before deciding whether an authenticated session may reach the panel.
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  const authType = hashParams.get('type') || queryParams.get('type');
  const isInvite = authType === 'invite';
  const isRecovery = authType === 'recovery';
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return renderLogin('Não foi possível validar o link. Solicite um novo link e tente novamente.', true);
  if (passwordRecoveryInProgress || isInvite || isRecovery) {
    if (session?.user) return renderPasswordUpdate(passwordRecoveryInProgress || isRecovery);
    const message = isRecovery
      ? 'O link de recuperação expirou ou já foi utilizado. Solicite outro link para redefinir a senha.'
      : 'O convite expirou ou já foi utilizado. Solicite um novo convite ao administrador.';
    return renderLogin(message, true);
  }
  if (!session?.user) return renderLogin();
  const { data: profile, error } = await supabase.from('profiles')
    .select('role, active, display_name').eq('id', session.user.id).maybeSingle();
  if (error || !profile || profile.active !== true || !roleLabels[profile.role]) {
    await supabase.auth.signOut();
    return renderLogin('A conta não possui perfil autorizado ou está inativa.', true);
  }
  if (profile.role === 'sala') return renderPublicWaitingRoom();
  const homePath = ({ master: '/master', recepcao: '/recepcao', profissional: '/profissional' })[profile.role];
  if (homePath && window.location.pathname === '/') window.history.replaceState({}, document.title, homePath);
  renderHome(profile, session.user.id);
}

if (configured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      passwordRecoveryInProgress = true;
      renderPasswordUpdate(true);
      return;
    }
    if (event === 'SIGNED_OUT') {
      passwordRecoveryInProgress = false;
      renderLogin();
    }
  });
}
start();

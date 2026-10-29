import { createClient } from '@supabase/supabase-js';
import './style.css';

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
      <div class="brand-mark" aria-hidden="true">F</div>
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
      <div class="brand-mark" aria-hidden="true">F</div>
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
  root.innerHTML = `<main class="shell"><section class="login-card"><div class="brand-mark" aria-hidden="true">F</div><p class="eyebrow">CLÍNICA FAVMED</p><h1>${heading}</h1><p class="muted">${description}</p><form id="update-password-form"><label for="new-password">Nova senha</label><input id="new-password" name="password" type="password" minlength="8" autocomplete="new-password" required><label for="confirm-new-password">Confirmar nova senha</label><input id="confirm-new-password" name="confirm_password" type="password" minlength="8" autocomplete="new-password" required><button class="submit" id="update-password-submit" type="submit">${submitLabel}</button><p id="update-password-message" class="message" role="status"></p></form></section><footer>FAVMED Online · Acesso restrito à Clínica Favmed</footer></main>`;
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
  em_atendimento: 'Em atendimento',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
};
const defaultExams = ['ASO', 'Audiometria', 'Acuidade visual', 'Espirometria', 'Eletrocardiograma', 'Teste Ergonométrico', 'Acetona na Urina', 'Acuidade com percepção de cores'];

function operationalMessage(target, message, isError = false) {
  const node = document.querySelector(target);
  if (!node) return;
  node.textContent = message;
  node.className = isError ? 'message error' : 'message';
}

async function renderOperationalModules(profile, userId) {
  const panel = document.querySelector('#operational-panel');
  if (!panel) return;
  const canRegister = ['master', 'recepcao'].includes(profile.role);
  panel.innerHTML = `
    <div class="operational-heading">
      <div><p class="eyebrow">OPERAÇÃO CLÍNICA</p><h2>Módulos operacionais</h2></div>
      <button class="secondary" id="refresh-operational" type="button">Atualizar dados</button>
    </div>
    ${canRegister ? `
      <section class="module-card">
        <h3>Recepção · Cadastrar paciente e atendimento</h3>
        <p class="muted">Cadastre o paciente, registre a entrada na fila e associe os exames solicitados.</p>
        <form id="patient-checkin-form" class="operational-form">
          <div class="form-grid">
            <div><label for="patient-name">Nome completo *</label><input id="patient-name" name="full_name" required maxlength="160" autocomplete="name"></div>
            <div><label for="patient-cpf">CPF (somente números)</label><input id="patient-cpf" name="cpf" inputmode="numeric" pattern="[0-9]{11}" maxlength="11" placeholder="11 dígitos"></div>
            <div><label for="patient-birth">Data de nascimento</label><input id="patient-birth" name="birth_date" type="date"></div>
            <div><label for="patient-company">Empresa</label><input id="patient-company" name="company_name" maxlength="160"></div>
            <div><label for="visit-type">Tipo de atendimento</label><select id="visit-type" name="attendance_type"><option>Pontual</option><option>Consulta Ocupacional</option><option>Agendado</option></select></div>
            <div><label for="visit-professional">Profissional</label><select id="visit-professional" name="professional_id"><option value="">A definir</option></select></div>
            <div><label for="visit-room">Sala inicial</label><select id="visit-room" name="room_id"><option value="">A definir</option></select></div>
          </div>
          <label for="visit-exams">Exames solicitados (um por linha)</label>
          <textarea id="visit-exams" name="exam_names" rows="4" placeholder="${defaultExams.join(', ')}"></textarea>
          <button class="submit" id="checkin-submit" type="submit">Cadastrar e colocar na fila</button>
          <p id="checkin-message" class="message" role="status"></p>
        </form>
      </section>` : ''}

    ${profile.role === 'master' ? `
      <section class="module-card">
        <h3>Master · Configurar salas</h3>
        <p class="muted">Crie as salas e associe cada conta do perfil Sala de espera à sua sala.</p>
        <form id="room-setup-form" class="operational-form">
          <div class="form-grid">
            <div><label for="room-name">Nome da sala *</label><input id="room-name" name="name" required maxlength="80" placeholder="Ex.: Audiometria"></div>
            <div><label for="room-type">Tipo</label><select id="room-type" name="room_type"><option value="exame">Exame</option><option value="consulta">Consulta</option><option value="recepcao">Recepção</option><option value="espera">Espera</option><option value="outro">Outro</option></select></div>
            <div><label for="room-assigned-profile">Conta vinculada</label><select id="room-assigned-profile" name="assigned_profile_id"><option value="">Sem vínculo</option></select></div>
          </div>
          <button class="submit" id="room-create-submit" type="submit">Salvar sala</button>
          <p id="room-setup-message" class="message" role="status"></p>
        </form>
        <div class="table-wrap"><table class="users-table"><thead><tr><th>Sala</th><th>Tipo</th><th>Conta vinculada</th><th>Status</th></tr></thead><tbody id="room-list-rows"><tr><td colspan="4">Carregando salas…</td></tr></tbody></table></div>
      </section>` : ''}
    <section class="module-card">
      <div class="users-heading"><h3>${profile.role === 'sala' ? 'Exames desta sala' : profile.role === 'profissional' ? 'Minha fila de atendimentos' : 'Fila e atendimentos'}</h3><span class="muted" id="operational-count"></span></div>
      <div class="table-wrap"><table class="users-table operational-table">
        <thead><tr><th>Paciente / Atendimento</th><th>Exames</th><th>Status</th><th>Ação</th></tr></thead>
        <tbody id="operational-rows"><tr><td colspan="4">Carregando dados…</td></tr></tbody>
      </table></div>
      <p id="operational-message" class="message" role="status"></p>
    </section>`;

  const professionalSelect = document.querySelector('#visit-professional');
  const roomSelect = document.querySelector('#visit-room');
  const roomAssignedSelect = document.querySelector('#room-assigned-profile');
  let roomUsers = [];
  if (roomAssignedSelect) {
    const { data: fetchedRoomUsers, error: roomUsersError } = await supabase.from('profiles')
      .select('id, display_name').eq('role', 'sala').eq('active', true).order('display_name');
    if (!roomUsersError) {
      roomUsers = fetchedRoomUsers || [];
      roomAssignedSelect.innerHTML = '<option value="">Sem vínculo</option>' + roomUsers.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.display_name || 'Sala de espera')}</option>`).join('');
    }
  }
  if (profile.role === 'master') {
    const { data: savedRooms, error: savedRoomsError } = await supabase.from('rooms')
      .select('id, name, room_type, assigned_profile_id, active').order('display_order').order('name');
    const roomRows = document.querySelector('#room-list-rows');
    if (roomRows) roomRows.innerHTML = savedRoomsError
      ? '<tr><td colspan="4">Não foi possível carregar as salas.</td></tr>'
      : (savedRooms || []).map((room) => {
        const assigned = (roomUsers || []).find((u) => u.id === room.assigned_profile_id);
        return `<tr><td>${escapeHtml(room.name)}</td><td>${escapeHtml(room.room_type)}</td><td>${escapeHtml(assigned?.display_name || (room.assigned_profile_id ? 'Conta vinculada' : 'Sem vínculo'))}</td><td><span class="status-pill ${room.active ? 'active' : 'inactive'}">${room.active ? 'Ativa' : 'Inativa'}</span></td></tr>`;
      }).join('') || '<tr><td colspan="4">Nenhuma sala cadastrada.</td></tr>';
    const roomForm = document.querySelector('#room-setup-form');
    roomForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = document.querySelector('#room-create-submit');
      const values = Object.fromEntries(new FormData(form).entries());
      button.disabled = true;
      try {
        const { error } = await supabase.from('rooms').insert({
          name: String(values.name || '').trim(),
          room_type: values.room_type,
          assigned_profile_id: values.assigned_profile_id || null,
        });
        if (error) throw error;
        operationalMessage('#room-setup-message', 'Sala cadastrada.');
        await renderOperationalModules(profile, userId);
      } catch (error) {
        operationalMessage('#room-setup-message', error.message || 'Não foi possível cadastrar a sala.', true);
        button.disabled = false;
      }
    });
  }
  const [professionalResult, roomResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('role', 'profissional').eq('active', true).order('display_name'),
    supabase.from('rooms').select('id, name').eq('active', true).order('display_order').order('name'),
  ]);
  if (professionalSelect && !professionalResult.error) {
    professionalSelect.innerHTML = '<option value="">A definir</option>' + (professionalResult.data || []).map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.display_name || 'Profissional')}</option>`).join('');
  }
  if (roomSelect && !roomResult.error) {
    roomSelect.innerHTML = '<option value="">A definir</option>' + (roomResult.data || []).map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('');
  }

  async function loadOperationalRows() {
    const rows = document.querySelector('#operational-rows');
    if (!rows) return;
    rows.innerHTML = '<tr><td colspan="4">Carregando dados…</td></tr>';
    let visitsQuery = supabase.from('patient_visits')
      .select('id, patient_id, visit_date, attendance_type, status, professional_id, room_id, checked_in_at')
      .order('checked_in_at', { ascending: false }).limit(100);
    let assignedRoomId = '';
    if (profile.role === 'profissional') visitsQuery = visitsQuery.eq('professional_id', userId);
    if (profile.role === 'sala') {
      const { data: assignedRoom, error: assignedRoomError } = await supabase.from('rooms')
        .select('id').eq('assigned_profile_id', userId).eq('active', true).maybeSingle();
      if (assignedRoomError || !assignedRoom) {
        rows.innerHTML = '<tr><td colspan="4">Nenhuma sala ativa está vinculada a esta conta. Solicite a configuração ao Master.</td></tr>';
        return;
      }
      assignedRoomId = assignedRoom.id;
      const { data: exams, error: examsError } = await supabase.from('visit_exams')
        .select('id, visit_id, exam_name, status, room_id, display_order')
        .eq('room_id', assignedRoomId).in('status', ['pendente', 'em_atendimento'])
        .order('display_order').limit(100);
      if (examsError) {
        rows.innerHTML = '<tr><td colspan="4">Não foi possível carregar os exames. Verifique a migração e as permissões.</td></tr>';
        return;
      }
      const visitIds = [...new Set((exams || []).map((exam) => exam.visit_id))];
      let visits = [];
      if (visitIds.length) {
        const { data, error } = await supabase.from('patient_visits')
          .select('id, patient_id, visit_date, attendance_type, status, checked_in_at')
          .in('id', visitIds).order('checked_in_at', { ascending: false });
        if (error) { rows.innerHTML = '<tr><td colspan="4">Não foi possível carregar a fila desta sala.</td></tr>'; return; }
        visits = data || [];
      }
      return renderRows(visits, exams || [], true);
    }
    const { data: visits, error } = await visitsQuery;
    if (error) {
      rows.innerHTML = '<tr><td colspan="4">Não foi possível carregar a fila. Verifique se a migração operacional foi aplicada e se as políticas RLS estão ativas.</td></tr>';
      return;
    }
    const visitIds = (visits || []).map((visit) => visit.id);
    const patientIds = [...new Set((visits || []).map((visit) => visit.patient_id))];
    const [patientsResult, examsResult] = await Promise.all([
      patientIds.length ? supabase.from('patients').select('id, full_name, company_name').in('id', patientIds) : Promise.resolve({ data: [], error: null }),
      visitIds.length ? supabase.from('visit_exams').select('id, visit_id, exam_name, status, room_id, display_order').in('visit_id', visitIds).order('display_order') : Promise.resolve({ data: [], error: null }),
    ]);
    if (patientsResult.error || examsResult.error) {
      rows.innerHTML = '<tr><td colspan="4">Os dados foram parcialmente bloqueados pelas políticas de segurança. Revise a RLS antes de continuar.</td></tr>';
      return;
    }
    renderRows(visits || [], examsResult.data || [], false, patientsResult.data || []);
  }

  function renderRows(visits, exams, roomMode, patients = []) {
    const rows = document.querySelector('#operational-rows');
    const count = document.querySelector('#operational-count');
    if (!rows) return;
    count.textContent = `${visits.length} atendimento(s)`;
    if (!visits.length) {
      rows.innerHTML = '<tr><td colspan="4">Nenhum atendimento encontrado.</td></tr>';
      return;
    }
    const patientMap = new Map(patients.map((patient) => [patient.id, patient]));
    rows.innerHTML = visits.map((visit) => {
      const patient = patientMap.get(visit.patient_id);
      const visitExams = exams.filter((exam) => exam.visit_id === visit.id);
      const status = roomMode ? (visitExams.some((exam) => exam.status === 'em_atendimento') ? 'em_atendimento' : (visitExams.every((exam) => exam.status === 'realizado') ? 'atendido' : 'aguardando')) : visit.status;
      const action = roomMode
        ? visitExams.map((exam) => `<button type="button" class="secondary exam-status-button" data-exam-id="${escapeHtml(exam.id)}" data-next-status="${exam.status === 'pendente' ? 'em_atendimento' : 'realizado'}">${escapeHtml(exam.exam_name)}: ${exam.status === 'pendente' ? 'Iniciar' : 'Marcar realizado'}</button>`).join(' ')
        : (profile.role === 'profissional'
          ? `<button type="button" class="secondary visit-status-button" data-visit-id="${escapeHtml(visit.id)}" data-next-status="${visit.status === 'aguardando' ? 'em_atendimento' : 'atendido'}">${visit.status === 'aguardando' ? 'Iniciar atendimento' : visit.status === 'em_atendimento' ? 'Concluir atendimento' : 'Atualizar status'}</button>`
          : '');
      const examLabels = visitExams.length ? visitExams.map((exam) => `<span class="exam-pill">${escapeHtml(exam.exam_name)} · ${escapeHtml(exam.status)}</span>`).join(' ') : '<span class="muted">Sem exames vinculados</span>';
      const patientLabel = roomMode ? `Atendimento #${escapeHtml(visit.id.slice(0, 8))}` : escapeHtml(patient?.full_name || 'Paciente não visível');
      const company = patient?.company_name ? `<br><small>${escapeHtml(patient.company_name)}</small>` : '';
      return `<tr><td><strong>${patientLabel}</strong>${company}<br><small>${escapeHtml(visit.attendance_type)} · ${escapeHtml(visit.visit_date)}</small></td><td>${examLabels}</td><td><span class="status-pill ${status === 'atendido' ? 'active' : status === 'cancelado' ? 'inactive' : ''}">${escapeHtml(operationalStatuses[status] || status)}</span></td><td>${action || '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
  }

  if (canRegister) {
    document.querySelector('#patient-checkin-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = document.querySelector('#checkin-submit');
      const values = Object.fromEntries(new FormData(form).entries());
      const cpf = String(values.cpf || '').replace(/\D/g, '');
      if (cpf && !/^\d{11}$/.test(cpf)) {
        operationalMessage('#checkin-message', 'O CPF deve conter exatamente 11 números.', true);
        return;
      }
      const examNames = String(values.exam_names || '').split(/[\n,;]/).map((name) => name.trim()).filter(Boolean);
      button.disabled = true;
      button.textContent = 'Salvando cadastro…';
      operationalMessage('#checkin-message', '');
      try {
        const { data: patient, error: patientError } = await supabase.from('patients').insert({
          full_name: String(values.full_name || '').trim(),
          cpf: cpf || null,
          birth_date: values.birth_date || null,
          company_name: String(values.company_name || '').trim() || null,
          created_by: userId,
        }).select('id').single();
        if (patientError) throw patientError;
        const { data: visit, error: visitError } = await supabase.from('patient_visits').insert({
          patient_id: patient.id,
          attendance_type: values.attendance_type,
          professional_id: values.professional_id || null,
          room_id: values.room_id || null,
          company_name: String(values.company_name || '').trim() || null,
          created_by: userId,
        }).select('id').single();
        if (visitError) throw new Error(`Paciente salvo, mas não foi possível abrir o atendimento: ${visitError.message}`);
        if (examNames.length) {
          const examRows = examNames.map((exam_name, index) => ({
            visit_id: visit.id, exam_name, room_id: values.room_id || null, display_order: index,
          }));
          const { error: examError } = await supabase.from('visit_exams').insert(examRows);
          if (examError) throw new Error(`Atendimento criado, mas não foi possível salvar os exames: ${examError.message}`);
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
  document.querySelector('#operational-rows').addEventListener('click', async (event) => {
    const examButton = event.target.closest('.exam-status-button');
    const visitButton = event.target.closest('.visit-status-button');
    try {
      if (examButton) {
        examButton.disabled = true;
        const nextStatus = examButton.dataset.nextStatus;
        const payload = { status: nextStatus, updated_at: new Date().toISOString() };
        if (nextStatus === 'realizado') {
          payload.completed_at = new Date().toISOString();
        }
        const { error } = await supabase.from('visit_exams').update(payload).eq('id', examButton.dataset.examId);
        if (error) throw error;
        operationalMessage('#operational-message', 'Status do exame atualizado.');
        await loadOperationalRows();
      } else if (visitButton) {
        visitButton.disabled = true;
        const nextStatus = visitButton.dataset.nextStatus;
        const payload = { status: nextStatus, updated_at: new Date().toISOString() };
        if (nextStatus === 'em_atendimento') payload.started_at = new Date().toISOString();
        if (nextStatus === 'atendido') payload.completed_at = new Date().toISOString();
        const { error } = await supabase.from('patient_visits').update(payload).eq('id', visitButton.dataset.visitId);
        if (error) throw error;
        operationalMessage('#operational-message', 'Status do atendimento atualizado.');
        await loadOperationalRows();
      }
    } catch (error) {
      operationalMessage('#operational-message', error.message || 'Não foi possível atualizar o status.', true);
      if (examButton) examButton.disabled = false;
      if (visitButton) visitButton.disabled = false;
    }
  });
  await loadOperationalRows();
}

function renderHome(profile, userId) {
  const label = roleLabels[profile.role];
  const isMaster = profile.role === 'master';
  root.innerHTML = `
    <main class="shell dashboard-shell">
      <section class="login-card home-card">
        <div class="brand-mark" aria-hidden="true">F</div>
        <p class="eyebrow">CLÍNICA FAVMED</p>
        <h1>Olá, ${escapeHtml(profile.display_name || label)}</h1>
        <p class="muted">Sessão autenticada · Perfil: ${escapeHtml(label)}</p>
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
                <option value="sala">Sala de espera</option>
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
        <section id="operational-panel" class="operational-panel" aria-label="Módulos operacionais"></section>
        <button class="secondary" id="sign-out" type="button">Sair da conta</button>
      </section>
      <footer>FAVMED Online · Acesso restrito à Clínica Favmed</footer>
    </main>`;

  document.querySelector('#sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin('Você saiu da sua conta.');
  });

  renderOperationalModules(profile, userId);
  if (!isMaster) return;
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

async function start() {
  if (!configured) return renderSetup();
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

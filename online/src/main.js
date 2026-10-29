import { createClient } from '@supabase/supabase-js';
import './style.css';

const root = document.querySelector('#app');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const configured = Boolean(supabaseUrl && supabaseKey);
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
          </section>` : `
          <div class="notice">O acesso foi validado. Os módulos operacionais serão habilitados após a implantação e validação das tabelas e políticas de segurança do banco.</div>`}
        <button class="secondary" id="sign-out" type="button">Sair da conta</button>
      </section>
      <footer>FAVMED Online · Acesso restrito à Clínica Favmed</footer>
    </main>`;

  document.querySelector('#sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin('Você saiu da sua conta.');
  });

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
  if (isInvite || isRecovery) {
    if (session?.user) return renderPasswordUpdate(isRecovery);
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
    if (event === 'SIGNED_OUT') renderLogin();
  });
}
start();

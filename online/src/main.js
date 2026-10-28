import { createClient } from '@supabase/supabase-js';
import './style.css';

const root = document.querySelector('#app');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const configured = Boolean(supabaseUrl && supabaseKey);

const supabase = configured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

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
    <main class="shell">
      <section class="login-card">
        <div class="brand-mark" aria-hidden="true">F</div>
        <p class="eyebrow">CLÍNICA FAVMED</p>
        <h1>FAVMED Online</h1>
        <p class="muted">Acesso centralizado e seguro à clínica.</p>
        <div class="notice" role="alert">
          O ambiente ainda não foi configurado. Defina <code>VITE_SUPABASE_URL</code> e
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> no ambiente de desenvolvimento.
          Nenhum banco externo foi conectado ou alterado por esta etapa.
        </div>
      </section>
    </main>`;
}

function renderLogin(message = '', isError = false) {
  root.innerHTML = `
    <main class="shell">
      <section class="login-card" aria-labelledby="page-title">
        <div class="brand-mark" aria-hidden="true">F</div>
        <p class="eyebrow">CLÍNICA FAVMED · MEDICINA OCUPACIONAL</p>
        <h1 id="page-title">Bem-vindo ao FAVMED</h1>
        <p class="muted">Entre com a conta fornecida pelo administrador da clínica.</p>
        <form id="login-form" novalidate>
          <label for="email">E-mail de acesso</label>
          <input id="email" name="email" type="email" autocomplete="username"
            placeholder="usuario@clinica.com.br" required maxlength="254" />
          <label for="password">Senha</label>
          <div class="password-wrap">
            <input id="password" name="password" type="password" autocomplete="current-password"
              placeholder="Digite sua senha" required />
            <button class="reveal" id="toggle-password" type="button" aria-label="Mostrar senha">Mostrar</button>
          </div>
          <button class="submit" id="submit-button" type="submit">Entrar com segurança</button>
          <p id="form-message" class="message ${isError ? 'error' : ''}" role="status">${escapeHtml(message)}</p>
        </form>
        <p class="footnote">A criação de contas é restrita ao administrador Master. Não há cadastro público.</p>
      </section>
      <footer>FAVMED Online · Acesso restrito à Clínica Favmed</footer>
    </main>`;

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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      status.textContent = 'Não foi possível entrar. Confira os dados ou solicite ajuda ao administrador.';
      status.className = 'message error';
      submit.disabled = false;
      submit.textContent = 'Entrar com segurança';
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, active, display_name')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.active !== true || !roleLabels[profile.role]) {
      await supabase.auth.signOut();
      status.textContent = 'A conta ainda não possui perfil autorizado ou está inativa. Contate o administrador Master.';
      status.className = 'message error';
      submit.disabled = false;
      submit.textContent = 'Entrar com segurança';
      return;
    }

    renderHome(profile);
  });
}

function renderHome(profile) {
  const label = roleLabels[profile.role];
  root.innerHTML = `
    <main class="shell">
      <section class="login-card home-card">
        <div class="brand-mark" aria-hidden="true">F</div>
        <p class="eyebrow">CLÍNICA FAVMED</p>
        <h1>Olá, ${escapeHtml(profile.display_name || label)}</h1>
        <p class="muted">Sessão autenticada · Perfil: ${escapeHtml(label)}</p>
        <div class="notice">
          A autenticação funcionou. Os módulos operacionais serão habilitados após a implantação
          e validação das tabelas e políticas de segurança do banco.
        </div>
        <button class="submit" id="sign-out" type="button">Sair da conta</button>
      </section>
    </main>`;

  document.querySelector('#sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut();
    renderLogin('Você saiu da sua conta.');
  });
}

async function start() {
  if (!configured) {
    renderSetup();
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    renderLogin();
    return;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, active, display_name')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !profile || profile.active !== true || !roleLabels[profile.role]) {
    await supabase.auth.signOut();
    renderLogin('A conta não possui perfil autorizado ou está inativa.', true);
    return;
  }

  renderHome(profile);
}

if (configured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') renderLogin();
  });
}
start();

(() => {
  "use strict";
  const cloud = window.FAVMED_CLOUD;
  const client = cloud.client;
  const root = document.documentElement;
  const localMode = !!window.FAVMED_LOCAL_MODE;
  const params = new URLSearchParams(location.search);
  const publicMode = params.get("painel") === "1" || location.pathname === "/sala" || location.pathname === "/sala/";
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const authFlow = hashParams.get("type") || params.get("flow") || "";
  let overlay = null;

  function cleanAuthUrl() {
    const clean = location.pathname + location.search;
    history.replaceState({}, document.title, clean);
  }

  function showAccessMessage(message) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.className = "favmed-auth-overlay";
    overlay.innerHTML = `
      <section class="favmed-auth-card" aria-labelledby="favmed-auth-title">
        <img src="/logo-favmed.png" alt="Clínica Favmed" class="favmed-auth-logo">
        <h1 id="favmed-auth-title">Sala de espera</h1>
        <p id="favmed-auth-info"></p>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#favmed-auth-info").textContent = message;
    root.classList.remove("favmed-auth-checking");
  }

  function showPasswordSetup(message) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.className = "favmed-auth-overlay";
    overlay.innerHTML = `
      <section class="favmed-auth-card" aria-labelledby="favmed-auth-title">
        <img src="/logo-favmed.png" alt="Clínica Favmed" class="favmed-auth-logo">
        <h1 id="favmed-auth-title">Definir senha</h1>
        <p>Crie uma senha para acessar o FAVMED. Use pelo menos 8 caracteres.</p>
        <form id="favmed-password-form">
          <label for="favmed-new-password">Nova senha</label>
          <input id="favmed-new-password" name="password" type="password" autocomplete="new-password" minlength="8" required>
          <label for="favmed-confirm-password">Confirmar senha</label>
          <input id="favmed-confirm-password" name="confirm" type="password" autocomplete="new-password" minlength="8" required>
          <button type="submit" class="favmed-auth-submit">Salvar senha</button>
          <div class="favmed-auth-message" id="favmed-password-message" role="alert"></div>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    root.classList.remove("favmed-auth-checking");
    const form = overlay.querySelector("#favmed-password-form");
    const messageBox = overlay.querySelector("#favmed-password-message");
    if (message) messageBox.textContent = message;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector("button");
      const password = form.elements.password.value;
      if (password.length < 8) {
        messageBox.textContent = "A senha deve ter pelo menos 8 caracteres.";
        return;
      }
      if (password !== form.elements.confirm.value) {
        messageBox.textContent = "As senhas não coincidem.";
        return;
      }
      button.disabled = true;
      button.textContent = "Salvando...";
      messageBox.textContent = "";
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        await client.auth.signOut();
        cleanAuthUrl();
        showLogin("Senha criada com sucesso. Entre com seu e-mail e a nova senha.");
      } catch (error) {
        messageBox.textContent = error.message || "Não foi possível salvar a senha. Abra novamente o link recebido por e-mail.";
      } finally {
        button.disabled = false;
        button.textContent = "Salvar senha";
      }
    });
  }

  function showRecovery(message) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.className = "favmed-auth-overlay";
    overlay.innerHTML = `
      <section class="favmed-auth-card" aria-labelledby="favmed-auth-title">
        <img src="/logo-favmed.png" alt="Clínica Favmed" class="favmed-auth-logo">
        <h1 id="favmed-auth-title">Esqueci a senha</h1>
        <p>Informe seu e-mail. Enviaremos um link para criar uma nova senha.</p>
        <form id="favmed-recovery-form">
          <label for="favmed-recovery-email">E-mail</label>
          <input id="favmed-recovery-email" name="email" type="email" autocomplete="username" required>
          <button type="submit" class="favmed-auth-submit">Enviar link</button>
          <button type="button" id="favmed-back-login" class="favmed-auth-submit" style="margin-top:8px;background:#647780">Voltar ao login</button>
          <div class="favmed-auth-message" id="favmed-recovery-message" role="alert"></div>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    root.classList.remove("favmed-auth-checking");
    const form = overlay.querySelector("#favmed-recovery-form");
    const messageBox = overlay.querySelector("#favmed-recovery-message");
    if (message) messageBox.textContent = message;
    overlay.querySelector("#favmed-back-login").addEventListener("click", () => showLogin(""));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = "Enviando...";
      messageBox.textContent = "";
      try {
        const email = form.elements.email.value.trim();
        const redirectTo = location.origin + location.pathname + "?flow=recovery";
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        messageBox.textContent = "Se o e-mail estiver cadastrado, você receberá um link para definir uma nova senha.";
      } catch (error) {
        messageBox.textContent = error.message || "Não foi possível enviar o link. Tente novamente.";
      } finally {
        button.disabled = false;
        button.textContent = "Enviar link";
      }
    });
  }

  function showLogin(message) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.className = "favmed-auth-overlay";
    overlay.innerHTML = `
      <section class="favmed-auth-card" aria-labelledby="favmed-auth-title">
        <img src="/logo-favmed.png" alt="Clínica Favmed" class="favmed-auth-logo">
        <h1 id="favmed-auth-title">Clínica Favmed</h1>
        <p>Acesse sua conta para entrar no aplicativo.</p>
        <form id="favmed-auth-form">
          <label for="favmed-auth-email">E-mail</label>
          <input id="favmed-auth-email" name="email" type="email" autocomplete="username" required>
          <label for="favmed-auth-password">Senha</label>
          <input id="favmed-auth-password" name="password" type="password" autocomplete="current-password" required>
          <button type="submit" class="favmed-auth-submit">Entrar</button>
          <button type="button" id="favmed-forgot-password" class="favmed-auth-submit" style="margin-top:8px;background:#647780">Esqueci a senha</button>
          <div class="favmed-auth-message" id="favmed-auth-message" role="alert"></div>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    root.classList.remove("favmed-auth-checking");
    if (message) overlay.querySelector("#favmed-auth-message").textContent = message;
    const form = overlay.querySelector("#favmed-auth-form");
    overlay.querySelector("#favmed-forgot-password").addEventListener("click", () => showRecovery(""));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const messageBox = form.querySelector("#favmed-auth-message");
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      button.disabled = true;
      button.textContent = "Verificando...";
      messageBox.textContent = "";
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await validateSession();
      } catch (error) {
        messageBox.textContent = error.message || "Não foi possível entrar. Confira seus dados.";
      } finally {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    });
  }

  function addLogoutButton() {
    if (document.getElementById("favmed-logout")) return;
    const profile = cloud.profile;
    if (profile && profile.role === "master" && !publicMode && !document.getElementById("favmed-admin-logins")) {
      const adminButton = document.createElement("a");
      adminButton.id = "favmed-admin-logins";
      adminButton.href = "/admin-logins.html";
      adminButton.textContent = "Administrar logins";
      adminButton.setAttribute("aria-label", "Abrir administração de logins");
      adminButton.style.cssText = "position:fixed;right:154px;bottom:18px;z-index:9998;border:0;border-radius:10px;padding:11px 16px;background:#087f8c;color:#fff;text-decoration:none;font:700 13px Segoe UI,Arial,sans-serif;box-shadow:0 4px 16px #0002;cursor:pointer";
      document.body.appendChild(adminButton);
    }
    const button = document.createElement("button");
    button.id = "favmed-logout";
    button.type = "button";
    button.textContent = "Sair da conta";
    button.setAttribute("aria-label", "Sair da conta");
    button.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:9998;border:0;border-radius:10px;padding:11px 16px;background:#20313a;color:#fff;font:700 13px Segoe UI,Arial,sans-serif;box-shadow:0 4px 16px #0002;cursor:pointer";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Saindo...";
      const { error } = await client.auth.signOut();
      if (error) {
        button.disabled = false;
        button.textContent = "Sair da conta";
        alert("Não foi possível encerrar a sessão: " + (error.message || "tente novamente."));
      }
    });
    document.body.appendChild(button);
  }

  async function validateSession() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      if (publicMode) showAccessMessage("Para exibir as chamadas, abra a sala de espera pelo botão disponível na recepção.");
      else showLogin("");
      return false;
    }
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, display_name, role, active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError || !profile || !profile.active) {
      await client.auth.signOut();
      showLogin("Conta sem perfil ativo. Solicite ao administrador a liberação do acesso.");
      return false;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    cloud.resolveAuth(profile);
    await cloud.readQueue({ publicMode });
    addLogoutButton();
    root.classList.remove("favmed-auth-checking");
    return true;
  }

  if (localMode) {
    cloud.resolveAuth({ role: "local", active: true });
    root.classList.remove("favmed-auth-checking");
    return;
  }

  if (publicMode) {
    cloud.resolveAuth({ role: "sala", active: true, public: true });
    root.classList.remove("favmed-auth-checking");
    return;
  }

  if (authFlow === "invite" || authFlow === "recovery" || authFlow === "signup") {
    showPasswordSetup(authFlow === "invite" ? "Defina sua senha para ativar o acesso." : "Defina sua nova senha.");
    return;
  }

  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") location.reload();
  });

  validateSession().catch(error => {
    showLogin(error.message || "Não foi possível validar a sessão. Tente novamente.");
  });
})();
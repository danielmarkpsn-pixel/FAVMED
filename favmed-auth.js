(() => {
  "use strict";
  const cloud = window.FAVMED_CLOUD;
  const client = cloud.client;
  const root = document.documentElement;
  const localMode = !!window.FAVMED_LOCAL_MODE;
  const publicMode = new URLSearchParams(location.search).get("painel") === "1" ||
    location.pathname === "/sala" || location.pathname === "/sala/";
  let overlay = null;

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
          <div class="favmed-auth-message" id="favmed-auth-message" role="alert"></div>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    root.classList.remove("favmed-auth-checking");
    if (message) overlay.querySelector("#favmed-auth-message").textContent = message;
    const form = overlay.querySelector("#favmed-auth-form");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector("button");
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
    // Na versão Preview, qualquer perfil ativo pode entrar nos módulos.
    // As permissões específicas continuam sendo aplicadas pelas operações protegidas no backend.
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
    // A tela pública da sala usa RPC limitado e não exige conta autenticada.
    cloud.resolveAuth({ role: "sala", active: true, public: true });
    root.classList.remove("favmed-auth-checking");
    return;
  }

  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") location.reload();
  });

  validateSession().catch(error => {
    showLogin(error.message || "Não foi possível validar a sessão. Tente novamente.");
  });
})();
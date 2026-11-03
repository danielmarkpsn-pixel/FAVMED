(() => {
  "use strict";
  const cloud = window.FAVMED_CLOUD;
  const client = cloud.client;
  const root = document.documentElement;
  const publicMode = new URLSearchParams(location.search).get("painel") === "1" ||
    location.pathname === "/sala" || location.pathname === "/sala/";
  let overlay = null;

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

  async function validateSession() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      showLogin("");
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
    if (profile.role === "sala" && !publicMode) {
      location.replace("/?painel=1");
      return false;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    cloud.resolveAuth(profile);
    root.classList.remove("favmed-auth-checking");
    return true;
  }

  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") location.reload();
  });

  validateSession().catch(error => {
    showLogin(error.message || "Não foi possível validar a sessão. Tente novamente.");
  });
})();
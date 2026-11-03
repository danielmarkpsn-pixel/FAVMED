(() => {
  "use strict";
  const SUPABASE_URL = "https://qzjkoyqmjueosevzhxqa.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jtcdZj5GJlxsbjUzKlLoFQ_u2IqjtuS";
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Biblioteca de conexão com o Supabase não foi carregada.");
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  let queueVersion = 0;
  let currentProfile = null;
  let resolveAuth;
  const authReady = new Promise(resolve => { resolveAuth = resolve; });
  function localDay() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  }
  async function rpc(name, args) {
    const result = await client.rpc(name, args || {});
    if (result.error) {
      const message = result.error.message || "Falha de comunicação com o Supabase.";
      if (result.error.code === "40001" || /QUEUE_CONFLICT/.test(message)) {
        throw new Error("A fila foi atualizada em outro dispositivo. Atualize a tela antes de salvar novamente.");
      }
      throw new Error(message);
    }
    return result.data;
  }
  window.FAVMED_AUTH_READY = authReady;
  window.FAVMED_CLOUD = {
    client,
    get profile() { return currentProfile; },
    resolveAuth(profile) {
      currentProfile = profile;
      resolveAuth(profile);
    },
    async readQueue(options) {
      await authReady;
      const publicMode = !!(options && options.publicMode);
      const data = publicMode
        ? await rpc("favmed_get_public_queue", { p_day: localDay() })
        : await rpc("favmed_get_queue");
      queueVersion = Number(data && data.version || 0);
      return Array.isArray(data && data.queue) ? data.queue : [];
    },
    async writeQueue(queue) {
      await authReady;
      const data = await rpc("favmed_set_queue", {
        p_queue: queue,
        p_expected_version: queueVersion
      });
      queueVersion = Number(data && data.version || queueVersion + 1);
      return true;
    }
  };
})();
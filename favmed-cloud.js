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
  let writeChain = Promise.resolve();
  const signedUrlCache = new Map();
  const authReady = new Promise(resolve => { resolveAuth = resolve; });

  function localDay() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  }
  function safeSegment(value) {
    return String(value || "arquivo").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_").slice(-110) || "arquivo";
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
  async function createSignedUrl(bucket, path) {
    const key = bucket + ":" + path;
    const cached = signedUrlCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    const url = data && data.signedUrl;
    if (!url) throw new Error("Não foi possível gerar o link seguro do arquivo.");
    signedUrlCache.set(key, { url, expiresAt: Date.now() + 3300000 });
    return url;
  }
  async function hydratePatientDocuments(queue) {
    await Promise.all(queue.map(async patient => {
      if (patient && patient.document && patient.document.path) {
        try {
          patient.document.url = await createSignedUrl("favmed-documents", patient.document.path);
        } catch (_) {
          patient.document.url = "";
        }
      }
    }));
    return queue;
  }

  async function uploadResumable(bucket, path, file, onProgress) {
    if (!window.tus || typeof window.tus.Upload !== "function") {
      throw new Error("O módulo de envio de arquivos grandes não foi carregado. Atualize a página.");
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data || !data.session) throw new Error("Sua sessão expirou. Entre novamente.");
    return await new Promise((resolve, reject) => {
      const upload = new window.tus.Upload(file, {
        endpoint: "https://qzjkoyqmjueosevzhxqa.storage.supabase.co/storage/v1/upload/resumable",
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: "Bearer " + data.session.access_token,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        fingerprint: () => Promise.resolve(bucket + ":" + path),
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
          metadata: JSON.stringify({ originalName: file.name })
        },
        onError: reject,
        onProgress(bytesUploaded, bytesTotal) {
          if (typeof onProgress === "function") onProgress(Math.floor(bytesUploaded / bytesTotal * 100));
        },
        onSuccess: resolve
      });
      upload.findPreviousUploads().then(previous => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(reject);
    });
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
      const queue = Array.isArray(data && data.queue) ? data.queue : [];
      return publicMode ? queue : await hydratePatientDocuments(queue);
    },
    async writeQueue(queue) {
      await authReady;
      const snapshot = JSON.parse(JSON.stringify(queue));
      for (const patient of snapshot) {
        if (patient && patient.document && patient.document.path) delete patient.document.url;
      }
      const operation = writeChain.then(async () => {
        const data = await rpc("favmed_set_queue", {
          p_queue: snapshot,
          p_expected_version: queueVersion
        });
        queueVersion = Number(data && data.version || queueVersion + 1);
        return true;
      });
      writeChain = operation.catch(() => {});
      return await operation;
    },
    async uploadPatientDocument(patientId, file) {
      await authReady;
      if (!currentProfile || !["master", "recepcao"].includes(currentProfile.role)) {
        throw new Error("Somente a recepção pode anexar documentos de pacientes.");
      }
      if (!file || file.size > 50 * 1024 * 1024 || (file.type && file.type !== "application/pdf")) {
        throw new Error("Anexe um PDF válido de até 50 MB.");
      }
      const path = "patients/" + safeSegment(patientId) + "/" + Date.now() + "-" + safeSegment(file.name);
      if (file.size > 6 * 1024 * 1024) {
        await uploadResumable("favmed-documents", path, file);
      } else {
        const { error } = await client.storage.from("favmed-documents").upload(path, file, {
          contentType: "application/pdf", upsert: false
        });
        if (error) throw error;
      }
      const storedPath = data && data.path || path;
      const url = await createSignedUrl("favmed-documents", storedPath);
      return { name: file.name, path: storedPath, url };
    },
    async listSlideshow() {
      await authReady;
      const { data, error } = await client.storage.from("favmed-media").list("media", {
        limit: 1000, sortBy: { column: "name", order: "asc" }
      });
      if (error) throw error;
      const files = (data || []).filter(item => item && item.id && item.name);
      return await Promise.all(files.map(async item => {
        const path = "media/" + item.name;
        const signedUrl = await createSignedUrl("favmed-media", path);
        const displayName = item.name.replace(/^\d+_/, "");
        const type = item.metadata && (item.metadata.mimetype || item.metadata.contentType) ||
          (/\.(mp4|webm|ogg|mov|m4v)$/i.test(displayName) ? "video/" + displayName.split(".").pop().toLowerCase() :
           /\.(png|jpg|jpeg|gif|webp|avif)$/i.test(displayName) ? "image/" + displayName.split(".").pop().toLowerCase() : "application/octet-stream");
        return { name: displayName, type, url: signedUrl };
      }));
    },
    async uploadSlideshow(file, onProgress) {
      await authReady;
      if (!currentProfile || !["master", "recepcao"].includes(currentProfile.role)) {
        throw new Error("Somente a recepção pode enviar fotos e vídeos para a sala.");
      }
      if (!file || !/^(image|video)\//i.test(file.type) || file.size > 52428800) {
        throw new Error("Envie uma foto ou vídeo de até 50 MB.");
      }
      const path = "media/" + Date.now() + "_" + safeSegment(file.name);
      if (file.size > 6 * 1024 * 1024) {
        await uploadResumable("favmed-media", path, file, onProgress);
      } else {
        const { error } = await client.storage.from("favmed-media").upload(path, file, {
          contentType: file.type, upsert: false
        });
        if (error) throw error;
      }
      signedUrlCache.delete("favmed-media:" + path);
      return true;
    }
  };
})();
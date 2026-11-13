// Panel de la Matriz de Redes (Cloudflare Worker).
// Sirve el panel (dist/) y una API con contraseña para: ver y editar piezas, aprobarlas, publicarlas por la
// API oficial (X y LinkedIn), programarlas, leer métricas, anotar ideas y dejar encargos para Claude.
//
// Secretos del Worker:
//   ALTA          enlace de un solo uso para que Emi cree su contraseña (/#alta=…); después ya no sirve.
//   PANEL_CLAVE   (opcional) contraseña fija; si no existe, vale la que Emi creó con el enlace de alta.
//   CIFRADO       llave para cifrar en KV las credenciales de X y LinkedIn (32+ caracteres al azar).
//   CLAUDE_LLAVE  llave para que las sesiones de Claude lean y dejen borradores (nunca aprueban ni publican).
// Enlaces: KV «REDES» (piezas, notas, encargos, credenciales cifradas, bitácora), Durable Object «INTENTOS».
// Reglas que el Worker hace cumplir (no se pueden saltar desde el navegador):
//   - Solo se publica lo que Emi aprobó en el panel, con la misma huella de texto.
//   - Ningún texto dice que lo hizo una IA; ninguno nombra al despacho ni a clientes.
//   - Tope de gasto mensual en la API de X; sin reintentos en bucle; si algo falla, se detiene y avisa.

const SEGURIDAD = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Robots-Tag": "noindex, nofollow",
};
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ahoraISO = () => new Date().toISOString();

// ---------------------------------------------------------------- reglas de texto (iguales a redes.py)

export const FRASES_PROHIBIDAS = ["lo hizo una ia", "lo armo una ia", "lo edito una ia", "lo escribio una ia", "generado por ia",
  "generado con ia", "hecho por ia", "hecho por una ia", "creado por ia", "creado por una ia", "texto de ia", "nadie lo edito"];
export function aplanar(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).join(" ");
}
export async function huella(texto) {
  const t = String(texto || "").normalize("NFC").trim();
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(t))).slice(0, 12);
}
const URL_RE = /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|mx|org|net|site|dev|io|gob\.mx|ai)(?:\/\S*)?/gi;
export function largoX(texto) {
  // Aproximación de x-viral: cada enlace cuenta 23 y cada emoji 2. El conteo final lo confirma x-viral.
  const t = String(texto || "").normalize("NFC");
  let total = 0;
  const sin = t.replace(URL_RE, () => { total += 23; return ""; });
  for (const ch of sin) {
    const o = ch.codePointAt(0);
    if (o === 0x200d || o === 0xfe0f || o === 0xfe0e || (o >= 0x1f3fb && o <= 0x1f3ff)) continue;
    total += o > 0x10ff && !(o >= 0x2000 && o <= 0x206f) ? 2 : 1;
  }
  return total;
}
const LIMITES = { x: 280, linkedin: 3000, instagram: 2200, tiktok: 4000 };
export function revisarTexto(texto, red) {
  const errores = [], avisos = [];
  const plano = ` ${aplanar(texto)} `;
  for (const f of FRASES_PROHIBIDAS) if (plano.includes(` ${f} `)) errores.push(`«${f}»: ninguna pieza dice que la hizo una IA.`);
  if (/\b(castorena|indep)\b/.test(plano)) errores.push("Nombra al despacho o a un cliente: no va en la cuenta personal.");
  if (/(comenta|escribe) \S+ (y|para) (te|les) (mando|paso|envio)/.test(plano)) errores.push("Anzuelo de interacción («comenta X y te mando…»): las redes lo castigan.");
  const largo = red === "x" ? largoX(texto) : [...String(texto || "")].length;
  if (LIMITES[red] && largo > LIMITES[red]) errores.push(`Pasa de ${LIMITES[red]} caracteres (${largo}).`);
  if (!String(texto || "").trim()) errores.push("El texto está vacío.");
  if (red === "linkedin" && [...String(texto || "").split("\n")[0]].length > 140) avisos.push("La primera línea pasa de 140 caracteres: en LinkedIn se corta antes de «ver más».");
  return { errores, avisos, largo };
}

// ---------------------------------------------------------------- sesión de Emi (mismo diseño que el panel de la Matriz)

async function hmac(clave, texto, algo = "SHA-256") {
  const k = await crypto.subtle.importKey("raw", typeof clave === "string" ? enc.encode(clave) : clave, { name: "HMAC", hash: algo }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(texto));
}
async function iguales(a, b) {
  const k = hex(crypto.getRandomValues(new Uint8Array(32)));
  const [x, y] = await Promise.all([hmac(k, String(a)), hmac(k, String(b))]);
  const X = new Uint8Array(x), Y = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < X.length; i++) d |= X[i] ^ Y[i];
  return d === 0;
}
const SESION = "redes_sesion";
const DIAS = 30;
// La contraseña la crea Emi una sola vez con un enlace de alta (secreto ALTA, de un solo uso); se guarda como
// PBKDF2 (100 000 vueltas, SHA-256: el máximo que admite Cloudflare Workers) en KV. Si existe el secreto PANEL_CLAVE, manda ese.
async function pbkdf2(clave, sal) {
  const k = await crypto.subtle.importKey("raw", enc.encode(clave), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(sal), iterations: 100000 }, k, 256));
}
async function claveGuardada(env) { return env.PANEL_CLAVE ? { secreto: true } : leer(env, "clave", null); }
async function claveCorrecta(env, intento) {
  if (env.PANEL_CLAVE) return iguales(String(intento), env.PANEL_CLAVE);
  const c = await leer(env, "clave", null);
  return !!c && iguales(await pbkdf2(String(intento), c.sal), c.hash);
}
async function llaveSesion(env) {
  const c = await leer(env, "clave", null);
  return `${env.PANEL_CLAVE || c?.hash || ""}·${env.CIFRADO || ""}·redes`;
}
async function crearSesion(env) {
  const vence = Date.now() + DIAS * 864e5;
  return `${vence}.${hex(await hmac(await llaveSesion(env), String(vence)))}`;
}
async function sesionValida(request, env) {
  if (!(await claveGuardada(env))) return false;
  const m = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${SESION}=([0-9]+)\\.([0-9a-f]{64})`));
  if (!m || +m[1] < Date.now()) return false;
  return iguales(m[2], hex(await hmac(await llaveSesion(env), m[1])));
}
const cookie = (valor, edad) => `${SESION}=${valor}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${edad}`;

const LIMITE_MIN = 5, LIMITE_HORA = 20;
const fallosLocales = new Map();
export class Intentos {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const ahora = Date.now();
    const v = ((await this.state.storage.get("v")) || []).filter((t) => ahora - t < 3600e3);
    if (new URL(request.url).pathname === "/fallo") { v.push(ahora); await this.state.storage.put("v", v); }
    return Response.json({ permitido: v.filter((t) => ahora - t < 60e3).length < LIMITE_MIN && v.length < LIMITE_HORA });
  }
}
async function intentos(request, env, accion) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (env.INTENTOS) {
    const r = await env.INTENTOS.get(env.INTENTOS.idFromName(ip)).fetch(`https://intentos/${accion}`, { method: "POST" });
    return (await r.json()).permitido;
  }
  const ahora = Date.now();
  const v = (fallosLocales.get(ip) || []).filter((t) => ahora - t < 3600e3);
  if (accion === "fallo") v.push(ahora);
  fallosLocales.set(ip, v);
  return v.filter((t) => ahora - t < 60e3).length < LIMITE_MIN && v.length < LIMITE_HORA;
}

// ---------------------------------------------------------------- almacenamiento

const memoria = new Map(); // solo para pruebas locales sin KV
const kv = (env) => env.REDES || {
  get: async (k, t) => { const v = memoria.get(k); return v === undefined ? null : t === "json" ? JSON.parse(v) : v; },
  put: async (k, v) => { memoria.set(k, v); },
  delete: async (k) => { memoria.delete(k); },
};
async function leer(env, k, def) { return (await kv(env).get(k, "json")) ?? def; }
async function guardar(env, k, v) { await kv(env).put(k, JSON.stringify(v)); }
async function bitacora(env, quien, que) {
  const b = await leer(env, "bitacora", []);
  b.unshift({ fecha: ahoraISO(), quien, que: String(que).slice(0, 300) });
  await guardar(env, "bitacora", b.slice(0, 300));
}
const nuevoId = () => hex(crypto.getRandomValues(new Uint8Array(6)));
const limpiar = (t, max = 4000) => String(t ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);

// Credenciales: cifradas con AES-GCM; la llave sale del secreto CIFRADO. Nunca se devuelven al navegador.
async function llaveCifrado(env) {
  if (!env.CIFRADO || env.CIFRADO.length < 32) throw new Error("Falta el secreto CIFRADO (32+ caracteres).");
  const d = await crypto.subtle.digest("SHA-256", enc.encode(env.CIFRADO));
  return crypto.subtle.importKey("raw", d, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function guardarSecreto(env, nombre, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llaveCifrado(env), enc.encode(JSON.stringify(obj)));
  await kv(env).put(`cred:${nombre}`, JSON.stringify({ iv: b64(iv), c: b64(c), fecha: ahoraISO() }));
}
async function leerSecreto(env, nombre) {
  const s = await kv(env).get(`cred:${nombre}`, "json");
  if (!s) return null;
  const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64(s.iv) }, await llaveCifrado(env), deb64(s.c));
  return JSON.parse(new TextDecoder().decode(p));
}

// ---------------------------------------------------------------- X: OAuth 1.0a (contexto de usuario)

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export async function firmaOAuth1(metodo, url, cred, extra = {}, nonce, ts) {
  const o = {
    oauth_consumer_key: cred.api_key, oauth_nonce: nonce || hex(crypto.getRandomValues(new Uint8Array(16))),
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: ts || String(Math.floor(Date.now() / 1000)),
    oauth_token: cred.access_token, oauth_version: "1.0",
  };
  const u = new URL(url);
  const params = { ...o, ...extra };
  u.searchParams.forEach((v, k) => { params[k] = v; });
  const base = [metodo.toUpperCase(), pct(u.origin + u.pathname),
    pct(Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join("&"))].join("&");
  const firma = b64(await hmac(`${pct(cred.api_secret)}&${pct(cred.access_secret)}`, base, "SHA-1"));
  return "OAuth " + Object.entries({ ...o, oauth_signature: firma }).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(", ");
}
const COSTO_X = { post: 0.015, post_con_enlace: 0.2, lectura: 0.005 }; // USD; fuente: x-viral references/api.md (13/11/2026)
async function gastoX(env, usd, que) {
  const mes = new Date().toISOString().slice(0, 7);
  const g = await leer(env, `gasto:x:${mes}`, { usd: 0, llamadas: [] });
  const tope = Number(env.TOPE_X_USD || 10);
  if (g.usd + usd > tope) throw new Error(`Se llegaría al tope de ${tope} USD de este mes en la API de X. No se hizo la llamada.`);
  g.usd = Math.round((g.usd + usd) * 1000) / 1000;
  g.llamadas.unshift({ fecha: ahoraISO(), usd, que });
  g.llamadas = g.llamadas.slice(0, 200);
  await guardar(env, `gasto:x:${mes}`, g);
}
async function publicarX(env, pieza, fetcher = fetch) {
  const cred = await leerSecreto(env, "x");
  if (!cred) throw new Error("Faltan las llaves de X: pégalas en Ajustes.");
  const conEnlace = URL_RE.test(pieza.texto); URL_RE.lastIndex = 0;
  await gastoX(env, conEnlace ? COSTO_X.post_con_enlace : COSTO_X.post, `post ${pieza.id}`);
  const url = "https://api.x.com/2/tweets";
  const r = await fetcher(url, {
    method: "POST",
    headers: { Authorization: await firmaOAuth1("POST", url, cred), "Content-Type": "application/json" },
    body: JSON.stringify({ text: pieza.texto }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || !cuerpo?.data?.id) throw new Error(`X respondió ${r.status}: ${JSON.stringify(cuerpo).slice(0, 300)}`);
  return { id: cuerpo.data.id, url: `https://x.com/i/web/status/${cuerpo.data.id}` };
}
async function metricasX(env, id, fetcher = fetch) {
  const cred = await leerSecreto(env, "x");
  if (!cred) throw new Error("Faltan las llaves de X.");
  await gastoX(env, COSTO_X.lectura, `métricas ${id}`);
  const url = `https://api.x.com/2/tweets/${encodeURIComponent(id)}?tweet.fields=public_metrics,non_public_metrics,created_at`;
  const r = await fetcher(url, { headers: { Authorization: await firmaOAuth1("GET", url, cred) } });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`X respondió ${r.status}: ${JSON.stringify(c).slice(0, 300)}`);
  return { ...(c.data?.public_metrics || {}), ...(c.data?.non_public_metrics || {}) };
}

// ---------------------------------------------------------------- LinkedIn (OAuth 2.0, «Share on LinkedIn»)

async function publicarLinkedIn(env, pieza, fetcher = fetch) {
  const t = await leerSecreto(env, "linkedin");
  if (!t?.access_token || !t?.persona) throw new Error("LinkedIn no está conectado: Ajustes → Conectar LinkedIn.");
  if (t.vence && Date.parse(t.vence) < Date.now()) throw new Error("El permiso de LinkedIn venció: vuelve a conectarlo en Ajustes.");
  const r = await fetcher("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json",
      "LinkedIn-Version": env.LINKEDIN_VERSION || "202510", "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: t.persona, commentary: pieza.texto, visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    }),
  });
  if (r.status !== 201) throw new Error(`LinkedIn respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const urn = r.headers.get("x-restli-id") || "";
  return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : "" };
}

// ---------------------------------------------------------------- piezas

export const ESTADOS = ["borrador", "lista para aprobar", "aprobada", "programada", "publicando", "publicada", "fallo", "cancelada"];
async function piezas(env) { return leer(env, "piezas", []); }
async function guardarPiezas(env, lista) { await guardar(env, "piezas", lista.slice(0, 1000)); }

async function editarPieza(env, datos, quien) {
  const lista = await piezas(env);
  const red = String(datos.red || "");
  if (!["x", "linkedin", "instagram", "tiktok"].includes(red)) throw new Error("Red inválida.");
  const texto = limpiar(datos.texto, 5000);
  let p = datos.id ? lista.find((x) => x.id === datos.id) : null;
  if (p && ["publicando", "publicada"].includes(p.estado)) throw new Error("Ya se publicó: no se edita.");
  const nueva = !p;
  if (!p) { p = { id: nuevoId(), creada: ahoraISO(), creada_por: quien, historial: [] }; lista.unshift(p); }
  const cambioTexto = p.texto !== texto;
  Object.assign(p, {
    red, texto, titulo: limpiar(datos.titulo || p.titulo || "", 120), idea: limpiar(datos.idea || p.idea || "", 80),
    media: limpiar(datos.media || p.media || "", 300), nota: limpiar(datos.nota ?? p.nota ?? "", 600),
    fecha: datos.fecha ? new Date(datos.fecha).toISOString() : p.fecha || null, actualizada: ahoraISO(),
  });
  if (cambioTexto || nueva) {
    // Si el texto cambia, la aprobación anterior deja de valer.
    delete p.aprobado; delete p.aprobado_huella;
    p.estado = quien === "claude" ? "lista para aprobar" : (datos.estado === "lista para aprobar" ? "lista para aprobar" : "borrador");
  }
  p.historial.unshift({ fecha: ahoraISO(), quien, que: nueva ? "creada" : cambioTexto ? "texto editado" : "datos editados" });
  p.historial = p.historial.slice(0, 50);
  p.revision = revisarTexto(texto, red);
  await guardarPiezas(env, lista);
  await bitacora(env, quien, `${nueva ? "Pieza nueva" : "Pieza editada"} (${red}): ${p.titulo || texto.slice(0, 60)}`);
  return p;
}

async function aprobar(env, id) {
  const lista = await piezas(env);
  const p = lista.find((x) => x.id === id);
  if (!p) throw new Error("No existe esa pieza.");
  const rev = revisarTexto(p.texto, p.red);
  if (rev.errores.length) throw new Error("No se puede aprobar: " + rev.errores.join(" "));
  p.aprobado = { fecha: ahoraISO(), medio: "panel", por: "Emi" };
  p.aprobado_huella = await huella(p.texto);
  p.estado = p.fecha && Date.parse(p.fecha) > Date.now() + 60e3 ? "programada" : "aprobada";
  p.historial.unshift({ fecha: ahoraISO(), quien: "Emi", que: `aprobada (${p.aprobado_huella})` });
  await guardarPiezas(env, lista);
  await bitacora(env, "Emi", `Aprobó ${p.red}: ${p.titulo || p.texto.slice(0, 60)}`);
  return p;
}

const PUBLICADORES = { x: publicarX, linkedin: publicarLinkedIn };
export async function publicar(env, id, fetcher = fetch) {
  const lista = await piezas(env);
  const p = lista.find((x) => x.id === id);
  if (!p) throw new Error("No existe esa pieza.");
  if (!PUBLICADORES[p.red]) throw new Error(`${p.red} todavía no publica por API: copia el texto y publícalo desde la app.`);
  if (!["aprobada", "programada"].includes(p.estado)) throw new Error("Solo se publica lo aprobado.");
  if (p.aprobado_huella !== (await huella(p.texto))) throw new Error("El texto cambió después de aprobarse: vuelve a aprobarlo.");
  const rev = revisarTexto(p.texto, p.red);
  if (rev.errores.length) throw new Error(rev.errores.join(" "));
  p.estado = "publicando"; // candado: evita publicar dos veces si el cron y Emi coinciden
  await guardarPiezas(env, lista);
  try {
    const r = await PUBLICADORES[p.red](env, p, fetcher);
    p.estado = "publicada"; p.publicada = { fecha: ahoraISO(), ...r };
    p.historial.unshift({ fecha: ahoraISO(), quien: "panel", que: `publicada: ${r.url || r.id}` });
    await bitacora(env, "panel", `Publicado en ${p.red}: ${r.url || r.id}`);
  } catch (e) {
    p.estado = "fallo"; p.error = String(e.message || e).slice(0, 400);
    p.historial.unshift({ fecha: ahoraISO(), quien: "panel", que: `falló: ${p.error}` });
    await bitacora(env, "panel", `Falló ${p.red}: ${p.error}`);
  }
  const lista2 = await piezas(env);
  const i = lista2.findIndex((x) => x.id === id);
  if (i >= 0) lista2[i] = p;
  await guardarPiezas(env, lista2);
  return p;
}

// ---------------------------------------------------------------- API

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...SEGURIDAD, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });

async function claudeValido(request, env) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer (.{20,})$/);
  return !!(env.CLAUDE_LLAVE && m && (await iguales(m[1], env.CLAUDE_LLAVE)));
}

async function api(request, env, url) {
  const ruta = url.pathname.replace(/\/+$/, "");
  const metodo = request.method;
  const configurado = !!((await claveGuardada(env)) && env.CIFRADO);

  // Callback de LinkedIn: GET con redirección, sin JSON.
  if (ruta === "/api/linkedin/volver" && metodo === "GET") return linkedinVolver(request, env, url);

  let cuerpo = {};
  if (metodo === "POST") {
    const origen = request.headers.get("Origin");
    const esClaude = ruta.startsWith("/api/claude/");
    if (!esClaude && origen && origen !== url.origin) return json({ error: "Origen no permitido." }, 403);
    if ((request.headers.get("Content-Type") || "").split(";")[0] !== "application/json") return json({ error: "Se esperaba JSON." }, 415);
    try { cuerpo = await request.json(); } catch { return json({ error: "JSON inválido." }, 400); }
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return json({ error: "JSON inválido." }, 400);
  }

  // --- Claude (llave propia; puede leer y dejar borradores o notas; nunca aprueba ni publica)
  if (ruta.startsWith("/api/claude/")) {
    if (!(await claudeValido(request, env))) return json({ error: "Llave inválida." }, 401);
    if (ruta === "/api/claude/estado" && metodo === "GET")
      return json({ piezas: await piezas(env), notas: await leer(env, "notas", []), encargos: await leer(env, "encargos", []), bitacora: (await leer(env, "bitacora", [])).slice(0, 50) });
    if (ruta === "/api/claude/pieza" && metodo === "POST") {
      if (cuerpo.id) {
        const p = (await piezas(env)).find((x) => x.id === cuerpo.id);
        if (p && p.creada_por !== "claude") return json({ error: "Claude solo edita borradores que dejó Claude." }, 403);
      }
      return json(await editarPieza(env, cuerpo, "claude"));
    }
    if (ruta === "/api/claude/nota" && metodo === "POST") return json(await agregarNota(env, cuerpo, "claude"));
    const me = ruta.match(/^\/api\/claude\/encargo\/([a-f0-9]{12})$/);
    if (me && metodo === "POST") return json(await cambiarEncargo(env, me[1], cuerpo, "claude"));
    return json({ error: "No encontrado." }, 404);
  }

  // --- sesión
  if (ruta === "/api/sesion" && metodo === "GET") return json({ editor: await sesionValida(request, env), configurado });
  if (ruta === "/api/alta" && metodo === "POST") {
    // Alta de la contraseña: una sola vez, con el enlace que lleva el secreto ALTA.
    if (await claveGuardada(env)) return json({ error: "La contraseña ya existe. Este enlace ya no sirve." }, 409);
    if (!env.ALTA || !(await intentos(request, env, "estado"))) return json({ error: "Enlace inválido." }, 403);
    if (!(await iguales(String(cuerpo.alta ?? ""), env.ALTA))) { await intentos(request, env, "fallo"); return json({ error: "Enlace inválido." }, 403); }
    const clave = String(cuerpo.clave ?? "");
    if ([...clave].length < 10) return json({ error: "Usa al menos 10 caracteres." }, 400);
    const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
    await guardar(env, "clave", { sal, hash: await pbkdf2(clave, sal), fecha: ahoraISO() });
    await bitacora(env, "Emi", "Creó la contraseña del panel");
    return json({ editor: true }, 200, { "Set-Cookie": cookie(await crearSesion(env), DIAS * 86400) });
  }
  if (ruta === "/api/entrar" && metodo === "POST") {
    if (!configurado) return json({ error: "El panel aún no tiene contraseña configurada." }, 503);
    if (!(await intentos(request, env, "estado"))) return json({ error: "Demasiados intentos. Espera un rato." }, 429, { "Retry-After": "60" });
    if (!(await claveCorrecta(env, cuerpo.clave ?? ""))) {
      await intentos(request, env, "fallo");
      await new Promise((r) => setTimeout(r, 800));
      return json({ error: "Contraseña incorrecta." }, 401);
    }
    return json({ editor: true }, 200, { "Set-Cookie": cookie(await crearSesion(env), DIAS * 86400) });
  }
  if (ruta === "/api/salir" && metodo === "POST") return json({ editor: false }, 200, { "Set-Cookie": cookie("", 0) });
  if (!(await sesionValida(request, env))) return json({ error: "Entra con tu contraseña." }, 401);

  // --- Emi
  try {
    if (ruta === "/api/estado" && metodo === "GET") {
      const mes = new Date().toISOString().slice(0, 7);
      return json({
        piezas: await piezas(env), notas: await leer(env, "notas", []), encargos: await leer(env, "encargos", []),
        bitacora: (await leer(env, "bitacora", [])).slice(0, 80), gasto_x: await leer(env, `gasto:x:${mes}`, { usd: 0, llamadas: [] }),
        tope_x: Number(env.TOPE_X_USD || 10),
        conexiones: { x: !!(await kv(env).get("cred:x")), linkedin: !!(await kv(env).get("cred:linkedin")), linkedin_app: !!(await kv(env).get("cred:linkedin_app")) },
      });
    }
    if (ruta === "/api/pieza" && metodo === "POST") return json(await editarPieza(env, cuerpo, "Emi"));
    const mp = ruta.match(/^\/api\/pieza\/([a-f0-9]{12})\/(aprobar|publicar|cancelar|metricas|revisar)$/);
    if (mp && metodo === "POST") {
      const [, id, accion] = mp;
      if (accion === "aprobar") return json(await aprobar(env, id));
      if (accion === "publicar") return json(await publicar(env, id));
      if (accion === "revisar") {
        const p = (await piezas(env)).find((x) => x.id === id);
        return json(p ? revisarTexto(p.texto, p.red) : { error: "No existe." });
      }
      const lista = await piezas(env);
      const p = lista.find((x) => x.id === id);
      if (!p) return json({ error: "No existe esa pieza." }, 404);
      if (accion === "cancelar") {
        if (["publicando", "publicada"].includes(p.estado)) return json({ error: "Ya se publicó." }, 409);
        p.estado = "cancelada"; p.historial.unshift({ fecha: ahoraISO(), quien: "Emi", que: "cancelada" });
      }
      if (accion === "metricas") {
        if (p.red !== "x" || !p.publicada?.id) return json({ error: "Solo hay métricas automáticas de posts publicados en X; las demás se capturan." }, 400);
        p.metricas = { fecha: ahoraISO(), fuente: "API de X", valores: await metricasX(env, p.publicada.id) };
      }
      await guardarPiezas(env, lista);
      return json(p);
    }
    if (ruta === "/api/pieza/captura" && metodo === "POST") {
      // Métricas que Emi copia de la app (cualquier red), en las unidades de esa red.
      const lista = await piezas(env);
      const p = lista.find((x) => x.id === cuerpo.id);
      if (!p) return json({ error: "No existe esa pieza." }, 404);
      const valores = {};
      for (const [k, v] of Object.entries(cuerpo.valores || {})) if (/^[a-z_]{2,40}$/.test(k) && Number.isFinite(+v)) valores[k] = +v;
      p.metricas = { fecha: ahoraISO(), fuente: "captura de Emi", valores };
      await guardarPiezas(env, lista);
      return json(p);
    }
    if (ruta === "/api/nota" && metodo === "POST") return json(await agregarNota(env, cuerpo, "Emi"));
    if (ruta === "/api/encargo" && metodo === "POST") {
      const e = await leer(env, "encargos", []);
      const nuevo = { id: nuevoId(), fecha: ahoraISO(), texto: limpiar(cuerpo.texto, 2000), para: limpiar(cuerpo.para || "matriz-redes", 60), estado: "pendiente", respuestas: [] };
      if (!nuevo.texto.trim()) return json({ error: "Escribe el encargo." }, 400);
      e.unshift(nuevo); await guardar(env, "encargos", e.slice(0, 300));
      await bitacora(env, "Emi", `Encargo para ${nuevo.para}: ${nuevo.texto.slice(0, 80)}`);
      return json(nuevo);
    }
    const me = ruta.match(/^\/api\/encargo\/([a-f0-9]{12})$/);
    if (me && metodo === "POST") return json(await cambiarEncargo(env, me[1], cuerpo, "Emi"));
    if (ruta === "/api/llaves/x" && metodo === "POST") {
      const c = {};
      for (const k of ["api_key", "api_secret", "access_token", "access_secret"]) {
        c[k] = String(cuerpo[k] || "").trim();
        if (c[k].length < 10 || c[k].length > 200 || /\s/.test(c[k])) return json({ error: `Revisa «${k}».` }, 400);
      }
      await guardarSecreto(env, "x", c);
      await bitacora(env, "Emi", "Guardó las llaves de X");
      return json({ ok: true });
    }
    if (ruta === "/api/llaves/linkedin-app" && metodo === "POST") {
      const c = { client_id: String(cuerpo.client_id || "").trim(), client_secret: String(cuerpo.client_secret || "").trim() };
      if (c.client_id.length < 6 || c.client_secret.length < 6) return json({ error: "Revisa el Client ID y el Client Secret." }, 400);
      await guardarSecreto(env, "linkedin_app", c);
      await bitacora(env, "Emi", "Guardó la app de LinkedIn");
      return json({ ok: true });
    }
    if (ruta === "/api/linkedin/conectar" && metodo === "POST") {
      const app = await leerSecreto(env, "linkedin_app");
      if (!app) return json({ error: "Primero guarda el Client ID y el Client Secret de tu app de LinkedIn." }, 400);
      const estado = hex(crypto.getRandomValues(new Uint8Array(16)));
      await kv(env).put(`linkedin_estado:${estado}`, "1", { expirationTtl: 600 });
      const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
      u.search = new URLSearchParams({ response_type: "code", client_id: app.client_id, redirect_uri: `${url.origin}/api/linkedin/volver`, state: estado, scope: "openid profile w_member_social" });
      return json({ url: u.toString() });
    }
    if (ruta === "/api/llaves/borrar" && metodo === "POST") {
      const n = String(cuerpo.nombre || "");
      if (!["x", "linkedin", "linkedin_app"].includes(n)) return json({ error: "Nombre inválido." }, 400);
      await kv(env).delete(`cred:${n}`);
      await bitacora(env, "Emi", `Borró las credenciales de ${n}`);
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: String(e.message || e) }, 400);
  }
  return json({ error: "No encontrado." }, 404);
}

async function agregarNota(env, cuerpo, quien) {
  const n = await leer(env, "notas", []);
  const nota = { id: nuevoId(), fecha: ahoraISO(), quien, red: limpiar(cuerpo.red || "todas", 20), tipo: limpiar(cuerpo.tipo || "idea", 20), texto: limpiar(cuerpo.texto, 2000) };
  if (!nota.texto.trim()) throw new Error("Escribe la nota.");
  n.unshift(nota); await guardar(env, "notas", n.slice(0, 1000));
  await bitacora(env, quien, `Nota (${nota.tipo}, ${nota.red}): ${nota.texto.slice(0, 80)}`);
  return nota;
}
async function cambiarEncargo(env, id, cuerpo, quien) {
  const e = await leer(env, "encargos", []);
  const x = e.find((y) => y.id === id);
  if (!x) throw new Error("No existe ese encargo.");
  if (cuerpo.respuesta) x.respuestas.push({ fecha: ahoraISO(), quien, texto: limpiar(cuerpo.respuesta, 3000) });
  if (["pendiente", "en curso", "hecho", "descartado"].includes(cuerpo.estado)) x.estado = cuerpo.estado;
  await guardar(env, "encargos", e);
  return x;
}

async function linkedinVolver(request, env, url) {
  const volver = (msg) => Response.redirect(`${url.origin}/#ajustes?linkedin=${encodeURIComponent(msg)}`, 302);
  if (!(await sesionValida(request, env))) return volver("Entra al panel antes de conectar LinkedIn.");
  const estado = url.searchParams.get("state") || "";
  if (!estado || !(await kv(env).get(`linkedin_estado:${estado}`))) return volver("La conexión venció; inténtalo otra vez.");
  await kv(env).delete(`linkedin_estado:${estado}`);
  if (url.searchParams.get("error")) return volver(`LinkedIn no autorizó: ${url.searchParams.get("error_description") || url.searchParams.get("error")}`);
  const app = await leerSecreto(env, "linkedin_app");
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: `${url.origin}/api/linkedin/volver`, client_id: app.client_id, client_secret: app.client_secret }),
  });
  const t = await r.json().catch(() => ({}));
  if (!t.access_token) return volver(`LinkedIn no entregó el permiso (${r.status}).`);
  const yo = await (await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}));
  if (!yo.sub) return volver("No se pudo leer tu perfil de LinkedIn.");
  await guardarSecreto(env, "linkedin", { access_token: t.access_token, persona: `urn:li:person:${yo.sub}`, nombre: yo.name || "", vence: new Date(Date.now() + (t.expires_in || 0) * 1000).toISOString() });
  await bitacora(env, "Emi", "Conectó LinkedIn");
  return volver("ok");
}

// ---------------------------------------------------------------- cron: publica lo programado y pide métricas

export async function tic(env, fetcher = fetch) {
  const ahora = Date.now();
  const lista = await piezas(env);
  for (const p of lista.filter((x) => x.estado === "programada" && x.fecha && Date.parse(x.fecha) <= ahora)) {
    if (ahora - Date.parse(p.fecha) > 6 * 3600e3) {
      // No se publica algo seis horas tarde sin que Emi lo vea: queda para que decida.
      p.estado = "aprobada"; p.historial.unshift({ fecha: ahoraISO(), quien: "panel", que: "no salió a su hora; espera a Emi" });
      await guardarPiezas(env, lista);
      continue;
    }
    await publicar(env, p.id, fetcher);
  }
  // Métricas de X a las 48 h y a los 7 días (una lectura cada vez).
  const lista2 = await piezas(env);
  let cambio = false;
  for (const p of lista2.filter((x) => x.red === "x" && x.estado === "publicada" && x.publicada?.id)) {
    const edad = (ahora - Date.parse(p.publicada.fecha)) / 3600e3;
    p.lecturas = p.lecturas || [];
    for (const h of [48, 168]) {
      if (edad >= h && !p.lecturas.includes(h)) {
        try { p.metricas = { fecha: ahoraISO(), fuente: `API de X (${h} h)`, valores: await metricasX(env, p.publicada.id, fetcher) }; }
        catch (e) { p.metricas_error = String(e.message || e).slice(0, 200); }
        p.lecturas.push(h); cambio = true;
      }
    }
  }
  if (cambio) await guardarPiezas(env, lista2);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url); } catch (e) { return json({ error: "Error del servidor: " + String(e.message || e) }, 500); }
    }
    const r = await env.ASSETS.fetch(request);
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(SEGURIDAD)) h.set(k, v);
    h.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    return new Response(r.body, { status: r.status, headers: h });
  },
  async scheduled(evento, env, ctx) { ctx.waitUntil(tic(env)); },
};

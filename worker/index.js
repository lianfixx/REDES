// Panel de la Matriz de Redes (Cloudflare Worker).
// Sirve el panel (dist/) y una API con contraseña para: ver y editar piezas, aprobarlas, publicarlas por la
// API oficial (X y LinkedIn), programarlas, leer métricas, anotar ideas y dejar encargos para Claude.
//
// Todo el estado vive en UN Durable Object («PANEL»): cada petición de la API se atiende ahí, una a la vez,
// con almacenamiento fuertemente consistente. Así no hay dos publicaciones por carrera ni listas pisadas.
// (Antes vivía en KV; si el Durable Object no tiene una clave, la lee una vez de KV y la copia.)
//
// Secretos del Worker:
//   ALTA          enlace de un solo uso para que Emi cree su contraseña (/#alta=…); después no sirve aunque siga cargado.
//   PANEL_CLAVE   (opcional) contraseña fija; si no existe, vale la que Emi creó con el enlace de alta.
//   CIFRADO       llave para cifrar las credenciales de X y LinkedIn (32+ caracteres al azar).
//   CLAUDE_LLAVE  llave (32+ caracteres) para que las sesiones de Claude lean y dejen borradores; nunca aprueban ni publican.
// Reglas que el servidor hace cumplir (no se pueden saltar desde el navegador):
//   - Solo se publica lo que Emi aprobó, con la misma huella de texto, red y fecha.
//   - Ningún texto dice que lo hizo una IA; ninguno nombra al despacho ni a clientes; ninguno repite el de otra red.
//   - Tope de gasto mensual en la API de X; sin reintentos en bucle; si algo falla, se detiene y espera a Emi.

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

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t" };
export function aplanar(t) {
  let s = String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/[0134579]/g, (d) => LEET[d] ?? d).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).join(" ");
  // Une letras sueltas seguidas («i a», «c a s t o r e n a» → «ia», «castorena»).
  return s.replace(/\b(?:[a-z] ){1,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
}
const IA = "(?:ia|inteligencia artificial|chatgpt|gpt|claude|gemini|deepseek|copilot|muse|un robot|una maquina)";
const HECHO = "(?:hizo|hecho|hecha|escrito|escrita|escribio|redacto|redactado|redactada|generado|generada|genero|creado|creada|armo|armado|armada|edito|editado|editada|produjo|producido|producida|diseno|disenado|disenada|monto|montado|montada)";
const RE_AUTORIA = [
  new RegExp(`\\b${HECHO}\\b(?: \\w+){0,3} (?:por|con|usando|desde|mediante)?(?: \\w+){0,1} ?${IA}\\b`),
  new RegExp(`\\b${HECHO} (?:una |la |el )?${IA}\\b`),
  new RegExp(`\\b(?:la |una |el )?${IA} (?:lo |la |me lo |me la |se )?(?:hizo|escribio|redacto|genero|creo|armo|edito|produjo|diseno|monto)\\b`),
  /\bnadie lo (?:edito|hizo|escribio)\b/,
  /\btexto de ia\b/,
];
export function autoriaIA(texto) {
  const p = aplanar(texto);
  return RE_AUTORIA.some((r) => r.test(p));
}
export async function huella(texto) {
  const t = String(texto || "").normalize("NFC").trim();
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(t))).slice(0, 12);
}
// La aprobación cubre texto, red, fecha y archivo: si cualquiera cambia, deja de valer.
async function huellaAprobacion(p) {
  return huella(`${p.red}\n${p.fecha || ""}\n${p.media || ""}\n${String(p.texto || "").normalize("NFC").trim()}`);
}
const URL_RE = () => /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|mx|org|net|site|dev|io|gob\.mx|ai)(?:\/\S*)?/gi;
export function largoX(texto) {
  // Aproximación de x-viral: cada enlace cuenta 23 y cada emoji 2. El conteo final lo confirma x-viral.
  let total = 0;
  const sin = String(texto || "").normalize("NFC").replace(URL_RE(), () => { total += 23; return ""; });
  for (const ch of sin) {
    const o = ch.codePointAt(0);
    if (o === 0x200d || o === 0xfe0f || o === 0xfe0e || (o >= 0x1f3fb && o <= 0x1f3ff)) continue;
    total += o > 0x10ff && !(o >= 0x2000 && o <= 0x206f) ? 2 : 1;
  }
  return total;
}
export function parecido(a, b) {
  const A = aplanar(a), B = aplanar(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const va = new Set(A.split(" ")), vb = new Set(B.split(" "));
  let comun = 0;
  for (const w of va) if (vb.has(w)) comun++;
  return comun / (va.size + vb.size - comun);
}
const LIMITES = { x: 280, linkedin: 3000, instagram: 2200, tiktok: 4000 };
const REDES = ["x", "linkedin", "instagram", "tiktok"];
export function revisarTexto(texto, red, titulo = "") {
  const errores = [], avisos = [];
  const plano = ` ${aplanar(texto)} ${aplanar(titulo)} `;
  if (autoriaIA(texto) || autoriaIA(titulo)) errores.push("Dice o insinúa que la pieza la hizo una IA: ninguna pieza lo dice (regla de Emi).");
  if (/\b(castorena|indep)\b/.test(plano)) errores.push("Nombra al despacho o a un cliente: no va en la cuenta personal.");
  if (/(comenta|escribe|responde|pon) \S+ (y|para) (te|les) (mando|paso|envio|comparto)/.test(plano)) errores.push("Anzuelo de interacción («comenta X y te mando…»): las redes lo castigan.");
  const largo = red === "x" ? largoX(texto) : [...String(texto || "")].length;
  if (LIMITES[red] && largo > LIMITES[red]) errores.push(`Pasa de ${LIMITES[red]} caracteres (${largo}).`);
  if (!String(texto || "").trim()) errores.push("El texto está vacío.");
  if (red === "linkedin" && [...String(texto || "").split("\n")[0]].length > 140) avisos.push("La primera línea pasa de 140 caracteres: en LinkedIn se corta antes de «ver más».");
  return { errores, avisos, largo };
}
// LinkedIn interpreta su formato «little text»: estos caracteres se escapan para que salgan tal cual.
export const escaparLinkedIn = (t) => String(t).replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => "\\" + c);

// ---------------------------------------------------------------- sesión de Emi

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
// PBKDF2 a 100 000 vueltas (SHA-256): el máximo que admite Cloudflare Workers.
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
// La firma de la sesión incluye una «época»: cambiarla (Salir de todos lados) invalida todas las cookies.
async function llaveSesion(env) {
  const c = await leer(env, "clave", null);
  const epoca = await leer(env, "epoca", "0");
  return `${env.PANEL_CLAVE || c?.hash || ""}·${env.CIFRADO || ""}·${epoca}·redes`;
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
async function intentos(request, env, accion, grupo = "") {
  const ip = (request.headers.get("CF-Connecting-IP") || "local") + grupo;
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

// ---------------------------------------------------------------- almacenamiento (Durable Object; KV solo para migrar)

const memoria = new Map(); // pruebas locales sin Durable Object
async function leer(env, k, def) {
  if (env.ALMACEN) {
    let v = await env.ALMACEN.get(k);
    if (v === undefined && env.REDES) {
      const viejo = await env.REDES.get(k);
      if (viejo != null) { v = viejo; await env.ALMACEN.put(k, viejo); }
    }
    return v === undefined || v === null ? def : JSON.parse(v);
  }
  const v = memoria.get(k);
  return v === undefined ? def : JSON.parse(v);
}
async function guardar(env, k, v) {
  const s = JSON.stringify(v);
  if (env.ALMACEN) await env.ALMACEN.put(k, s); else memoria.set(k, s);
}
async function borrar(env, k) {
  if (env.ALMACEN) await env.ALMACEN.delete(k); else memoria.delete(k);
  if (env.REDES) await env.REDES.delete(k).catch(() => {});
}
export const _memoria = memoria;
async function bitacora(env, quien, que) {
  const b = await leer(env, "bitacora", []);
  b.unshift({ fecha: ahoraISO(), quien, que: String(que).slice(0, 300) });
  await guardar(env, "bitacora", b.slice(0, 300));
}
const nuevoId = () => hex(crypto.getRandomValues(new Uint8Array(6)));
const limpiar = (t, max = 4000) => String(t ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
const limpiarUrl = (u) => { const s = String(u || "").trim(); return /^https:\/\/[^\s"'<>]+$/.test(s) ? s.slice(0, 400) : ""; };

async function llaveCifrado(env) {
  if (!env.CIFRADO || env.CIFRADO.length < 32) throw new Error("Falta el secreto CIFRADO (32+ caracteres).");
  const d = await crypto.subtle.digest("SHA-256", enc.encode(env.CIFRADO));
  return crypto.subtle.importKey("raw", d, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function guardarSecreto(env, nombre, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llaveCifrado(env), enc.encode(JSON.stringify(obj)));
  await guardar(env, `cred:${nombre}`, { iv: b64(iv), c: b64(c), fecha: ahoraISO() });
}
async function leerSecreto(env, nombre) {
  const s = await leer(env, `cred:${nombre}`, null);
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
const topeX = (env) => { const t = Number(env.TOPE_X_USD ?? 10); return Number.isFinite(t) && t >= 0 ? t : 0; }; // si no es número, tope 0
async function gastoX(env, usd, que) {
  const mes = new Date().toISOString().slice(0, 7);
  const g = await leer(env, `gasto:x:${mes}`, { usd: 0, llamadas: [] });
  const tope = topeX(env);
  if (g.usd + usd > tope + 1e-9) throw new Error(`Se llegaría al tope de ${tope} USD de este mes en la API de X. No se hizo la llamada.`);
  g.usd = Math.round((g.usd + usd) * 1000) / 1000;
  g.llamadas.unshift({ fecha: ahoraISO(), usd, que });
  g.llamadas = g.llamadas.slice(0, 200);
  await guardar(env, `gasto:x:${mes}`, g);
}
// OAuth 2.0 con PKCE (lo que da la consola nueva de X): token de acceso de ~2 h y de actualización que rota.
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
// Pide un token a X. Primero como app confidencial («Web App»: Basic con Client ID y Secret); si X responde 401,
// lo intenta como app pública («Native App»: sin secreto, solo client_id y PKCE). Devuelve {r, t, modo}.
async function pedirTokenX(app, params, fetcher) {
  const cuerpo = new URLSearchParams({ ...params, client_id: app.client_id }).toString();
  const basica = btoa(`${app.client_id}:${app.client_secret}`);
  let r = await fetcher(X_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + basica }, body: cuerpo });
  let t = await r.json().catch(() => ({}));
  if (r.status === 401) {
    const r2 = await fetcher(X_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpo });
    const t2 = await r2.json().catch(() => ({}));
    if (r2.ok && t2.access_token) return { r: r2, t: t2, modo: "pública" };
    t = { ...t, error_description: `${t.error_description || t.error || ""} · como app pública: ${t2.error_description || t2.error || r2.status}` };
  }
  return { r, t, modo: "confidencial" };
}
async function tokenX2(env, fetcher) {
  const t = await leerSecreto(env, "x2");
  if (!t) return null;
  if (t.vence && Date.parse(t.vence) > Date.now() + 120e3) return t.access_token;
  const app = await leerSecreto(env, "x_app");
  if (!app || !t.refresh_token) throw new Error("X necesita reconectarse: Ajustes → Conectar X.");
  const { r, t: n } = await pedirTokenX(app, { grant_type: "refresh_token", refresh_token: t.refresh_token }, fetcher);
  if (!r.ok || !n.access_token) {
    await borrar(env, "cred:x2"); // falla cerrado: hay que reconectar
    throw new Error(`X no renovó el permiso (${r.status}): reconecta X en Ajustes.`);
  }
  await guardarSecreto(env, "x2", { access_token: n.access_token, refresh_token: n.refresh_token || t.refresh_token, vence: new Date(Date.now() + (Number(n.expires_in) || 7200) * 1000).toISOString() });
  return n.access_token;
}
async function autorizacionX(env, metodo, url, fetcher) {
  const cred = await leerSecreto(env, "x");
  if (cred) return firmaOAuth1(metodo, url, cred);
  const tok = await tokenX2(env, fetcher);
  if (tok) return `Bearer ${tok}`;
  throw new Error("X no está conectado: Ajustes → Conectar X (o pega las llaves de OAuth 1.0a).");
}
async function publicarX(env, pieza, fetcher = fetch) {
  const url = "https://api.x.com/2/tweets";
  const auth = await autorizacionX(env, "POST", url, fetcher);
  await gastoX(env, URL_RE().test(pieza.texto) ? COSTO_X.post_con_enlace : COSTO_X.post, `post ${pieza.id}`);
  const r = await fetcher(url, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ text: pieza.texto }) });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || !cuerpo?.data?.id) throw new Error(`X respondió ${r.status}: ${JSON.stringify(cuerpo).slice(0, 300)}`);
  return { id: cuerpo.data.id, url: `https://x.com/i/web/status/${cuerpo.data.id}` };
}
async function metricasX(env, id, fetcher = fetch) {
  const url = `https://api.x.com/2/tweets/${encodeURIComponent(id)}?tweet.fields=public_metrics,non_public_metrics,created_at`;
  const auth = await autorizacionX(env, "GET", url, fetcher);
  await gastoX(env, COSTO_X.lectura, `métricas ${id}`);
  const r = await fetcher(url, { headers: { Authorization: auth } });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`X respondió ${r.status}: ${JSON.stringify(c).slice(0, 300)}`);
  return { ...(c.data?.public_metrics || {}), ...(c.data?.non_public_metrics || {}) };
}
const b64url = (buf) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function xVolver(request, env, url, fetcher = fetch) {
  // Igual que LinkedIn: lo protege el «state» de un solo uso, creado por Emi con sesión.
  const volver = async (msg) => { await bitacora(env, "panel", msg === "ok" ? "X: regreso correcto" : `X: ${msg}`); return Response.redirect(`${url.origin}/#ajustes?x=${encodeURIComponent(msg)}`, 302); };
  const estado = url.searchParams.get("state") || "";
  const g = /^[0-9a-f]{48}$/.test(estado) ? await leer(env, `x_estado:${estado}`, null) : null;
  if (g) await borrar(env, `x_estado:${estado}`);
  if (!g || g.vence < Date.now()) return volver("La conexión venció; inténtalo otra vez desde Ajustes.");
  if (url.searchParams.get("error")) return volver(`X no autorizó: ${url.searchParams.get("error")}`);
  const app = await leerSecreto(env, "x_app");
  if (!app) return volver("Falta la app de X.");
  const { r, t, modo } = await pedirTokenX(app, { grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: `${url.origin}/api/x/volver`, code_verifier: g.verificador }, fetcher);
  if (!t.access_token) return volver(`X no entregó el permiso (${r.status}: ${String(t.error_description || t.error || "").slice(0, 120)}).`);
  await guardarSecreto(env, "x2", { access_token: t.access_token, refresh_token: t.refresh_token || "", vence: new Date(Date.now() + (Number(t.expires_in) || 7200) * 1000).toISOString() });
  await bitacora(env, "Emi", `Conectó X (OAuth 2.0, app ${modo})`);
  return volver("ok");
}
export { xVolver, guardarSecreto, leerSecreto };

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
      author: t.persona, commentary: escaparLinkedIn(pieza.texto), visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    }),
  });
  if (r.status !== 201) throw new Error(`LinkedIn respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const urn = r.headers.get("x-restli-id") || "";
  return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : "" };
}

// ---------------------------------------------------------------- piezas

const PUBLICADORES = { x: publicarX, linkedin: publicarLinkedIn };
const FINALES = ["publicando", "publicada"];
const MAX_PIEZAS_CLAUDE_ABIERTAS = 200;
async function piezas(env) { return leer(env, "piezas", []); }
async function guardarPiezas(env, lista) {
  // Nunca se recortan piezas de Emi ni piezas activas; solo las más viejas ya cerradas.
  if (lista.length > 1000) {
    const cerradas = (p) => ["publicada", "cancelada"].includes(p.estado);
    let sobran = lista.length - 1000;
    for (let i = lista.length - 1; i >= 0 && sobran > 0; i--) if (cerradas(lista[i])) { lista.splice(i, 1); sobran--; }
  }
  await guardar(env, "piezas", lista);
}

async function editarPieza(env, datos, quien) {
  const red = String(datos.red || "");
  if (!REDES.includes(red)) throw new Error("Red inválida.");
  const texto = limpiar(datos.texto, 5000);
  const fecha = datos.fecha ? new Date(datos.fecha) : null;
  if (fecha && Number.isNaN(fecha.getTime())) throw new Error("Fecha inválida.");
  const lista = await piezas(env);
  let p = datos.id ? lista.find((x) => x.id === datos.id) : null;
  if (datos.id && !p) throw new Error("No existe esa pieza.");
  if (p && FINALES.includes(p.estado)) throw new Error("Ya se publicó o se está publicando: no se edita.");
  if (quien === "claude") {
    if (p && p.creada_por !== "claude") throw new Error("Claude solo edita borradores que dejó Claude.");
    if (p && !["borrador", "lista para aprobar"].includes(p.estado)) throw new Error("Claude no edita piezas que Emi ya aprobó o cerró.");
    if (!p && lista.filter((x) => x.creada_por === "claude" && ["borrador", "lista para aprobar"].includes(x.estado)).length >= MAX_PIEZAS_CLAUDE_ABIERTAS)
      throw new Error("Hay demasiados borradores de Claude sin revisar.");
  }
  const nueva = !p;
  if (!p) { p = { id: nuevoId(), creada: ahoraISO(), creada_por: quien, historial: [] }; lista.unshift(p); }
  const antes = { red: p.red, texto: p.texto, fecha: p.fecha || null, media: p.media || "" };
  Object.assign(p, {
    red, texto, titulo: limpiar(datos.titulo ?? p.titulo ?? "", 120), idea: limpiar(datos.idea ?? p.idea ?? "", 80),
    media: datos.media !== undefined ? limpiarUrl(datos.media) : p.media || "", nota: limpiar(datos.nota ?? p.nota ?? "", 600),
    // Lleva video u otro archivo que la API del panel aún no sube: se publica desde la app.
    solo_app: datos.solo_app !== undefined ? !!datos.solo_app : !!p.solo_app,
    fecha: fecha ? fecha.toISOString() : datos.fecha === "" || datos.fecha === null ? null : p.fecha || null, actualizada: ahoraISO(),
  });
  const cambio = nueva || antes.red !== p.red || antes.texto !== p.texto || antes.fecha !== p.fecha || antes.media !== p.media;
  if (cambio) {
    // Si cambia el texto, la red, la fecha o el archivo, la aprobación anterior deja de valer.
    delete p.aprobado; delete p.aprobado_huella; delete p.error;
    p.estado = quien === "claude" || datos.estado === "lista para aprobar" ? "lista para aprobar" : "borrador";
  }
  p.historial.unshift({ fecha: ahoraISO(), quien, que: nueva ? "creada" : cambio ? "editada (la aprobación se reinicia)" : "datos editados" });
  p.historial = p.historial.slice(0, 50);
  p.revision = revisarTexto(texto, red, p.titulo);
  await guardarPiezas(env, lista);
  await bitacora(env, quien, `${nueva ? "Pieza nueva" : "Pieza editada"} (${red}): ${p.titulo || texto.slice(0, 60)}`);
  return p;
}

async function aprobar(env, id, cuerpo = {}) {
  const lista = await piezas(env);
  const p = lista.find((x) => x.id === id);
  if (!p) throw new Error("No existe esa pieza.");
  if (FINALES.includes(p.estado)) throw new Error("Ya se publicó o se está publicando: no se vuelve a aprobar.");
  if (p.estado === "fallo" && !cuerpo.confirmo_que_no_salio)
    throw new Error("Esta pieza falló al publicarse. Antes de aprobarla otra vez, revisa en la red que no haya salido.");
  const rev = revisarTexto(p.texto, p.red, p.titulo);
  if (rev.errores.length) throw new Error("No se puede aprobar: " + rev.errores.join(" "));
  const otra = lista.find((x) => x.id !== p.id && x.red !== p.red && x.estado !== "cancelada" && parecido(x.texto, p.texto) >= 0.85);
  if (otra) throw new Error(`Es casi el mismo texto que una pieza de ${otra.red}: cada red lleva su propia adaptación.`);
  // Sin fecha: la Matriz pone la hora (lo pidió Emi el 13/11: «cuando apruebe algo, tú escojas hora»).
  const fechaOriginal = p.fecha || null;
  let asignada = null;
  if (!p.fecha) {
    const sug = p.hora_sugerida && Date.parse(p.hora_sugerida) > Date.now() + 10 * 60e3 ? p.hora_sugerida : sugerirHora(p.red, lista, Date.now(), p.id);
    if (sug) asignada = sug;
  }
  const h = await huellaAprobacion({ ...p, fecha: asignada || p.fecha });
  // Se vuelve a leer y se escribe solo si la pieza no cambió mientras tanto.
  const q = await actualizarPieza(env, id, (x) => {
    if (FINALES.includes(x.estado) || x.texto !== p.texto || x.red !== p.red || (x.fecha || null) !== fechaOriginal || (x.media || "") !== (p.media || ""))
      throw new Error("La pieza cambió mientras la aprobabas: revísala otra vez.");
    if (asignada) { x.fecha = asignada; x.hora_asignada_por = "Matriz"; }
    x.aprobado = { fecha: ahoraISO(), medio: "panel", por: "Emi" };
    x.aprobado_huella = h;
    const futura = x.fecha && Date.parse(x.fecha) > Date.now() + 60e3;
    x.estado = futura && PUBLICADORES[x.red] && !x.solo_app ? "programada" : "aprobada";
    delete x.error;
    x.historial.unshift({ fecha: ahoraISO(), quien: "Emi", que: `aprobada (${h})` });
  });
  await bitacora(env, "Emi", `Aprobó ${q.red}: ${q.titulo || q.texto.slice(0, 60)}`);
  return q;
}

// Hora sugerida: la que dejó la Matriz (si sigue en el futuro) o el siguiente hueco libre según la red.
// Horas base de crecimiento/redes.json (hipótesis que se ajustan con métricas); hora del centro de México (UTC−6, sin horario de verano).
const HORA_BASE = { x: [9, 0], linkedin: [8, 30], instagram: [19, 0], tiktok: [19, 30] };
const CADENCIA = { x: { dia: 2, sep: 4 }, linkedin: { dia: 1, sep: 24 }, instagram: { dia: 1, sep: 0 }, tiktok: { dia: 1, sep: 0 } };
const MX = -6 * 3600e3;
export function sugerirHora(red, lista, ahora = Date.now(), excluir = null) {
  const [h, m] = HORA_BASE[red] || [10, 0];
  const cad = CADENCIA[red] || { dia: 1, sep: 0 };
  const ocupadas = lista.filter((x) => x.id !== excluir && x.red === red && x.fecha && !["cancelada", "fallo"].includes(x.estado)).map((x) => Date.parse(x.fecha));
  const diaMX = (t) => new Date(t + MX).toISOString().slice(0, 10);
  const hoy = new Date(ahora + MX);
  for (let d = 0; d < 60; d++) {
    const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + d, h, m) - MX;
    if (base < ahora + 60 * 60e3) continue; // al menos una hora para revisarla
    const mismoDia = ocupadas.filter((t) => diaMX(t) === diaMX(base)).length;
    if (mismoDia >= cad.dia) continue;
    if (ocupadas.some((t) => Math.abs(t - base) < Math.max(cad.sep, 1) * 3600e3)) continue;
    return new Date(base).toISOString();
  }
  return null;
}

async function actualizarPieza(env, id, cambio) {
  const lista = await piezas(env);
  const p = lista.find((x) => x.id === id);
  if (!p) return null;
  cambio(p);
  await guardarPiezas(env, lista);
  return p;
}

export async function publicar(env, id, fetcher = fetch) {
  let p = (await piezas(env)).find((x) => x.id === id);
  if (!p) throw new Error("No existe esa pieza.");
  if (!PUBLICADORES[p.red]) throw new Error(`${p.red} todavía no publica por API: copia el texto y publícalo desde la app.`);
  if (p.solo_app) throw new Error("Esta pieza lleva video o archivo: cópiala y publícala desde la app.");
  if (p.pausada) throw new Error("Esta pieza está en pausa: reanúdala para que salga.");
  if (!["aprobada", "programada"].includes(p.estado)) throw new Error("Solo se publica lo aprobado.");
  const esperada = await huellaAprobacion(p);
  if (p.aprobado_huella !== esperada) throw new Error("La pieza cambió después de aprobarse: vuelve a aprobarla.");
  const rev = revisarTexto(p.texto, p.red, p.titulo);
  if (rev.errores.length) throw new Error(rev.errores.join(" "));
  // Candado: dentro del Durable Object, leer y escribir aquí no se intercala con otra petición.
  let tomado = false;
  p = await actualizarPieza(env, id, (x) => {
    if (["aprobada", "programada"].includes(x.estado) && x.aprobado_huella === esperada) {
      x.estado = "publicando"; x.publicando_desde = ahoraISO(); tomado = true;
    }
  });
  if (!tomado) throw new Error("Otra publicación de esta pieza ya está en curso o cambió.");
  let resultado, error;
  try { resultado = await PUBLICADORES[p.red](env, p, fetcher); } catch (e) { error = String(e.message || e).slice(0, 400); }
  return actualizarPieza(env, id, (x) => {
    if (resultado) {
      x.estado = "publicada"; x.publicada = { fecha: ahoraISO(), ...resultado };
      x.historial.unshift({ fecha: ahoraISO(), quien: "panel", que: `publicada: ${resultado.url || resultado.id}` });
    } else {
      x.estado = "fallo"; x.error = error;
      x.historial.unshift({ fecha: ahoraISO(), quien: "panel", que: `falló: ${error}` });
    }
    delete x.publicando_desde;
  }).then(async (x) => { await bitacora(env, "panel", resultado ? `Publicado en ${x.red}: ${resultado.url || resultado.id}` : `Falló ${x.red}: ${error}`); return x; });
}

// ---------------------------------------------------------------- API

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...SEGURIDAD, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });

async function claudeValido(request, env) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer (\S{32,200})$/);
  return !!(env.CLAUDE_LLAVE && env.CLAUDE_LLAVE.length >= 32 && m && (await iguales(m[1], env.CLAUDE_LLAVE)));
}

export async function api(request, env, url) {
  const ruta = url.pathname.replace(/\/+$/, "");
  const metodo = request.method;
  const configurado = !!((await claveGuardada(env)) && env.CIFRADO);

  if (ruta === "/api/linkedin/volver" && metodo === "GET") return linkedinVolver(request, env, url);
  if (ruta === "/api/x/volver" && metodo === "GET") return xVolver(request, env, url);

  let cuerpo = {};
  if (metodo === "POST") {
    const esClaude = ruta.startsWith("/api/claude/");
    if (!esClaude && request.headers.get("Origin") !== url.origin) return json({ error: "Origen no permitido." }, 403);
    if ((request.headers.get("Content-Type") || "").split(";")[0] !== "application/json") return json({ error: "Se esperaba JSON." }, 415);
    try { cuerpo = await request.json(); } catch { return json({ error: "JSON inválido." }, 400); }
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return json({ error: "JSON inválido." }, 400);
  }

  // --- Claude: puede leer y dejar borradores, notas, enlaces y respuestas; nunca aprueba ni publica.
  if (ruta.startsWith("/api/claude/")) {
    if (!(await intentos(request, env, "estado", "·claude"))) return json({ error: "Demasiados intentos." }, 429);
    if (!(await claudeValido(request, env))) { await intentos(request, env, "fallo", "·claude"); return json({ error: "Llave inválida." }, 401); }
    try {
      if (ruta === "/api/claude/estado" && metodo === "GET")
        return json({ piezas: await piezas(env), notas: await leer(env, "notas", []), encargos: await leer(env, "encargos", []), enlaces: await leer(env, "enlaces", []), inspiracion: await leer(env, "inspiracion", []), bitacora: (await leer(env, "bitacora", [])).slice(0, 50),
          conexiones: Object.fromEntries(await Promise.all(["x", "x2", "x_app", "linkedin", "linkedin_app"].map(async (n) => [n, !!(await leer(env, `cred:${n}`, null))]))) });
      if (ruta === "/api/claude/pieza" && metodo === "POST") return json(await editarPieza(env, cuerpo, "claude"));
      if (ruta === "/api/claude/nota" && metodo === "POST") return json(await agregarNota(env, cuerpo, "claude"));
      const mc = ruta.match(/^\/api\/claude\/pieza\/([a-f0-9]{12})\/(comentario|sugerencia)$/);
      if (mc && metodo === "POST") {
        if (mc[2] === "comentario") return json(await comentar(env, mc[1], cuerpo, "Matriz"));
        // Sugerencia: hora (y por qué). No toca texto, red, fecha ni archivo, así que no cambia la aprobación.
        const hs = cuerpo.hora ? new Date(cuerpo.hora) : null;
        if (hs && Number.isNaN(hs.getTime())) throw new Error("Hora inválida.");
        const p = await actualizarPieza(env, mc[1], (x) => {
          if (FINALES.includes(x.estado)) throw new Error("Ya se publicó.");
          if (hs) x.hora_sugerida = hs.toISOString();
          if (cuerpo.motivo !== undefined) x.hora_motivo = limpiar(cuerpo.motivo, 300);
        });
        return p ? json(p) : json({ error: "No existe esa pieza." }, 404);
      }
      const mi = ruta.match(/^\/api\/claude\/inspiracion\/([a-f0-9]{12})$/);
      if (mi && metodo === "POST") return json(await analizarInspiracion(env, mi[1], cuerpo));
      const me2 = ruta.match(/^\/api\/claude\/(nota|inspiracion)\/([a-f0-9]{12})\/espacio$/);
      if (me2 && metodo === "POST") return json(await proponerEspacio(env, me2[1], me2[2], cuerpo, "Matriz"));
      if (ruta === "/api/claude/enlace" && metodo === "POST") return json(await agregarEnlace(env, cuerpo, "claude"));
      const me = ruta.match(/^\/api\/claude\/encargo\/([a-f0-9]{12})$/);
      if (me && metodo === "POST") return json(await cambiarEncargo(env, me[1], cuerpo, "claude"));
    } catch (e) { return json({ error: String(e.message || e) }, 400); }
    return json({ error: "No encontrado." }, 404);
  }

  // --- sesión
  if (ruta === "/api/sesion" && metodo === "GET") return json({ editor: await sesionValida(request, env), configurado });
  if (ruta === "/api/alta" && metodo === "POST") {
    if ((await claveGuardada(env)) || (await leer(env, "alta_usada", false))) return json({ error: "La contraseña ya existe. Este enlace ya no sirve." }, 409);
    if (!env.ALTA || !(await intentos(request, env, "estado"))) return json({ error: "Enlace inválido." }, 403);
    if (!(await iguales(String(cuerpo.alta ?? ""), env.ALTA))) { await intentos(request, env, "fallo"); return json({ error: "Enlace inválido." }, 403); }
    const clave = String(cuerpo.clave ?? "");
    if ([...clave].length < 10) return json({ error: "Usa al menos 10 caracteres." }, 400);
    const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await pbkdf2(clave, sal);
    // Comprobar y escribir sin nada en medio: dentro del Durable Object no se intercala otra petición.
    if ((await claveGuardada(env)) || (await leer(env, "alta_usada", false))) return json({ error: "La contraseña ya existe. Este enlace ya no sirve." }, 409);
    await guardar(env, "clave", { sal, hash, fecha: ahoraISO() });
    await guardar(env, "alta_usada", true);
    await bitacora(env, "Emi", "Creó la contraseña del panel");
    return json({ editor: true }, 200, { "Set-Cookie": cookie(await crearSesion(env), DIAS * 86400) });
  }
  if (ruta === "/api/entrar" && metodo === "POST") {
    if (!configurado) return json({ error: "El panel aún no tiene contraseña: usa tu enlace de alta." }, 503);
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
    if (ruta === "/api/salir-todo" && metodo === "POST") {
      await guardar(env, "epoca", String(Date.now()));
      return json({ editor: false }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (ruta === "/api/estado" && metodo === "GET") {
      const mes = new Date().toISOString().slice(0, 7);
      return json({
        piezas: await piezas(env), notas: await leer(env, "notas", []), encargos: await leer(env, "encargos", []),
        enlaces: await leer(env, "enlaces", []), inspiracion: await leer(env, "inspiracion", []), bitacora: (await leer(env, "bitacora", [])).slice(0, 80),
        gasto_x: await leer(env, `gasto:x:${mes}`, { usd: 0, llamadas: [] }), tope_x: topeX(env),
        conexiones: { x: !!((await leer(env, "cred:x", null)) || (await leer(env, "cred:x2", null))), x_app: !!(await leer(env, "cred:x_app", null)), linkedin: !!(await leer(env, "cred:linkedin", null)), linkedin_app: !!(await leer(env, "cred:linkedin_app", null)) },
      });
    }
    if (ruta === "/api/pieza" && metodo === "POST") return json(await editarPieza(env, cuerpo, "Emi"));
    const mp = ruta.match(/^\/api\/pieza\/([a-f0-9]{12})\/(aprobar|publicar|cancelar|metricas|resolver)$/);
    if (mp && metodo === "POST") {
      const [, id, accion] = mp;
      if (accion === "aprobar") return json(await aprobar(env, id, cuerpo));
      if (accion === "publicar") return json(await publicar(env, id));
      if (accion === "cancelar") {
        const p = await actualizarPieza(env, id, (x) => {
          if (FINALES.includes(x.estado)) throw new Error("Ya se publicó o se está publicando.");
          x.estado = "cancelada"; x.historial.unshift({ fecha: ahoraISO(), quien: "Emi", que: "cancelada" });
        });
        return p ? json(p) : json({ error: "No existe esa pieza." }, 404);
      }
      if (accion === "resolver") {
        // Una pieza atorada en «publicando» (el servidor se cortó a la mitad): Emi revisa en la red y dice qué pasó.
        const p = await actualizarPieza(env, id, (x) => {
          const manual = x.estado === "aprobada" && (x.solo_app || !PUBLICADORES[x.red]);
          if (x.estado !== "publicando" && !manual) throw new Error("Esa pieza no está atorada ni se publica desde la app.");
          if (!manual && Date.now() - Date.parse(x.publicando_desde || 0) < 10 * 60e3) throw new Error("Espera 10 minutos antes de resolverla.");
          if (manual && !cuerpo.salio) throw new Error("Usa «Ya la publiqué» cuando la subas desde la app.");
          if (cuerpo.salio) { x.estado = "publicada"; x.publicada = { fecha: ahoraISO(), url: limpiarUrl(cuerpo.url), id: "" }; }
          else { x.estado = "fallo"; x.error = "Se cortó a la mitad; Emi confirmó que no salió."; }
          delete x.publicando_desde;
          x.historial.unshift({ fecha: ahoraISO(), quien: "Emi", que: cuerpo.salio ? "confirmó que sí salió" : "confirmó que no salió" });
        });
        return p ? json(p) : json({ error: "No existe esa pieza." }, 404);
      }
      if (accion === "metricas") {
        const p = (await piezas(env)).find((x) => x.id === id);
        if (!p) return json({ error: "No existe esa pieza." }, 404);
        if (p.red !== "x" || !p.publicada?.id) return json({ error: "Solo hay métricas automáticas de posts publicados en X; las demás se anotan." }, 400);
        const valores = await metricasX(env, p.publicada.id);
        return json(await actualizarPieza(env, id, (x) => { x.metricas = { fecha: ahoraISO(), fuente: "API de X", valores }; }));
      }
    }
    if (ruta === "/api/pieza/captura" && metodo === "POST") {
      const valores = {};
      for (const [k, v] of Object.entries(cuerpo.valores || {})) if (/^[a-z_]{2,40}$/.test(k) && Number.isFinite(+v)) valores[k] = +v;
      const p = await actualizarPieza(env, String(cuerpo.id || ""), (x) => { x.metricas = { fecha: ahoraISO(), fuente: "anotado por Emi", valores }; });
      return p ? json(p) : json({ error: "No existe esa pieza." }, 404);
    }
    if (ruta === "/api/nota" && metodo === "POST") return json(await agregarNota(env, cuerpo, "Emi"));
    if (ruta === "/api/inspiracion" && metodo === "POST") return json(await agregarInspiracion(env, cuerpo));
    const mesp = ruta.match(/^\/api\/(nota|inspiracion)\/([a-f0-9]{12})\/espacio$/);
    if (mesp && metodo === "POST") return json(await proponerEspacio(env, mesp[1], mesp[2], cuerpo, "Emi"));
    const mpc = ruta.match(/^\/api\/pieza\/([a-f0-9]{12})\/(comentario|pausa)$/);
    if (mpc && metodo === "POST") {
      if (mpc[2] === "comentario") return json(await comentar(env, mpc[1], cuerpo, "Emi"));
      const p = await actualizarPieza(env, mpc[1], (x) => {
        if (FINALES.includes(x.estado)) throw new Error("Ya se publicó.");
        x.pausada = !!cuerpo.pausada;
        x.historial.unshift({ fecha: ahoraISO(), quien: "Emi", que: x.pausada ? "en pausa" : "reanudada" });
      });
      return p ? json(p) : json({ error: "No existe esa pieza." }, 404);
    }
    if (ruta === "/api/enlace" && metodo === "POST") return json(await agregarEnlace(env, cuerpo, "Emi"));
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
        if (c[k].length < 10 || c[k].length > 200 || /\s/.test(c[k])) {
          await bitacora(env, "panel", `No se guardaron las llaves de X 1.0a: revisa «${k}» (${c[k].length} caracteres${/\s/.test(c[k]) ? ", con espacios" : ""})`);
          return json({ error: `Revisa «${k}»: debe ir completo y sin espacios.` }, 400);
        }
      }
      await guardarSecreto(env, "x", c);
      await bitacora(env, "Emi", "Guardó las llaves de X");
      return json({ ok: true });
    }
    if (ruta === "/api/llaves/x-app" && metodo === "POST") {
      const c = { client_id: String(cuerpo.client_id || "").trim(), client_secret: String(cuerpo.client_secret || "").trim() };
      if (c.client_id.length < 6 || c.client_secret.length < 6 || /\s/.test(c.client_id + c.client_secret)) return json({ error: "Revisa el Client ID y el Client Secret de X." }, 400);
      await guardarSecreto(env, "x_app", c);
      await bitacora(env, "Emi", "Guardó la app de X (OAuth 2.0)");
      return json({ ok: true });
    }
    if (ruta === "/api/x/conectar" && metodo === "POST") {
      const app = await leerSecreto(env, "x_app");
      if (!app) return json({ error: "Primero guarda el Client ID y el Client Secret de tu app de X." }, 400);
      const estado = hex(crypto.getRandomValues(new Uint8Array(24)));
      const verificador = b64url(crypto.getRandomValues(new Uint8Array(48)));
      const reto = b64url(await crypto.subtle.digest("SHA-256", enc.encode(verificador)));
      await guardar(env, `x_estado:${estado}`, { verificador, vence: Date.now() + 600e3 });
      await bitacora(env, "Emi", "Inició la conexión con X (va a x.com para autorizar)");
      const u = new URL("https://x.com/i/oauth2/authorize");
      u.search = new URLSearchParams({ response_type: "code", client_id: app.client_id, redirect_uri: `${url.origin}/api/x/volver`, scope: "tweet.read tweet.write users.read offline.access", state: estado, code_challenge: reto, code_challenge_method: "S256" });
      return json({ url: u.toString() });
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
      const estado = hex(crypto.getRandomValues(new Uint8Array(24)));
      // El «state» solo lo crea Emi con sesión; es de un solo uso y vence en 10 minutos.
      await guardar(env, `linkedin_estado:${estado}`, { vence: Date.now() + 600e3 });
      await bitacora(env, "Emi", "Inició la conexión con LinkedIn");
      const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
      u.search = new URLSearchParams({ response_type: "code", client_id: app.client_id, redirect_uri: `${url.origin}/api/linkedin/volver`, state: estado, scope: "openid profile w_member_social" });
      return json({ url: u.toString() });
    }
    if (ruta === "/api/llaves/borrar" && metodo === "POST") {
      const n = String(cuerpo.nombre || "");
      if (!["x", "x2", "x_app", "linkedin", "linkedin_app"].includes(n)) return json({ error: "Nombre inválido." }, 400);
      await borrar(env, `cred:${n}`);
      await bitacora(env, "Emi", `Borró las credenciales de ${n}`);
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: String(e.message || e) }, 400);
  }
  return json({ error: "No encontrado." }, 404);
}

const ESPACIOS = ["personal", "milla", "castorena", "pan"];
async function comentar(env, id, cuerpo, quien) {
  const texto = limpiar(cuerpo.texto, 1500);
  if (!texto.trim()) throw new Error("Escribe la nota.");
  const p = await actualizarPieza(env, id, (x) => {
    x.comentarios = [...(x.comentarios || []), { fecha: ahoraISO(), quien, texto }].slice(-60);
  });
  if (!p) throw new Error("No existe esa pieza.");
  await bitacora(env, quien, `Nota en «${p.titulo || p.red}»: ${texto.slice(0, 80)}`);
  return p;
}
const plataformaDe = (u) => {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    return [["pinterest", "Pinterest"], ["pin.it", "Pinterest"], ["tiktok", "TikTok"], ["instagram", "Instagram"], ["youtu", "YouTube"], ["x.com", "X"], ["twitter", "X"], ["linkedin", "LinkedIn"], ["vimeo", "Vimeo"]].find(([k]) => h.includes(k))?.[1] || h;
  } catch { return ""; }
};
async function agregarInspiracion(env, cuerpo) {
  const url = limpiarUrl(cuerpo.url);
  if (!url) throw new Error("Pega un enlace https.");
  const l = await leer(env, "inspiracion", []);
  const e = { id: nuevoId(), fecha: ahoraISO(), url, plataforma: plataformaDe(url), que_me_llamo: limpiar(cuerpo.que_me_llamo, 1000),
    espacio: ESPACIOS.includes(cuerpo.espacio) ? cuerpo.espacio : null, espacio_propuesto: null, red: limpiar(cuerpo.red || "", 20), estado: "por analizar", analisis: null };
  l.unshift(e); await guardar(env, "inspiracion", l.slice(0, 500));
  await bitacora(env, "Emi", `Inspiración (${e.plataforma}): ${e.que_me_llamo.slice(0, 60) || url}`);
  return e;
}
async function analizarInspiracion(env, id, cuerpo) {
  const l = await leer(env, "inspiracion", []);
  const e = l.find((x) => x.id === id);
  if (!e) throw new Error("No existe esa inspiración.");
  const campos = ["estilo", "redaccion", "edicion", "gancho", "formato", "musica", "ritmo", "que_tomar", "para_que_red", "evitar"];
  e.analisis = Object.fromEntries(campos.filter((k) => cuerpo[k]).map((k) => [k, limpiar(cuerpo[k], 800)]));
  e.analisis.fecha = ahoraISO();
  e.estado = "analizada";
  if (ESPACIOS.includes(cuerpo.espacio_propuesto) && !e.espacio) e.espacio_propuesto = cuerpo.espacio_propuesto;
  await guardar(env, "inspiracion", l);
  return e;
}
// La Matriz propone el espacio; Emi lo confirma o lo cambia. Lo de Emi manda.
async function proponerEspacio(env, tipo, id, cuerpo, quien) {
  const clave = tipo === "nota" ? "notas" : "inspiracion";
  const l = await leer(env, clave, []);
  const e = l.find((x) => x.id === id);
  if (!e) throw new Error("No existe.");
  const esp = String(cuerpo.espacio || "");
  if (!ESPACIOS.includes(esp)) throw new Error("Espacio inválido.");
  if (quien === "Emi") { e.espacio = esp; e.espacio_propuesto = null; }
  else if (!e.espacio) e.espacio_propuesto = esp;
  await guardar(env, clave, l);
  return e;
}

async function agregarNota(env, cuerpo, quien) {
  const n = await leer(env, "notas", []);
  const nota = { id: nuevoId(), fecha: ahoraISO(), quien, red: limpiar(cuerpo.red || "todas", 20), tipo: limpiar(cuerpo.tipo || "idea", 20), texto: limpiar(cuerpo.texto, 2000),
    espacio: quien === "Emi" && ESPACIOS.includes(cuerpo.espacio) ? cuerpo.espacio : null, espacio_propuesto: quien !== "Emi" && ESPACIOS.includes(cuerpo.espacio) ? cuerpo.espacio : null };
  if (!nota.texto.trim()) throw new Error("Escribe la nota.");
  n.unshift(nota); await guardar(env, "notas", n.slice(0, 1000));
  await bitacora(env, quien, `Nota (${nota.tipo}, ${nota.red}): ${nota.texto.slice(0, 80)}`);
  return nota;
}
// Enlaces privados (carpetas de Drive, etc.): solo se ven con sesión; no van al repositorio público.
async function agregarEnlace(env, cuerpo, quien) {
  const l = await leer(env, "enlaces", []);
  const e = { id: nuevoId(), fecha: ahoraISO(), quien, nombre: limpiar(cuerpo.nombre, 120), url: limpiarUrl(cuerpo.url), grupo: limpiar(cuerpo.grupo || "Drive", 40) };
  if (!e.nombre.trim() || !e.url) throw new Error("Escribe el nombre y un enlace https.");
  const i = l.findIndex((x) => x.url === e.url);
  if (i >= 0) l[i] = { ...l[i], nombre: e.nombre, grupo: e.grupo }; else l.unshift(e);
  await guardar(env, "enlaces", l.slice(0, 200));
  return e;
}
async function cambiarEncargo(env, id, cuerpo, quien) {
  const e = await leer(env, "encargos", []);
  const x = e.find((y) => y.id === id);
  if (!x) throw new Error("No existe ese encargo.");
  if (cuerpo.respuesta) x.respuestas.push({ fecha: ahoraISO(), quien, texto: limpiar(cuerpo.respuesta, 3000) });
  x.respuestas = x.respuestas.slice(-30);
  if (["pendiente", "en curso", "hecho", "descartado"].includes(cuerpo.estado)) x.estado = cuerpo.estado;
  await guardar(env, "encargos", e);
  return x;
}

async function linkedinVolver(request, env, url) {
  // El regreso viene de linkedin.com: el navegador no manda la cookie (SameSite=Strict). Lo protege el «state»,
  // que solo Emi pudo crear con sesión, es de un solo uso y vence en 10 minutos.
  const volver = async (msg) => { await bitacora(env, "panel", msg === "ok" ? "LinkedIn: regreso correcto" : `LinkedIn: ${msg}`); return Response.redirect(`${url.origin}/#ajustes?linkedin=${encodeURIComponent(msg)}`, 302); };
  const estado = url.searchParams.get("state") || "";
  const guardado = /^[0-9a-f]{48}$/.test(estado) ? await leer(env, `linkedin_estado:${estado}`, null) : null;
  if (guardado) await borrar(env, `linkedin_estado:${estado}`);
  if (!guardado || guardado.vence < Date.now()) return volver("La conexión venció; inténtalo otra vez desde Ajustes.");
  if (url.searchParams.get("error")) return volver(`LinkedIn no autorizó: ${url.searchParams.get("error_description") || url.searchParams.get("error")}`);
  const app = await leerSecreto(env, "linkedin_app");
  if (!app) return volver("Falta la app de LinkedIn.");
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: `${url.origin}/api/linkedin/volver`, client_id: app.client_id, client_secret: app.client_secret }),
  });
  const t = await r.json().catch(() => ({}));
  if (!t.access_token) return volver(`LinkedIn no entregó el permiso (${r.status}).`);
  const yo = await (await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } })).json().catch(() => ({}));
  if (!yo.sub) return volver("No se pudo leer tu perfil de LinkedIn.");
  const dura = Number(t.expires_in) > 0 ? Number(t.expires_in) : 60 * 86400;
  await guardarSecreto(env, "linkedin", { access_token: t.access_token, persona: `urn:li:person:${yo.sub}`, nombre: yo.name || "", vence: new Date(Date.now() + dura * 1000).toISOString() });
  await bitacora(env, "Emi", "Conectó LinkedIn");
  return volver("ok");
}

// ---------------------------------------------------------------- cron: publica lo programado y pide métricas

export async function tic(env, fetcher = fetch) {
  const ahora = Date.now();
  const vencidas = (await piezas(env)).filter((x) => x.estado === "programada" && x.fecha && Date.parse(x.fecha) <= ahora).map((x) => x.id);
  for (const id of vencidas) {
    const p = (await piezas(env)).find((x) => x.id === id);
    if (!p || p.estado !== "programada" || p.pausada) continue;
    if (ahora - Date.parse(p.fecha) > 6 * 3600e3) {
      // Seis horas tarde ya no se publica sola: queda para que Emi decida.
      await actualizarPieza(env, id, (x) => { x.estado = "aprobada"; x.historial.unshift({ fecha: ahoraISO(), quien: "panel", que: "no salió a su hora; espera a Emi" }); });
      continue;
    }
    try { await publicar(env, id, fetcher); } catch (e) {
      await actualizarPieza(env, id, (x) => { if (x.estado === "programada") { x.estado = "fallo"; x.error = String(e.message || e).slice(0, 300); } });
    }
  }
  // Métricas de X a las 48 h y a los 7 días (una lectura cada vez).
  for (const p of (await piezas(env)).filter((x) => x.red === "x" && x.estado === "publicada" && x.publicada?.id)) {
    const edad = (ahora - Date.parse(p.publicada.fecha)) / 3600e3;
    for (const h of [48, 168]) {
      if (edad >= h && !(p.lecturas || []).includes(h)) {
        let valores, error;
        try { valores = await metricasX(env, p.publicada.id, fetcher); } catch (e) { error = String(e.message || e).slice(0, 200); }
        await actualizarPieza(env, p.id, (x) => {
          x.lecturas = [...(x.lecturas || []), h];
          if (valores) x.metricas = { fecha: ahoraISO(), fuente: `API de X (${h} h)`, valores }; else x.metricas_error = error;
        });
      }
    }
  }
}

// ---------------------------------------------------------------- Durable Object y entrada del Worker

export class Panel {
  constructor(state, env) { this.state = state; this.env = { ...env, ALMACEN: this.state.storage }; }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/interno/tic") { await tic(this.env); return new Response("ok"); }
    try { return await api(request, this.env, url); } catch (e) { return json({ error: "Error del servidor: " + String(e.message || e) }, 500); }
  }
}
const panelDe = (env) => env.PANEL.get(env.PANEL.idFromName("emi"));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/interno/tic") return new Response("No encontrado.", { status: 404 });
    if (url.pathname.startsWith("/api/")) {
      if (env.PANEL) return panelDe(env).fetch(request);
      try { return await api(request, env, url); } catch (e) { return json({ error: "Error del servidor: " + String(e.message || e) }, 500); }
    }
    const r = await env.ASSETS.fetch(request);
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(SEGURIDAD)) h.set(k, v);
    h.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https://drive.google.com https://lh3.googleusercontent.com https://pbs.twimg.com https://media.licdn.com; media-src 'self' https://drive.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return new Response(r.body, { status: r.status, headers: h });
  },
  async scheduled(evento, env, ctx) {
    if (env.PANEL) ctx.waitUntil(panelDe(env).fetch("https://panel/interno/tic"));
    else ctx.waitUntil(tic(env));
  },
};

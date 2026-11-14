// Pruebas del Worker sin red ni Cloudflare: node worker/prueba.mjs
import assert from "node:assert/strict";
import W, { xVolver, guardarSecreto, leerSecreto, firmaOAuth1, revisarTexto, largoX, huella, publicar, tic, autoriaIA, escaparLinkedIn, parecido, revisarArchivos, metaInspiracion } from "./index.js";

let ok = 0;
const t = async (n, f) => { await f(); ok++; console.log("✓", n); };
const almacen = () => { const m = new Map(); return { m, get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const nuevoEnv = (extra = {}) => ({ PANEL_CLAVE: "clave-de-prueba", CIFRADO: "x".repeat(40), CLAUDE_LLAVE: "c".repeat(32), TOPE_X_USD: "1",
  ALMACEN: almacen(), ASSETS: { fetch: async () => new Response("panel") }, FETCHER: async () => new Response("no", { status: 404 }), ...extra });
const O = "https://redes.test";
const req = (ruta, cuerpo, h = {}) => new Request(O + ruta, cuerpo === undefined ? { headers: h } :
  { method: "POST", headers: { "Content-Type": "application/json", Origin: O, ...h }, body: JSON.stringify(cuerpo) });
const llamar = (env) => async (r) => { const res = await W.fetch(r, env); return { s: res.status, j: await res.json().catch(() => null), h: res.headers }; };
async function sesion(env) {
  const r = await llamar(env)(req("/api/entrar", { clave: "clave-de-prueba" }));
  const g = r.h.get("Set-Cookie").split(";")[0];
  return (ruta, cuerpo) => llamar(env)(req(ruta, cuerpo, { Cookie: g }));
}
const llavesX = { api_key: "k".repeat(20), api_secret: "s".repeat(20), access_token: "t".repeat(20), access_secret: "u".repeat(20) };
const falsoX = (cont) => async (url, o) => { cont.n++; assert.match(o.headers.Authorization, /^OAuth /); return new Response(JSON.stringify({ data: { id: String(cont.n) } }), { status: 201 }); };
const piezasDe = (env) => JSON.parse(env.ALMACEN.m.get("piezas"));
const cambiar = (env, id, f) => { const l = piezasDe(env); f(l.find((x) => x.id === id)); env.ALMACEN.m.set("piezas", JSON.stringify(l)); };

await t("firma OAuth 1.0a igual al ejemplo de la documentación de X (hCtSmYh+iHYCEqBWrE7C7hYmtUk=, recalculado en Python)", async () => {
  const cred = { api_key: "xvz1evFS4wEEPTGEFPHBog", api_secret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    access_token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", access_secret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" };
  const h = await firmaOAuth1("POST", "https://api.twitter.com/1.1/statuses/update.json?include_entities=true", cred,
    { status: "Hello Ladies + Gentlemen, a signed OAuth request!" }, "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958");
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});
await t("regla de autoría: atrapa variantes y deja pasar lo legítimo", async () => {
  for (const malo of ["Este video lo hizo una IA", "Hecho por I.A.", "Lo hizo la IA", "Escrito con inteligencia artificial", "Redactado por IA",
    "Lo hizo ChatGPT", "hecho con IA", "creado con IA", "L0 hizo una IA", "Nadie lo editó", "Claude lo escribió", "Video editado completamente por IA"])
    assert.ok(autoriaIA(malo), malo);
  for (const bueno of ["Construí con IA un monitor del DOF.", "Armé una IA que revisa el DOF", "Trabajo con IA todos los días", "Creo que la IA no reemplaza criterio",
    "La IA reemplaza tareas, no criterio", "Uso Claude para leer y resumir. Verificar sigue siendo mi trabajo."])
    assert.ok(!autoriaIA(bueno), bueno);
});
await t("otras reglas de texto", async () => {
  assert.ok(revisarTexto("Trabajo en C.a.s.t.o.r.e.n.a", "linkedin").errores.length);
  assert.ok(revisarTexto("Comenta DOF y te mando el PDF", "linkedin").errores.length);
  assert.ok(revisarTexto("a".repeat(281), "x").errores.length);
  assert.equal(largoX("ver https://emilianomilla.site/algo"), 4 + 23);
  assert.equal(largoX("hola 🔥"), 5 + 2);
  assert.equal(await huella("  hola \n"), await huella("hola"));
  assert.equal(escaparLinkedIn("(hola) #DOF @x"), "\\(hola\\) \\#DOF \\@x");
  assert.ok(parecido("Leí el DOF completo hoy", "leí el dof completo hoy!") === 1);
});

await t("sesión: sin contraseña no hay datos; otro origen o sin Origin no escriben", async () => {
  const env = nuevoEnv(), c = llamar(env);
  assert.equal((await c(req("/api/estado"))).s, 401);
  assert.equal((await c(req("/api/entrar", { clave: "mala" }))).s, 401);
  const S = await sesion(env);
  assert.equal((await S("/api/estado")).s, 200);
  const g = (await c(req("/api/entrar", { clave: "clave-de-prueba" }))).h.get("Set-Cookie").split(";")[0];
  assert.equal((await c(req("/api/pieza", { red: "x", texto: "hola" }, { Cookie: g, Origin: "https://malo.test" }))).s, 403);
  const sinOrigen = new Request(O + "/api/pieza", { method: "POST", headers: { "Content-Type": "application/json", Cookie: g }, body: "{}" });
  assert.equal((await c(sinOrigen)).s, 403);
  await S("/api/salir-todo", {});
  assert.equal((await c(req("/api/estado", undefined, { Cookie: g }))).s, 401, "salir de todos lados invalida la cookie");
});

await t("aprobación: la invalidan texto, red y fecha; no se reaprueba lo publicado", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  const p = (await S("/api/pieza", { red: "linkedin", texto: "Primer texto." })).j;
  const ap = (await S(`/api/pieza/${p.id}/aprobar`, {})).j;
  assert.equal(ap.estado, "programada", "sin fecha, la Matriz pone la hora y queda programada");
  assert.ok(ap.fecha && Date.parse(ap.fecha) > Date.now()); assert.equal(ap.hora_asignada_por, "Matriz");
  for (const cambio of [{ texto: "Otro texto." }, { red: "x" }, { fecha: new Date(Date.now() + 864e5).toISOString() }]) {
    await S(`/api/pieza/${p.id}/aprobar`, {});
    const e = (await S("/api/pieza", { id: p.id, red: "linkedin", texto: "Primer texto.", ...cambio })).j;
    assert.equal(e.aprobado_huella, undefined, JSON.stringify(cambio));
    await S("/api/pieza", { id: p.id, red: "linkedin", texto: "Primer texto.", fecha: "" });
  }
  await S("/api/llaves/x", llavesX);
  const q = (await S("/api/pieza", { red: "x", texto: "Sale una vez." })).j;
  await S(`/api/pieza/${q.id}/aprobar`, {});
  const cont = { n: 0 };
  assert.equal((await publicar(env, q.id, falsoX(cont))).estado, "publicada");
  assert.equal((await S(`/api/pieza/${q.id}/aprobar`, {})).s, 400, "no se reaprueba lo publicado");
  await assert.rejects(publicar(env, q.id, falsoX(cont)));
  assert.equal(cont.n, 1);
});

await t("una pieza en «fallo» exige confirmar que no salió antes de reaprobar", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  const p = (await S("/api/pieza", { red: "x", texto: "Sin llaves." })).j;
  await S(`/api/pieza/${p.id}/aprobar`, {});
  assert.equal((await publicar(env, p.id)).estado, "fallo");
  assert.equal((await S(`/api/pieza/${p.id}/aprobar`, {})).s, 400);
  assert.equal((await S(`/api/pieza/${p.id}/aprobar`, { confirmo_que_no_salio: true })).j.estado, "programada");
});

await t("mismo texto en dos redes: no se aprueba", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await S("/api/pieza", { red: "linkedin", texto: "Leí el DOF completo esta semana." });
  const x = (await S("/api/pieza", { red: "x", texto: "Leí el DOF completo esta semana!" })).j;
  assert.match((await S(`/api/pieza/${x.id}/aprobar`, {})).j.error, /mismo texto/);
});

await t("llaves cifradas, publicación y tope de gasto (también con tope inválido)", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  assert.equal((await S("/api/llaves/x", llavesX)).s, 200);
  assert.ok(!env.ALMACEN.m.get("cred:x").includes("kkkk"));
  const est = (await S("/api/estado")).j;
  assert.equal(est.conexiones.x, true); assert.ok(!JSON.stringify(est).includes("kkkk"));
  const cont = { n: 0 };
  for (let i = 0; i < 6; i++) {
    const q = (await S("/api/pieza", { red: "x", texto: `Con enlace ${i} https://emilianomilla.site` })).j;
    await S(`/api/pieza/${q.id}/aprobar`, {});
    const s = await publicar(env, q.id, falsoX(cont));
    if (i < 5) assert.equal(s.estado, "publicada", `post ${i}`); else assert.match(s.error || "", /tope/);
  }
  const env2 = nuevoEnv({ TOPE_X_USD: "diez" }), S2 = await sesion(env2);
  await S2("/api/llaves/x", llavesX);
  const q = (await S2("/api/pieza", { red: "x", texto: "Tope inválido." })).j;
  await S2(`/api/pieza/${q.id}/aprobar`, {});
  assert.match((await publicar(env2, q.id, falsoX({ n: 0 }))).error, /tope de 0/);
});

await t("cron: una atrasada no revive lo ya publicado; Instagram no tumba la pasada", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await S("/api/llaves/x", llavesX);
  const fut = new Date(Date.now() + 3600e3).toISOString();
  const a = (await S("/api/pieza", { red: "x", texto: "Pieza A.", fecha: fut })).j;
  const b = (await S("/api/pieza", { red: "linkedin", texto: "Pieza B distinta.", fecha: fut })).j;
  const ig = (await S("/api/pieza", { red: "instagram", texto: "Pieza de Instagram.", fecha: fut })).j;
  for (const p of [a, b, ig]) await S(`/api/pieza/${p.id}/aprobar`, {});
  assert.equal(piezasDe(env).find((x) => x.id === ig.id).estado, "aprobada", "Instagram no queda programada");
  cambiar(env, a.id, (x) => { x.fecha = new Date(Date.now() - 60e3).toISOString(); });
  cambiar(env, b.id, (x) => { x.fecha = new Date(Date.now() - 7 * 3600e3).toISOString(); });
  // La huella cubre la fecha: tras cambiarla «por debajo», hay que recalcular como si Emi hubiera aprobado.
  for (const id of [a.id, b.id]) cambiar(env, id, (x) => { x.estado = "programada"; });
  const { default: _ } = await import("./index.js");
  const cont = { n: 0 };
  for (const id of [a.id]) { const l = piezasDe(env); const x = l.find((y) => y.id === id); x.aprobado_huella = await huella(`${x.red}\n${x.fecha || ""}\n${x.media || ""}\n${x.texto}`); env.ALMACEN.m.set("piezas", JSON.stringify(l)); }
  await tic(env, falsoX(cont));
  await tic(env, falsoX(cont));
  const l = piezasDe(env);
  assert.equal(l.find((x) => x.id === a.id).estado, "publicada");
  assert.equal(l.find((x) => x.id === b.id).estado, "aprobada", "la atrasada espera a Emi");
  assert.equal(cont.n, 1, "A se publicó una sola vez");
});

await t("pieza atorada en «publicando»: Emi la resuelve después de 10 min", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  const p = (await S("/api/pieza", { red: "x", texto: "Atorada." })).j;
  cambiar(env, p.id, (x) => { x.estado = "publicando"; x.publicando_desde = new Date(Date.now() - 60e3).toISOString(); });
  assert.equal((await S(`/api/pieza/${p.id}/resolver`, { salio: true })).s, 400);
  assert.equal((await S(`/api/pieza/${p.id}/cancelar`, {})).s, 400);
  cambiar(env, p.id, (x) => { x.publicando_desde = new Date(Date.now() - 11 * 60e3).toISOString(); });
  assert.equal((await S(`/api/pieza/${p.id}/resolver`, { salio: true, url: "https://x.com/i/web/status/1" })).j.estado, "publicada");
});

await t("Claude: borradores sí; aprobar, pisar, mover aprobadas o inundar, no; límite de intentos", async () => {
  const env = nuevoEnv(), c = llamar(env), S = await sesion(env);
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  const r = await c(req("/api/claude/pieza", { red: "linkedin", texto: "Borrador de Claude." }, H));
  assert.equal(r.j.estado, "lista para aprobar");
  assert.equal((await c(req(`/api/pieza/${r.j.id}/aprobar`, {}, H))).s, 401);
  await S(`/api/pieza/${r.j.id}/aprobar`, {});
  assert.equal((await c(req("/api/claude/pieza", { id: r.j.id, red: "x", texto: "Borrador de Claude." }, H))).s, 400, "no mueve una aprobada");
  const emi = (await S("/api/pieza", { red: "x", texto: "De Emi." })).j;
  assert.equal((await c(req("/api/claude/pieza", { id: emi.id, red: "x", texto: "pisar" }, H))).s, 400);
  for (let i = 0; i < 200; i++) await c(req("/api/claude/pieza", { red: "tiktok", texto: `b${i}` }, H));
  assert.equal((await c(req("/api/claude/pieza", { red: "tiktok", texto: "uno más" }, H))).s, 400, "tope de borradores");
  assert.ok(piezasDe(env).some((x) => x.id === emi.id), "la de Emi sigue");
  const malo = { Authorization: "Bearer " + "z".repeat(32), "CF-Connecting-IP": "9.9.9.9" };
  const codigos = [];
  for (let i = 0; i < 7; i++) codigos.push((await c(req("/api/claude/estado", undefined, malo))).s);
  assert.ok(codigos.includes(429), codigos.join(","));
});

await t("alta: una sola vez, sin carrera, y no revive aunque se borre la clave", async () => {
  const env = nuevoEnv({ PANEL_CLAVE: undefined, ALTA: "a".repeat(32) }), c = llamar(env);
  assert.equal((await c(req("/api/alta", { alta: "mal".repeat(11), clave: "contraseña-larga" }))).s, 403);
  assert.equal((await c(req("/api/alta", { alta: "a".repeat(32), clave: "corta" }))).s, 400);
  const [r1, r2] = await Promise.all([c(req("/api/alta", { alta: "a".repeat(32), clave: "contraseña-de-emi" })), c(req("/api/alta", { alta: "a".repeat(32), clave: "contraseña-de-otro" }))]);
  assert.deepEqual([r1.s, r2.s].sort(), [200, 409]);
  assert.ok(!env.ALMACEN.m.get("clave").includes("contraseña"));
  env.ALMACEN.m.delete("clave");
  assert.equal((await c(req("/api/alta", { alta: "a".repeat(32), clave: "otra-contraseña-x" }))).s, 409);
});

await t("regreso de LinkedIn sin cookie: solo con un state vigente creado por Emi", async () => {
  const env = nuevoEnv(), c = llamar(env), S = await sesion(env);
  const r = await c(req("/api/linkedin/volver?state=" + "a".repeat(48) + "&code=x"));
  assert.equal(r.s, 302); assert.match(r.h.get("Location"), /venci/);
  assert.equal((await S("/api/llaves/linkedin-app", { client_id: "abcdefg", client_secret: "secreto123" })).s, 200);
  const u = new URL((await S("/api/linkedin/conectar", {})).j.url);
  const st = u.searchParams.get("state");
  assert.ok(env.ALMACEN.m.has(`linkedin_estado:${st}`));
  assert.equal(u.searchParams.get("redirect_uri"), O + "/api/linkedin/volver");
});

await t("enlaces privados: solo con sesión o llave de Claude", async () => {
  const env = nuevoEnv(), c = llamar(env), S = await sesion(env);
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  assert.equal((await c(req("/api/claude/enlace", { nombre: "Drive", url: "javascript:alert(1)" }, H))).s, 400);
  assert.equal((await c(req("/api/claude/enlace", { nombre: "Drive", url: "https://drive.google.com/drive/folders/abc" }, H))).s, 200);
  assert.equal((await S("/api/estado")).j.enlaces.length, 1);
});
await t("pieza con video: no sale por API; Emi la marca publicada desde la app", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await S("/api/llaves/x", llavesX);
  const p = (await S("/api/pieza", { red: "linkedin", texto: "Con video.", solo_app: true, fecha: new Date(Date.now() + 3600e3).toISOString() })).j;
  assert.equal((await S(`/api/pieza/${p.id}/aprobar`, {})).j.estado, "aprobada", "no se programa");
  await assert.rejects(publicar(env, p.id), /desde la app/);
  assert.equal((await S(`/api/pieza/${p.id}/resolver`, { salio: true, url: "https://www.linkedin.com/feed/update/x" })).j.estado, "publicada");
});
await t("X con OAuth 2.0 + PKCE: conectar, publicar con Bearer y renovar el token", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  assert.equal((await S("/api/llaves/x-app", { client_id: "cliente-x-123", client_secret: "secreto-x-456" })).s, 200);
  const u = new URL((await S("/api/x/conectar", {})).j.url);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.match(u.searchParams.get("scope"), /tweet.write/); assert.match(u.searchParams.get("scope"), /offline.access/);
  const st = u.searchParams.get("state");
  const verif = JSON.parse(env.ALMACEN.m.get(`x_estado:${st}`)).verificador;
  const reto = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verif))).toString("base64url");
  assert.equal(u.searchParams.get("code_challenge"), reto);
  let cuerpoToken;
  const fx = async (url, o) => {
    if (url.includes("oauth2/token")) {
      cuerpoToken = new URLSearchParams(o.body);
      assert.match(o.headers.Authorization, /^Basic /);
      return Response.json({ access_token: cuerpoToken.get("grant_type") === "refresh_token" ? "acceso-2" : "acceso-1", refresh_token: "renov-" + Date.now(), expires_in: 7200 });
    }
    assert.match(o.headers.Authorization, /^Bearer acceso-/);
    return Response.json({ data: { id: "77" } }, { status: 201 });
  };
  const r = await xVolver(new Request(`${O}/api/x/volver?state=${st}&code=abc`), env, new URL(`${O}/api/x/volver?state=${st}&code=abc`), fx);
  assert.match(r.headers.get("Location"), /x=ok/);
  assert.equal(cuerpoToken.get("code_verifier"), verif);
  assert.equal((await S("/api/estado")).j.conexiones.x, true);
  const p = (await S("/api/pieza", { red: "x", texto: "Con OAuth 2." })).j;
  await S(`/api/pieza/${p.id}/aprobar`, {});
  assert.equal((await publicar(env, p.id, fx)).estado, "publicada");
  // Token vencido: se renueva antes de publicar y se guarda el par nuevo.
  await guardarSecreto(env, "x2", { access_token: "viejo", refresh_token: "renov-viejo", vence: new Date(Date.now() - 1000).toISOString() });
  const q = (await S("/api/pieza", { red: "x", texto: "Segundo, con token vencido." })).j;
  await S(`/api/pieza/${q.id}/aprobar`, {});
  assert.equal((await publicar(env, q.id, fx)).estado, "publicada");
  assert.equal(cuerpoToken.get("grant_type"), "refresh_token"); assert.equal(cuerpoToken.get("refresh_token"), "renov-viejo");
  assert.equal((await leerSecreto(env, "x2")).access_token, "acceso-2");
  // Si X no renueva, falla cerrado y pide reconectar.
  await guardarSecreto(env, "x2", { access_token: "viejo", refresh_token: "malo", vence: new Date(Date.now() - 1000).toISOString() });
  const z = (await S("/api/pieza", { red: "x", texto: "Tercero, sin renovación." })).j;
  await S(`/api/pieza/${z.id}/aprobar`, {});
  const falla = async (url) => url.includes("oauth2/token") ? Response.json({ error: "invalid_request" }, { status: 400 }) : assert.fail("no debe publicar");
  assert.match((await publicar(env, z.id, falla)).error, /reconecta X/);
  assert.equal(await leerSecreto(env, "x2"), null);
});
await t("X como app pública: si Basic da 401, se pide el token sin secreto", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await S("/api/llaves/x-app", { client_id: "cliente-publico", client_secret: "secreto-que-no-sirve" });
  const st = new URL((await S("/api/x/conectar", {})).j.url).searchParams.get("state");
  const vistas = [];
  const fx = async (url, o) => { vistas.push(!!o.headers.Authorization); return o.headers.Authorization ? Response.json({ error: "unauthorized_client", error_description: "Missing valid authorization header" }, { status: 401 }) : Response.json({ access_token: "a", refresh_token: "r", expires_in: 7200 }); };
  const r = await xVolver(new Request(`${O}/api/x/volver?state=${st}&code=c`), env, new URL(`${O}/api/x/volver?state=${st}&code=c`), fx);
  assert.match(r.headers.get("Location"), /x=ok/);
  assert.deepEqual(vistas, [true, false]);
  assert.ok(JSON.parse(env.ALMACEN.m.get("bitacora")).some((b) => /app pública/.test(b.que)));
});
await t("hora sugerida: respeta hora base, cadencia y separación de cada red", async () => {
  const { sugerirHora } = await import("./index.js");
  const ahora = Date.parse("2026-11-13T17:00:00Z"); // 11:00 en México, viernes
  const x1 = sugerirHora("x", [], ahora);
  assert.equal(x1, "2026-11-14T15:00:00.000Z", "X: sábado 9:00 (hoy ya pasó)");
  const li = sugerirHora("linkedin", [], ahora);
  assert.equal(li, "2026-11-14T14:30:00.000Z");
  const ig = sugerirHora("instagram", [], ahora);
  assert.equal(ig, "2026-11-14T01:00:00.000Z".replace("11-14T01", "11-14T01"), "Instagram: hoy 19:00");
  const ocupado = [{ id: "a", red: "linkedin", fecha: li, estado: "programada" }];
  assert.equal(sugerirHora("linkedin", ocupado, ahora), "2026-11-15T14:30:00.000Z", "LinkedIn: 1 al día");
  assert.equal(sugerirHora("linkedin", [{ ...ocupado[0], estado: "cancelada" }], ahora), li, "las canceladas no ocupan");
});
await t("Claude sugiere hora; la aprobación la usa; pausa y notas antes de publicar", async () => {
  const env = nuevoEnv(), c = llamar(env), S = await sesion(env);
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  await S("/api/llaves/x", llavesX);
  const p = (await c(req("/api/claude/pieza", { red: "x", texto: "Con hora sugerida." }, H))).j;
  const hora = new Date(Date.now() + 5 * 3600e3).toISOString();
  assert.equal((await c(req(`/api/claude/pieza/${p.id}/sugerencia`, { hora, motivo: "martes 9:00 por el calendario" }, H))).j.hora_sugerida, hora);
  const a = (await S(`/api/pieza/${p.id}/aprobar`, {})).j;
  assert.equal(a.fecha, hora); assert.equal(a.estado, "programada");
  await c(req(`/api/claude/pieza/${p.id}/comentario`, { texto: "Lista la imagen." }, H));
  const n = (await S(`/api/pieza/${p.id}/comentario`, { texto: "Espera, quiero cambiar la foto." })).j;
  assert.equal(n.comentarios.length, 2);
  assert.equal((await S(`/api/pieza/${p.id}/pausa`, { pausada: true })).j.pausada, true);
  await assert.rejects(publicar(env, p.id, falsoX({ n: 0 })), /pausa/);
  cambiar(env, p.id, (x) => { x.fecha = new Date(Date.now() - 60e3).toISOString(); });
  await tic(env, async () => assert.fail("no debe publicar en pausa"));
  assert.equal(piezasDe(env).find((x) => x.id === p.id).estado, "programada");
});
await t("inspiración: Emi pega el enlace; la Matriz analiza y propone espacio; Emi confirma", async () => {
  const env = nuevoEnv(), c = llamar(env), S = await sesion(env);
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  const e = (await S("/api/inspiracion", { url: "https://pin.it/abc123", que_me_llamo: "Los cortes rápidos" })).j;
  assert.equal(e.plataforma, "Pinterest"); assert.equal(e.estado, "por analizar");
  assert.equal((await S("/api/inspiracion", { url: "javascript:alert(1)" })).s, 400);
  const a = (await c(req(`/api/claude/inspiracion/${e.id}`, { estilo: "collage", edicion: "cortes cada 1.5 s", espacio_propuesto: "personal" }, H))).j;
  assert.equal(a.estado, "analizada"); assert.equal(a.espacio_propuesto, "personal");
  const f = (await S(`/api/inspiracion/${e.id}/espacio`, { espacio: "milla" })).j;
  assert.equal(f.espacio, "milla"); assert.equal(f.espacio_propuesto, null);
  const n = (await c(req("/api/claude/nota", { texto: "Idea de la Matriz", espacio: "pan" }, H))).j;
  assert.equal(n.espacio, null); assert.equal(n.espacio_propuesto, "pan");
});

// ---------------------------------------------------------------- archivos
const MiB = 1024 * 1024;
const bytesDe = (n, semilla = 7) => { const u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = (i * 31 + semilla) & 255; return u; };
async function subirArchivoPrueba(env, S, nombre, tipo, u8, extra = {}) {
  const a = (await S("/api/archivo", { nombre, tipo, bytes: u8.byteLength, ...extra })).j;
  assert.ok(a.id, JSON.stringify(a));
  for (let n = 0; n < a.partes; n++) {
    const g = (await llamar(env)(req("/api/entrar", { clave: "clave-de-prueba" }))).h.get("Set-Cookie").split(";")[0];
    const r = await W.fetch(new Request(`${O}/api/archivo/${a.id}/${n}`, { method: "PUT", headers: { Cookie: g, Origin: O, "Content-Type": "application/octet-stream" }, body: u8.slice(n * a.parte, Math.min(u8.byteLength, (n + 1) * a.parte)) }), env);
    assert.equal(r.status, 200, await r.clone().text());
  }
  return a.id;
}
await t("archivos: suben en partes, se leen con Range, se validan por red y cambian la aprobación", async () => {
  const env = nuevoEnv(), S = await sesion(env), c = llamar(env);
  const u8 = bytesDe(9 * MiB + 123);
  const id = await subirArchivoPrueba(env, S, "video final.mp4", "video/mp4", u8, { duracion: 58 });
  const est = (await S("/api/estado")).j.archivos.find((a) => a.id === id);
  assert.equal(est.estado, "listo"); assert.equal(est.partes, 3);
  const g = (await c(req("/api/entrar", { clave: "clave-de-prueba" }))).h.get("Set-Cookie").split(";")[0];
  const r = await W.fetch(new Request(`${O}/api/archivo/${id}`, { headers: { Cookie: g, Range: `bytes=${4 * MiB - 2}-${4 * MiB + 1}` } }), env);
  assert.equal(r.status, 206); assert.equal(r.headers.get("Content-Range"), `bytes ${4 * MiB - 2}-${4 * MiB + 1}/${u8.byteLength}`);
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [...u8.slice(4 * MiB - 2, 4 * MiB + 2)]);
  const todo = new Uint8Array(await (await W.fetch(new Request(`${O}/api/archivo/${id}`, { headers: { Cookie: g } }), env)).arrayBuffer());
  assert.equal(todo.byteLength, u8.byteLength); assert.equal(todo[9 * MiB], u8[9 * MiB]);
  assert.equal((await W.fetch(new Request(`${O}/api/archivo/${id}`), env)).status, 401, "sin sesión no se ve");
  // Parte de tamaño equivocado y PUT de otro origen.
  const b = (await S("/api/archivo", { nombre: "x.png", tipo: "image/png", bytes: 1000 })).j;
  assert.equal((await W.fetch(new Request(`${O}/api/archivo/${b.id}/0`, { method: "PUT", headers: { Cookie: g, Origin: O, "Content-Type": "application/octet-stream" }, body: new Uint8Array(999) }), env)).status, 400);
  assert.equal((await W.fetch(new Request(`${O}/api/archivo/${b.id}/0`, { method: "PUT", headers: { Cookie: g, Origin: "https://malo.test", "Content-Type": "application/octet-stream" }, body: new Uint8Array(1000) }), env)).status, 403);
  assert.equal((await S("/api/archivo", { nombre: "a.exe", tipo: "application/x-msdownload", bytes: 10 })).s, 400);
  // Reglas por red.
  const A = (clase, extra = {}) => ({ nombre: "a", clase, tipo: { imagen: "image/png", video: "video/mp4", pdf: "application/pdf", gif: "image/gif" }[clase], bytes: MiB, ...extra });
  assert.match(revisarArchivos("x", [A("pdf")]), /PDF/);
  assert.match(revisarArchivos("x", [A("video"), A("imagen")]), /solo/);
  assert.equal(revisarArchivos("x", [A("imagen"), A("imagen"), A("imagen"), A("imagen")]), null);
  assert.match(revisarArchivos("x", [A("imagen", { bytes: 6 * MiB })]), /5 MB/);
  assert.equal(revisarArchivos("linkedin", [A("pdf")]), null);
  assert.match(revisarArchivos("linkedin", [A("video", { tipo: "video/quicktime" })]), /MP4/);
  assert.equal(revisarArchivos("instagram", [A("video"), A("imagen")]), null);
  // Pieza con el video: aprobar, y quitar el archivo invalida la aprobación.
  const p = (await S("/api/pieza", { red: "linkedin", texto: "Con video del panel.", archivos: [id] })).j;
  assert.deepEqual(p.archivos, [id]);
  const pdfx = (await S("/api/archivo", { nombre: "c.pdf", tipo: "application/pdf", bytes: 1000 })).j;
  assert.match((await S("/api/pieza", { red: "x", texto: "PDF en X", archivos: [pdfx.id] })).j.error, /PDF/);
  const sinTerminar = (await S("/api/pieza", { red: "x", texto: "Foto a medias", archivos: [b.id] })).j;
  assert.match((await S(`/api/pieza/${sinTerminar.id}/aprobar`, {})).j.error, /terminado de subir/);
  const ap = (await S(`/api/pieza/${p.id}/aprobar`, {})).j;
  assert.ok(ap.aprobado_huella);
  const sin = (await S("/api/pieza", { id: p.id, red: "linkedin", texto: "Con video del panel.", archivos: [] })).j;
  assert.equal(sin.aprobado_huella, undefined);
  assert.equal((await S(`/api/archivo/${id}/borrar`, {})).s, 200, "ya no lo usa ninguna pieza");
  assert.ok(![...env.ALMACEN.m.keys()].some((k) => k.startsWith(`bin:${id}:`)), "se borraron los trozos");
});

// X falso que entiende la subida por partes de /2/media/upload.
function falsoXMedia(reg, procesa = 0) {
  return async (url, o) => {
    reg.push(`${o.method || "GET"} ${url.replace("https://api.x.com", "")}`);
    if (url.endsWith("/2/media/upload/initialize")) { const b = JSON.parse(o.body); reg.tipo = b; return Response.json({ data: { id: "m1", expires_after_secs: 86400 } }); }
    if (/\/append$/.test(url)) { assert.ok(o.body instanceof FormData); reg.bytes = (reg.bytes || 0) + o.body.get("media").size; return new Response(null, { status: 204 }); }
    if (/\/finalize$/.test(url)) return Response.json({ data: { id: "m1", processing_info: procesa ? { state: "pending", check_after_secs: 1 } : undefined } });
    if (url.includes("command=STATUS")) return Response.json({ data: { processing_info: { state: --procesa > 0 ? "in_progress" : "succeeded" } } });
    if (url.endsWith("/2/tweets")) { reg.tweet = JSON.parse(o.body); return Response.json({ data: { id: "900" } }, { status: 201 }); }
    return new Response("?", { status: 404 });
  };
}
await t("X con imagen: sube en partes, publica con media_ids y cuenta el gasto", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await S("/api/llaves/x", llavesX);
  const img = bytesDe(5 * MiB - 10, 3);
  const id = await subirArchivoPrueba(env, S, "foto.png", "image/png", img);
  const p = (await S("/api/pieza", { red: "x", texto: "Con foto.", archivos: [id] })).j;
  await S(`/api/pieza/${p.id}/aprobar`, {});
  const reg = [];
  const r = await publicar(env, p.id, falsoXMedia(reg));
  assert.equal(r.estado, "publicada", JSON.stringify(r.error || r.subida));
  assert.deepEqual(reg.tweet, { text: "Con foto.", media: { media_ids: ["m1"] } });
  assert.equal(reg.tipo.media_category, "tweet_image"); assert.equal(reg.bytes, img.byteLength);
  assert.equal(reg.filter((x) => x.includes("/append")).length, 2, "dos partes de 4 MiB");
  const g = JSON.parse(env.ALMACEN.m.get(`gasto:x:${new Date().toISOString().slice(0, 7)}`));
  assert.ok(g.llamadas.some((l) => /parte 2\/2/.test(l.que)));
});
await t("X con video que tarda en procesarse: «Publicar ahora» espera y el cron lo saca una sola vez", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await S("/api/llaves/x", llavesX);
  const id = await subirArchivoPrueba(env, S, "corte.mp4", "video/mp4", bytesDe(MiB), { duracion: 45 });
  const p = (await S("/api/pieza", { red: "x", texto: "Con video.", archivos: [id], fecha: new Date(Date.now() + 864e5).toISOString() })).j;
  await S(`/api/pieza/${p.id}/aprobar`, {});
  cambiar(env, p.id, (x) => { x.estado = "aprobada"; });
  const reg = [], fx = falsoXMedia(reg, 2);
  const r = await publicar(env, p.id, fx);
  assert.match(r.aviso, /procesarlos/); assert.equal(r.publicar_al_terminar, true);
  assert.equal(r.subida.items[0].estado, "procesando");
  cambiar(env, p.id, (x) => { x.subida.items[0].revisar = new Date(Date.now() - 1000).toISOString(); });
  await tic(env, fx); // in_progress
  cambiar(env, p.id, (x) => { x.subida.items[0].revisar = new Date(Date.now() - 1000).toISOString(); });
  await tic(env, fx); // succeeded → publica
  await tic(env, fx);
  const fin = piezasDe(env).find((x) => x.id === p.id);
  assert.equal(fin.estado, "publicada", JSON.stringify({ e: fin.error, s: fin.subida, h: fin.historial, reg }));
  assert.equal(reg.filter((x) => x.endsWith("/2/tweets")).length, 1);
  assert.equal(reg.tipo.media_category, "tweet_video");
});
await t("sin aprobación no se sube nada a la red; con fallos de subida, a los 3 espera a Emi", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await S("/api/llaves/x", llavesX);
  const id = await subirArchivoPrueba(env, S, "f.jpg", "image/jpeg", bytesDe(1000));
  const p = (await S("/api/pieza", { red: "x", texto: "Sin aprobar.", archivos: [id] })).j;
  await assert.rejects(publicar(env, p.id, async () => assert.fail("no debe llamar a X")), /aprobado/);
  const fut = new Date(Date.now() + 3600e3).toISOString();
  await S("/api/pieza", { id: p.id, red: "x", texto: "Sin aprobar.", archivos: [id], fecha: fut });
  assert.equal((await S(`/api/pieza/${p.id}/aprobar`, {})).j.estado, "programada");
  const malo = async () => Response.json({ title: "Forbidden" }, { status: 403 });
  for (let i = 0; i < 3; i++) { cambiar(env, p.id, (x) => { if (x.subida) delete x.subida.ocupada_hasta; }); await tic(env, malo); }
  const x = piezasDe(env).find((y) => y.id === p.id);
  assert.equal(x.estado, "aprobada"); assert.match(x.error, /reconecta X/);
});
await t("LinkedIn: video en partes con ETag, espera a que procese y publica con content.media; PDF con título", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  await guardarSecreto(env, "linkedin", { access_token: "li-tok", persona: "urn:li:person:abc", vence: new Date(Date.now() + 864e5).toISOString() });
  const vid = bytesDe(6 * MiB, 9);
  const id = await subirArchivoPrueba(env, S, "dof-video.mp4", "video/mp4", vid, { duracion: 70 });
  const reg = { put: [], posts: [] };
  const fl = async (url, o) => {
    if (url.includes("/rest/videos?action=initializeUpload")) {
      assert.equal(o.headers["LinkedIn-Version"], "202610");
      return Response.json({ value: { video: "urn:li:video:V1", uploadToken: "tok", uploadInstructions: [{ firstByte: 0, lastByte: 4 * MiB - 1, uploadUrl: "https://www.linkedin.com/dms-uploads/a" }, { firstByte: 4 * MiB, lastByte: 6 * MiB - 1, uploadUrl: "https://www.linkedin.com/dms-uploads/b" }] } });
    }
    if (url.startsWith("https://www.linkedin.com/dms-uploads/")) { reg.put.push(o.body.byteLength); return new Response(null, { status: 200, headers: { etag: `"e${reg.put.length}"` } }); }
    if (url.includes("finalizeUpload")) { reg.fin = JSON.parse(o.body); return new Response(null, { status: 200 }); }
    if (url.includes("/rest/documents?action=initializeUpload")) return Response.json({ value: { document: "urn:li:document:D1", uploadUrl: "https://www.linkedin.com/dms-uploads/doc" } });
    if (url.endsWith("/rest/posts")) { const b = JSON.parse(o.body); reg.posts.push(b); return reg.posts.length === 1 ? new Response("{\"message\":\"processing\"}", { status: 422 }) : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } }); }
    return new Response("?", { status: 404 });
  };
  const p = (await S("/api/pieza", { red: "linkedin", texto: "Video del DOF.", archivos: [id] })).j;
  await S(`/api/pieza/${p.id}/aprobar`, {});
  cambiar(env, p.id, (x) => { x.estado = "aprobada"; });
  const r = await publicar(env, p.id, fl);
  assert.match(r.aviso || "", /procesarlos/);
  assert.deepEqual(reg.put, [4 * MiB, 2 * MiB]);
  assert.deepEqual(reg.fin.finalizeUploadRequest, { video: "urn:li:video:V1", uploadToken: "tok", uploadedPartIds: ["e1", "e2"] });
  cambiar(env, p.id, (x) => { x.subida.items[0].revisar = new Date(Date.now() - 1000).toISOString(); });
  await tic(env, fl); // primer post: 422 (procesando) → reintento
  let x = piezasDe(env).find((y) => y.id === p.id);
  assert.equal(x.estado, "aprobada"); assert.equal(x.intentos_publicar, 1);
  await tic(env, fl);
  x = piezasDe(env).find((y) => y.id === p.id);
  assert.equal(x.estado, "publicada");
  assert.deepEqual(reg.posts[1].content, { media: { id: "urn:li:video:V1", title: "dof video" } });
  // PDF (carrusel): un solo archivo, con título.
  const pdf = await subirArchivoPrueba(env, S, "Carrusel_IA-y-Derecho.pdf", "application/pdf", bytesDe(300000));
  const q = (await S("/api/pieza", { red: "linkedin", texto: "Carrusel.", archivos: [pdf] })).j;
  await S(`/api/pieza/${q.id}/aprobar`, {});
  cambiar(env, q.id, (y) => { y.estado = "aprobada"; });
  reg.posts.push({}); // que el siguiente post responda 201
  assert.equal((await publicar(env, q.id, fl)).estado, "publicada");
  assert.deepEqual(reg.posts.at(-1).content, { media: { id: "urn:li:document:D1", title: "Carrusel IA y Derecho" } });
});
await t("llave de Claude automático: Emi la crea, sirve como la de Claude y se revoca", async () => {
  const env = nuevoEnv(), S = await sesion(env), c = llamar(env);
  const { llave } = (await S("/api/llave-claude", {})).j;
  assert.match(llave, /^rca_[0-9a-f]{64}$/);
  assert.ok(!env.ALMACEN.m.get("llave_claude_auto").includes(llave.slice(4)), "solo se guarda el hash");
  const H = { Authorization: "Bearer " + llave };
  assert.equal((await c(req("/api/claude/estado", undefined, H))).s, 200);
  assert.equal((await c(req(`/api/pieza/x/aprobar`, {}, H))).s, 401, "no aprueba");
  await S("/api/llave-claude", { accion: "revocar" });
  assert.equal((await c(req("/api/claude/estado", undefined, H))).s, 401);
});
await t("inspiración: el panel guarda título, autor y miniatura del enlace para que Claude la analice", async () => {
  const env = nuevoEnv(), S = await sesion(env), c = llamar(env);
  const png = bytesDe(2048);
  env.FETCHER = async (url) => {
    if (url === "https://vm.tiktok.com/ZM123/") return Object.defineProperty(new Response("<html><meta property=\"og:description\" content=\"Abogado explica &amp; corta\"></html>", { headers: { "content-type": "text/html" } }), "url", { value: "https://www.tiktok.com/@alguien/video/123" });
    if (url.startsWith("https://www.tiktok.com/oembed")) return Response.json({ title: "Cómo leo el DOF en 30 s", author_name: "alguien", thumbnail_url: "https://p16.tiktokcdn.com/m.jpeg" });
    if (url === "https://p16.tiktokcdn.com/m.jpeg") return new Response(png, { headers: { "content-type": "image/jpeg" } });
    return new Response("no", { status: 404 });
  };
  const e = (await S("/api/inspiracion", { url: "https://vm.tiktok.com/ZM123/", que_me_llamo: "El gancho" })).j;
  assert.equal(e.meta.titulo, "Cómo leo el DOF en 30 s"); assert.equal(e.meta.autor, "alguien");
  assert.equal(e.meta.descripcion, "Abogado explica & corta"); assert.equal(e.meta.fuente, "oEmbed");
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  const r = await W.fetch(new Request(`${O}/api/claude/archivo/${e.meta.miniatura}`, { headers: H }), env);
  assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, 2048);
  // Si falla la red, el cron lo completa después.
  env.FETCHER = async () => { throw new Error("sin red"); };
  const f = (await S("/api/inspiracion", { url: "https://www.pinterest.com/pin/1/" })).j;
  assert.ok(f.meta.error);
});
await t("la Matriz mueve la hora de una pieza aprobada sin tocar el contenido; no si cambió, al pasado o sin motivo", async () => {
  const env = nuevoEnv(), c = llamar(env), S = await sesion(env);
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  await S("/api/llaves/x", llavesX);
  const nueva = new Date(Date.now() + 864e5).toISOString();
  const p = (await S("/api/pieza", { red: "x", texto: "Se mueve.", fecha: new Date(Date.now() + 5 * 864e5).toISOString() })).j;
  assert.equal((await c(req(`/api/claude/pieza/${p.id}/fecha`, { fecha: nueva, motivo: "Emi pidió adelantarla" }, H))).s, 400, "sin aprobar no");
  await S(`/api/pieza/${p.id}/aprobar`, {});
  assert.equal((await c(req(`/api/claude/pieza/${p.id}/fecha`, { fecha: new Date(Date.now() - 1000).toISOString(), motivo: "Emi pidió adelantarla" }, H))).s, 400, "al pasado no");
  assert.equal((await c(req(`/api/claude/pieza/${p.id}/fecha`, { fecha: nueva }, H))).s, 400, "sin motivo no");
  const r = (await c(req(`/api/claude/pieza/${p.id}/fecha`, { fecha: nueva, motivo: "Emi pidió adelantarla" }, H))).j;
  assert.equal(r.fecha, nueva); assert.equal(r.estado, "programada"); assert.equal(r.texto, "Se mueve.");
  assert.equal((await publicar(env, p.id, falsoX({ n: 0 }))).estado, "publicada", "la aprobación sigue valiendo con la hora nueva");
  assert.ok(JSON.parse(env.ALMACEN.m.get("bitacora")).some((b) => /Movió la hora/.test(b.que)));
  const q = (await S("/api/pieza", { red: "x", texto: "Cambiada." })).j;
  await S(`/api/pieza/${q.id}/aprobar`, {});
  cambiar(env, q.id, (x) => { x.texto = "Texto cambiado por debajo."; });
  assert.equal((await c(req(`/api/claude/pieza/${q.id}/fecha`, { fecha: nueva, motivo: "Emi pidió adelantarla" }, H))).s, 400, "si el contenido cambió, no");
});
await t("la Matriz adjunta a una pieza aprobada el archivo que faltaba: sale por la API con el mismo texto; no reemplaza, no sin motivo, no si cambió", async () => {
  const env = nuevoEnv(), c = llamar(env), S = await sesion(env);
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  await S("/api/llaves/x", llavesX);
  const subir = async (nombre, tipo, n) => {
    const a = (await c(req("/api/claude/archivo", { nombre, tipo, bytes: n, duracion: 20 }, H))).j;
    const r = await W.fetch(new Request(`${O}/api/claude/archivo/${a.id}/0`, { method: "PUT", headers: { ...H, "Content-Type": "application/octet-stream", "Content-Length": String(n) }, body: new Uint8Array(n).fill(7) }), env);
    assert.equal(r.status, 200);
    return a.id;
  };
  const video = await subir("dof.mp4", "video/mp4", 3000), foto = await subir("foto.jpg", "image/jpeg", 2000);
  const fecha = new Date(Date.now() + 864e5).toISOString();
  const p = (await S("/api/pieza", { red: "x", texto: "Texto aprobado por Emi.", fecha, solo_app: true })).j;
  const adj = (id, cuerpo) => c(req(`/api/claude/pieza/${id}/archivos`, cuerpo, H));
  assert.equal((await adj(p.id, { archivos: [video], motivo: "Emi pidió que saliera sola" })).s, 400, "sin aprobar no");
  const ap = (await S(`/api/pieza/${p.id}/aprobar`, {})).j;
  assert.equal(ap.estado, "aprobada", "solo_app no se programa");
  assert.equal((await adj(p.id, { archivos: [video] })).s, 400, "sin motivo no");
  assert.equal((await adj(p.id, { archivos: [] , motivo: "Emi pidió que saliera sola" })).s, 400, "sin archivos no");
  assert.equal((await adj(p.id, { archivos: ["0123456789ab"], motivo: "Emi pidió que saliera sola" })).s, 400, "archivo inexistente no");
  assert.equal((await adj(p.id, { archivos: [video, foto], motivo: "Emi pidió que saliera sola" })).s, 400, "X: video con imagen no");
  const r = (await adj(p.id, { archivos: [video], motivo: "Emi pidió que saliera sola" })).j;
  assert.deepEqual(r.archivos, [video]); assert.equal(r.solo_app, false); assert.equal(r.estado, "programada"); assert.equal(r.texto, "Texto aprobado por Emi.");
  assert.notEqual(r.aprobado_huella, ap.aprobado_huella, "la huella cubre el archivo");
  assert.equal(r.aprobado.por, "Emi");
  assert.equal((await adj(p.id, { archivos: [foto], motivo: "Emi pidió que saliera sola" })).s, 400, "no reemplaza un archivo ya puesto");
  assert.ok(JSON.parse(env.ALMACEN.m.get("bitacora")).some((b) => /Adjuntó dof\.mp4/.test(b.que)));
  // Sale por la API con el video: sube en partes y publica con media_ids.
  const vistas = [];
  const x = async (url, o) => {
    vistas.push(`${o.method || "GET"} ${String(url).replace("https://api.x.com", "")}`);
    if (String(url).endsWith("/2/tweets")) { assert.deepEqual(JSON.parse(o.body).media.media_ids, ["77"]); return new Response(JSON.stringify({ data: { id: "900" } }), { status: 201 }); }
    return new Response(JSON.stringify({ data: { id: "77" } }), { status: 200 });
  };
  assert.equal((await publicar(env, p.id, x)).estado, "publicada");
  assert.ok(vistas.some((v) => v.includes("/2/media/upload/initialize")) && vistas.some((v) => v.includes("/77/finalize")));
  // Si el contenido cambió por debajo, no adjunta.
  const q = (await S("/api/pieza", { red: "x", texto: "Otra aprobada." })).j;
  await S(`/api/pieza/${q.id}/aprobar`, {});
  cambiar(env, q.id, (y) => { y.texto = "Cambiada por debajo."; });
  assert.equal((await adj(q.id, { archivos: [foto], motivo: "Emi pidió que saliera sola" })).s, 400, "si el contenido cambió, no");
  // En pausa decide Emi.
  const z = (await S("/api/pieza", { red: "x", texto: "En pausa queda." })).j;
  await S(`/api/pieza/${z.id}/aprobar`, {});
  cambiar(env, z.id, (y) => { y.pausada = true; });
  assert.equal((await adj(z.id, { archivos: [foto], motivo: "Emi pidió que saliera sola" })).s, 400, "en pausa no");
});
await t("quitar «solo app» a una pieza aprobada pide aprobarla otra vez (decide si sale sola)", async () => {
  const env = nuevoEnv(), S = await sesion(env);
  const p = (await S("/api/pieza", { red: "x", texto: "Solo app.", solo_app: true })).j;
  await S(`/api/pieza/${p.id}/aprobar`, {});
  const e = (await S("/api/pieza", { id: p.id, red: "x", texto: "Solo app.", solo_app: false })).j;
  assert.equal(e.aprobado_huella, undefined); assert.equal(e.estado, "borrador");
});
console.log(`\n${ok} pruebas aprobadas`);

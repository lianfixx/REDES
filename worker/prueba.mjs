// Pruebas del Worker sin red ni Cloudflare: node worker/prueba.mjs
import assert from "node:assert/strict";
import W, { firmaOAuth1, revisarTexto, largoX, huella, publicar, tic, autoriaIA, escaparLinkedIn, parecido } from "./index.js";

let ok = 0;
const t = async (n, f) => { await f(); ok++; console.log("✓", n); };
const almacen = () => { const m = new Map(); return { m, get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const nuevoEnv = (extra = {}) => ({ PANEL_CLAVE: "clave-de-prueba", CIFRADO: "x".repeat(40), CLAUDE_LLAVE: "c".repeat(32), TOPE_X_USD: "1",
  ALMACEN: almacen(), ASSETS: { fetch: async () => new Response("panel") }, ...extra });
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
  assert.equal((await S(`/api/pieza/${p.id}/aprobar`, {})).j.estado, "aprobada");
  for (const cambio of [{ texto: "Otro texto." }, { red: "x" }, { fecha: new Date(Date.now() + 864e5).toISOString() }]) {
    await S(`/api/pieza/${p.id}/aprobar`, {});
    const e = (await S("/api/pieza", { id: p.id, red: "linkedin", texto: "Primer texto.", ...cambio })).j;
    assert.equal(e.aprobado_huella, undefined, JSON.stringify(cambio));
    await S("/api/pieza", { id: p.id, red: "linkedin", texto: "Primer texto.", fecha: null });
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
  assert.equal((await S(`/api/pieza/${p.id}/aprobar`, { confirmo_que_no_salio: true })).j.estado, "aprobada");
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
console.log(`\n${ok} pruebas aprobadas`);

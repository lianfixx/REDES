// Pruebas del Worker sin red ni Cloudflare: node worker/prueba.mjs
import assert from "node:assert/strict";
import W, { firmaOAuth1, revisarTexto, largoX, huella, publicar, tic } from "./index.js";

let ok = 0;
const t = async (n, f) => { await f(); ok++; console.log("✓", n); };

// Vector de la documentación de X («Creating a signature»: resultado hCtSmYh+iHYCEqBWrE7C7hYmtUk=), comprobado además con Python.
await t("firma OAuth 1.0a igual al vector de X", async () => {
  const cred = { api_key: "xvz1evFS4wEEPTGEFPHBog", api_secret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    access_token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", access_secret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" };
  const h = await firmaOAuth1("POST", "https://api.twitter.com/1.1/statuses/update.json?include_entities=true", cred,
    { status: "Hello Ladies + Gentlemen, a signed OAuth request!" }, "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958");
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});
await t("reglas de texto", async () => {
  assert.ok(revisarTexto("Este video lo hizo una IA", "x").errores.length);
  assert.ok(revisarTexto("Trabajo en Castorena", "linkedin").errores.length);
  assert.ok(revisarTexto("Comenta DOF y te mando el PDF", "linkedin").errores.length);
  assert.equal(revisarTexto("Construí con IA un monitor del DOF.", "x").errores.length, 0);
  assert.ok(revisarTexto("a".repeat(281), "x").errores.length);
  assert.equal(largoX("ver https://emilianomilla.site/algo"), 4 + 23);
  assert.equal(largoX("hola 🔥"), 5 + 2);
  assert.equal(await huella("  hola \n"), await huella("hola"));
});

// Entorno de prueba: KV en memoria, sin INTENTOS.
const mem = new Map();
const env = {
  PANEL_CLAVE: "clave-de-prueba", CIFRADO: "x".repeat(40), CLAUDE_LLAVE: "c".repeat(32), TOPE_X_USD: "1",
  REDES: { get: async (k, ty) => { const v = mem.get(k); return v == null ? null : ty === "json" ? JSON.parse(v) : v; }, put: async (k, v) => mem.set(k, v), delete: async (k) => mem.delete(k) },
  ASSETS: { fetch: async () => new Response("panel") },
};
const O = "https://redes.test";
const req = (ruta, cuerpo, h = {}) => new Request(O + ruta, cuerpo === undefined ? { headers: h } :
  { method: "POST", headers: { "Content-Type": "application/json", Origin: O, ...h }, body: JSON.stringify(cuerpo) });
const call = async (r) => { const res = await W.fetch(r, env); return { s: res.status, j: await res.json().catch(() => null), h: res.headers }; };

let galleta;
await t("sin sesión no hay datos; contraseña mala rechaza", async () => {
  assert.equal((await call(req("/api/estado"))).s, 401);
  assert.equal((await call(req("/api/entrar", { clave: "mala" }))).s, 401);
  const r = await call(req("/api/entrar", { clave: "clave-de-prueba" }));
  assert.equal(r.s, 200);
  galleta = r.h.get("Set-Cookie").split(";")[0];
});
const conS = (ruta, cuerpo) => call(req(ruta, cuerpo, { Cookie: galleta }));
await t("otro origen no puede escribir", async () => {
  assert.equal((await call(req("/api/pieza", { red: "x", texto: "hola" }, { Cookie: galleta, Origin: "https://malo.test" }))).s, 403);
});

let id;
await t("crear, aprobar y la edición invalida la aprobación", async () => {
  const p = (await conS("/api/pieza", { red: "x", texto: "Primer texto.", titulo: "prueba" })).j;
  id = p.id;
  assert.equal(p.estado, "borrador");
  const a = (await conS(`/api/pieza/${id}/aprobar`, {})).j;
  assert.equal(a.estado, "aprobada"); assert.equal(a.aprobado_huella, await huella("Primer texto."));
  const e = (await conS("/api/pieza", { id, red: "x", texto: "Texto cambiado." })).j;
  assert.equal(e.aprobado_huella, undefined); assert.equal(e.estado, "borrador");
  assert.equal((await conS(`/api/pieza/${id}/publicar`, {})).s, 400);
});
await t("no se aprueba un texto que rompe la regla de autoría", async () => {
  const p = (await conS("/api/pieza", { red: "x", texto: "Esto lo hizo una IA." })).j;
  const r = await conS(`/api/pieza/${p.id}/aprobar`, {});
  assert.equal(r.s, 400); assert.match(r.j.error, /IA/);
});
await t("sin llaves de X, publicar falla cerrado", async () => {
  await conS(`/api/pieza/${id}/aprobar`, {});
  const r = (await conS(`/api/pieza/${id}/publicar`, {})).j;
  assert.equal(r.estado, "fallo"); assert.match(r.error, /llaves de X/);
});
await t("llaves cifradas, publicación con fetch simulado y tope de gasto", async () => {
  const k = { api_key: "k".repeat(20), api_secret: "s".repeat(20), access_token: "t".repeat(20), access_secret: "u".repeat(20) };
  assert.equal((await conS("/api/llaves/x", k)).s, 200);
  assert.ok(!mem.get("cred:x").includes("kkkk"), "la llave no queda en claro");
  const est = (await conS("/api/estado")).j;
  assert.equal(est.conexiones.x, true); assert.ok(!JSON.stringify(est).includes("kkkk"));
  const p = (await conS("/api/pieza", { red: "x", texto: "Texto que sí sale." })).j;
  await conS(`/api/pieza/${p.id}/aprobar`, {});
  let llamadas = 0;
  const falso = async (url, o) => { llamadas++; assert.match(o.headers.Authorization, /^OAuth /); return new Response(JSON.stringify({ data: { id: "123" } }), { status: 201 }); };
  const r = await publicar(env, p.id, falso);
  assert.equal(r.estado, "publicada"); assert.equal(r.publicada.id, "123"); assert.equal(llamadas, 1);
  const r2 = await publicar(env, p.id, falso).catch((e) => e);
  assert.ok(r2 instanceof Error, "no publica dos veces");
  // Tope: 1 USD; un post con enlace cuesta 0.20 → el sexto ya no cabe.
  for (let i = 0; i < 6; i++) {
    const q = (await conS("/api/pieza", { red: "x", texto: `Con enlace ${i} https://emilianomilla.site` })).j;
    await conS(`/api/pieza/${q.id}/aprobar`, {});
    const s = await publicar(env, q.id, falso);
    if (i < 4) assert.equal(s.estado, "publicada", `post ${i}`); else assert.match(s.error || "", /tope/);
  }
});
await t("programada sale con el cron; muy atrasada espera a Emi", async () => {
  const futura = new Date(Date.now() + 3600e3).toISOString();
  const p = (await conS("/api/pieza", { red: "linkedin", texto: "Programado.", fecha: futura })).j;
  assert.equal((await conS(`/api/pieza/${p.id}/aprobar`, {})).j.estado, "programada");
  const lista = JSON.parse(mem.get("piezas"));
  lista.find((x) => x.id === p.id).fecha = new Date(Date.now() - 7 * 3600e3).toISOString();
  mem.set("piezas", JSON.stringify(lista));
  await tic(env, async () => { throw new Error("no debería llamar"); });
  assert.equal(JSON.parse(mem.get("piezas")).find((x) => x.id === p.id).estado, "aprobada");
});
await t("Claude deja borradores pero no aprueba", async () => {
  const H = { Authorization: "Bearer " + "c".repeat(32) };
  const r = await call(req("/api/claude/pieza", { red: "linkedin", texto: "Borrador de Claude." }, H));
  assert.equal(r.j.estado, "lista para aprobar"); assert.equal(r.j.creada_por, "claude");
  assert.equal((await call(req(`/api/pieza/${r.j.id}/aprobar`, {}, H))).s, 401);
  assert.equal((await call(req("/api/claude/estado", undefined, { Authorization: "Bearer mala-llave-de-prueba-123456" }))).s, 401);
  assert.equal((await call(req("/api/claude/pieza", { id, red: "x", texto: "pisar" }, H))).s, 403);
});
await t("alta de contraseña: una sola vez, con el enlace", async () => {
  const mem2 = new Map();
  const e2 = { ...env, PANEL_CLAVE: undefined, ALTA: "a".repeat(32), REDES: { get: async (k, ty) => { const v = mem2.get(k); return v == null ? null : ty === "json" ? JSON.parse(v) : v; }, put: async (k, v) => mem2.set(k, v), delete: async (k) => mem2.delete(k) } };
  const c2 = async (r) => { const res = await W.fetch(r, e2); return { s: res.status, j: await res.json().catch(() => null), h: res.headers }; };
  assert.equal((await c2(req("/api/alta", { alta: "mal".repeat(11), clave: "contraseña-larga" }))).s, 403);
  assert.equal((await c2(req("/api/alta", { alta: "a".repeat(32), clave: "corta" }))).s, 400);
  const r = await c2(req("/api/alta", { alta: "a".repeat(32), clave: "contraseña-larga" }));
  assert.equal(r.s, 200);
  assert.ok(!mem2.get("clave").includes("contraseña-larga"), "no se guarda en claro");
  assert.equal((await c2(req("/api/alta", { alta: "a".repeat(32), clave: "otra-contraseña-x" }))).s, 409);
  assert.equal((await c2(req("/api/entrar", { clave: "contraseña-larga" }))).s, 200);
  assert.equal((await c2(req("/api/entrar", { clave: "otra-contraseña-x" }))).s, 401);
  const g = r.h.get("Set-Cookie").split(";")[0];
  assert.equal((await c2(req("/api/estado", undefined, { Cookie: g }))).s, 200);
});
console.log(`\n${ok} pruebas aprobadas`);

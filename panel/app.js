// Panel de la Matriz de Redes. Sin dependencias. Lee /datos.json (lo genera redes.py desde GitHub),
// /crecimiento/*.json y, con la contraseña, /api/estado (piezas, notas, inspiración, encargos y conexiones).
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ZONA = "America/Mexico_City";
const REDES = { x: "X", linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok", "instagram-historias": "Historias" };
const ESPACIOS = { personal: "Personal", milla: "MILLA", castorena: "Castorena", pan: "PAN" };
const API_PUBLICA = ["x", "linkedin"];
const S = { datos: null, crecer: null, recursos: null, estado: null, editor: false, configurado: false };

const fmt = (iso, o = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) =>
  iso ? new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, ...o }).format(new Date(iso)) : "sin fecha";
const hora = (iso) => fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true });
const diaLargo = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const diaClave = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));
const hoyMX = () => diaClave(new Date().toISOString());
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const chipRed = (r) => `<span class="chip ${esc(r)}">${esc(REDES[r] || r)}</span>`;
const ESTADO_CHIP = { publicada: "ok", aprobada: "ok", programada: "ok", fallo: "malo", "lista para aprobar": "aviso", publicando: "aviso" };
const chipEstado = (e) => `<span class="chip ${ESTADO_CHIP[e] ?? ""}">${esc(e)}</span>`;
const seguro = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
const HOSTS_MEDIA = ["drive.google.com", "lh3.googleusercontent.com", "pbs.twimg.com", "media.licdn.com"];
const mediaPermitida = (u) => { try { return HOSTS_MEDIA.includes(new URL(u).hostname); } catch { return false; } };

function aviso(t) { const a = $("#aviso"); a.textContent = t; a.classList.add("ver"); clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove("ver"), 3400); }
async function api(ruta, cuerpo) {
  const r = await fetch(ruta, cuerpo === undefined ? { credentials: "same-origin" } :
    { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({ error: `Respuesta inválida (${r.status})` }));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}
async function cargar(soloEstado = false) {
  const leer = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!soloEstado) [S.datos, S.crecer, S.recursos] = await Promise.all([leer("datos.json"), leer("crecimiento/redes.json"), leer("crecimiento/recursos.json")]);
  try { const s = await api("/api/sesion"); S.editor = s.editor; S.configurado = s.configurado; } catch { S.editor = false; }
  if (S.editor) { try { S.estado = await api("/api/estado"); } catch (e) { aviso(e.message); } } else S.estado = null;
  $("#sesion").textContent = S.editor ? "Salir" : "Entrar";
}

// ---------------------------------------------------------------- reglas de texto (las mismas del Worker)
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t" };
const aplanar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[0134579]/g, (d) => LEET[d] ?? d)
  .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).join(" ").replace(/\b(?:[a-z] ){1,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
const IA = "(?:ia|inteligencia artificial|chatgpt|gpt|claude|gemini|deepseek|copilot|muse|un robot|una maquina)";
const HECHO = "(?:hizo|hecho|hecha|escrito|escrita|escribio|redacto|redactado|redactada|generado|generada|genero|creado|creada|armo|armado|armada|edito|editado|editada|produjo|producido|producida|diseno|disenado|disenada|monto|montado|montada)";
const RE_AUTORIA = [new RegExp(`\\b${HECHO}\\b(?: \\w+){0,3} (?:por|con|usando|desde|mediante)?(?: \\w+){0,1} ?${IA}\\b`), new RegExp(`\\b${HECHO} (?:una |la |el )?${IA}\\b`),
  new RegExp(`\\b(?:la |una |el )?${IA} (?:lo |la |me lo |me la |se )?(?:hizo|escribio|redacto|genero|creo|armo|edito|produjo|diseno|monto)\\b`), /\bnadie lo (?:edito|hizo|escribio)\b/, /\btexto de ia\b/];
const URL_RE = () => /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|mx|org|net|site|dev|io|ai)(?:\/\S*)?/gi;
function largoX(t) {
  let total = 0;
  const sin = String(t || "").normalize("NFC").replace(URL_RE(), () => { total += 23; return ""; });
  for (const ch of sin) { const o = ch.codePointAt(0); if ([0x200d, 0xfe0f, 0xfe0e].includes(o) || (o >= 0x1f3fb && o <= 0x1f3ff)) continue; total += o > 0x10ff && !(o >= 0x2000 && o <= 0x206f) ? 2 : 1; }
  return total;
}
const LIMITES = { x: 280, linkedin: 3000, instagram: 2200, tiktok: 4000 };
function revisar(texto, red) {
  const e = [], w = [], plano = ` ${aplanar(texto)} `;
  if (RE_AUTORIA.some((r) => r.test(aplanar(texto)))) e.push("Dice o insinúa que la pieza la hizo una IA.");
  if (/\b(castorena|indep)\b/.test(plano)) e.push("Nombra al despacho o a un cliente.");
  if (/(comenta|escribe|responde|pon) \S+ (y|para) (te|les) (mando|paso|envio|comparto)/.test(plano)) e.push("Anzuelo de interacción: las redes lo castigan.");
  const largo = red === "x" ? largoX(texto) : [...String(texto || "")].length;
  if (LIMITES[red] && largo > LIMITES[red]) e.push(`Pasa de ${LIMITES[red]} caracteres.`);
  if (red === "linkedin" && [...String(texto || "").split("\n")[0]].length > 140) w.push("La primera línea pasa de 140 caracteres (se corta antes de «ver más»).");
  if (red === "x" && /#\w/.test(texto)) w.push("En X los hashtags no suman.");
  return { e, w, largo };
}

// ---------------------------------------------------------------- vistas previas
const enlazar = (t) => esc(t).replace(URL_RE(), (u) => `<span class="lnk">${u}</span>`);
function media(m) {
  if (!m) return "";
  if (!mediaPermitida(m)) return `<div class="pv-media">Archivo: ${esc(m)}</div>`;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(m)) return `<div class="pv-media"><video src="${esc(m)}" muted playsinline controls></video></div>`;
  return `<div class="pv-media"><img src="${esc(m)}" alt=""></div>`;
}
const previaX = (p, oscuro) => `<div class="pv-x ${oscuro ? "oscuro" : ""}"><div class="cab"><div class="av">EG</div><div style="min-width:0;flex:1">
  <div><span class="nom">Emiliano García Milla</span> <span class="usr">@emilianomilla_ · ${p.fecha ? fmt(p.fecha, { day: "numeric", month: "short" }) : "ahora"}</span></div>
  <div class="txt">${enlazar(p.texto)}</div>${media(p.media)}<div class="acc"><span>💬</span><span>🔁</span><span>♡</span><span>📊</span><span>🔖 ↗</span></div></div></div></div>`;
function previaLi(p) {
  const t = String(p.texto || ""), corto = t.length > 210 ? t.slice(0, 210).replace(/\s+\S*$/, "") : t;
  return `<div class="pv-li"><div class="cab"><div class="av">EG</div><div><div class="nom">Emiliano García Milla</div>
    <div class="tit">Abogado | Maestría en Alta Dirección (en curso) | IA + Derecho</div><div class="tit">Ahora · 🌐</div></div></div>
    <div class="txt" data-largo="${esc(t)}">${esc(corto)}${t.length > corto.length ? `<span class="mas">… más</span>` : ""}</div>${media(p.media)}
    <div class="reac"><span>👍 Recomendar</span><span>💬 Comentar</span><span>🔁 Compartir</span><span>✈️ Enviar</span></div></div>`;
}
function previaTel(p, red) {
  const ok = p.media && mediaPermitida(p.media);
  const m = ok && /\.(mp4|mov|webm)(\?|$)/i.test(p.media) ? `<video src="${esc(p.media)}" muted playsinline loop autoplay></video>` : ok ? `<img src="${esc(p.media)}" alt="">` : "";
  return `<div class="telefono"><div class="pantalla">${m}<div class="pie"><b>${red === "tiktok" ? "@emilianomilla_" : "emilianomilla_"}</b>${esc(p.texto)}</div></div></div>`;
}
const previa = (p) => p.red === "x" ? `${previaX(p)}<div style="height:12px"></div>${previaX(p, true)}` : p.red === "linkedin" ? previaLi(p) : previaTel(p, p.red);

// ---------------------------------------------------------------- qué sigue con cada pieza (el «CRM»)
function siguiente(p) {
  if (p.pausada) return ["Tú: reanudar", "Emi"];
  switch (p.estado) {
    case "idea": return ["Preparar la pieza", p.skill || "skill"];
    case "en produccion": return ["Producir", p.productora || p.skill || "skill"];
    case "borrador": return ["Terminar el texto", p.creada_por === "claude" ? "Matriz" : "Emi"];
    case "lista para aprobar": return ["Tú: aprobar", "Emi"];
    case "programada": return [`Sale sola ${p.fecha ? hora(p.fecha) : ""}`.trim(), "Panel"];
    case "aprobada": return p.solo_app || !API_PUBLICA.includes(p.red) ? ["Tú: subir desde la app", "Emi"] : ["Tú: publicar o poner hora", "Emi"];
    case "publicando": return ["Saliendo…", "Panel"];
    case "fallo": return ["Tú: revisar el fallo", "Emi"];
    case "publicada": return ["Medir a las 48 h", "Panel"];
    default: return ["—", "—"];
  }
}
function filasProximas() {
  const piezas = (S.estado?.piezas || []).filter((p) => p.fecha && !["cancelada"].includes(p.estado) && (p.estado !== "publicada" || Date.parse(p.fecha) > Date.now() - 86400e3))
    .map((p) => ({ ...p, titulo: p.titulo || p.texto.slice(0, 60), origen: "pieza" }));
  const plan = (S.datos?.proximas || []).filter((i) => !(S.editor && i.en_panel)).filter((i) => !piezas.some((p) => p.red === i.red && diaClave(p.fecha) === diaClave(i.fecha))).map((i) => ({ ...i, origen: "plan" }));
  return [...piezas, ...plan].filter((x) => Date.parse(x.fecha) > Date.now() - 86400e3).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
function tablaProximas(filas, max = 40) {
  if (!filas.length) return `<p class="tenue">Nada programado.</p>`;
  let dia = "", h = "";
  for (const f of filas.slice(0, max)) {
    const d = diaClave(f.fecha);
    if (d !== dia) { dia = d; h += `<tr class="grupo"><td colspan="5">${mayus(diaLargo(f.fecha))}${d === hoyMX() ? " · hoy" : ""}</td></tr>`; }
    const [paso, quien] = siguiente(f);
    const titulo = f.origen === "pieza" ? `<a href="#pieza/${f.id}">${esc(f.titulo)}</a>` : `${esc(f.titulo)} <span class="chip">plan</span>`;
    h += `<tr><td class="hora">${hora(f.fecha)}</td><td>${chipRed(f.red)}</td><td>${titulo}</td><td>${chipEstado(f.pausada ? "en pausa" : f.estado)}</td><td><span class="paso ${quien === "Emi" ? "tuyo" : ""}">${esc(paso)}</span></td></tr>`;
  }
  return `<div class="tabla"><table class="crm"><thead><tr><th>Hora</th><th>Red</th><th>Pieza</th><th>Estado</th><th>Siguiente paso</th></tr></thead><tbody>${h}</tbody></table></div>`;
}

// ---------------------------------------------------------------- lo que necesito de ti (priorizado, por sesión, con enlace)
const PRIO = { 1: "Alta", 2: "Media", 3: "Baja" };
function pendientes() {
  const L = [];
  for (const p of S.estado?.piezas || []) {
    const t = p.titulo || p.texto.slice(0, 50);
    if (p.estado === "lista para aprobar") L.push({ que: `Aprobar «${t}»`, prioridad: 1, sesion: p.red, donde: `#pieza/${p.id}` });
    if (p.estado === "aprobada" && (p.solo_app || !API_PUBLICA.includes(p.red))) L.push({ que: `Subir desde la app «${t}»${p.fecha ? ` · ${fmt(p.fecha)}` : ""} y marcar «Ya la publiqué»`, prioridad: 1, sesion: p.red, donde: `#pieza/${p.id}` });
    if (p.estado === "aprobada" && !p.solo_app && API_PUBLICA.includes(p.red) && !p.fecha) L.push({ que: `Ponerle hora o publicar «${t}»`, prioridad: 1, sesion: p.red, donde: `#pieza/${p.id}` });
    if (p.estado === "fallo") L.push({ que: `Revisar el fallo de «${t}»`, prioridad: 1, sesion: p.red, donde: `#pieza/${p.id}` });
    if (p.pausada) L.push({ que: `«${t}» está en pausa`, prioridad: 2, sesion: p.red, donde: `#pieza/${p.id}` });
  }
  const c = S.estado?.conexiones;
  if (c && !c.x) L.push({ que: "Conectar X", prioridad: 2, sesion: "x", donde: "#ajustes" });
  if (c && !c.linkedin) L.push({ que: "Conectar LinkedIn para publicar desde el panel", prioridad: 3, sesion: "linkedin", donde: "#ajustes" });
  const sinEsp = [...(S.estado?.notas || []), ...(S.estado?.inspiracion || [])].filter((n) => n.espacio_propuesto && !n.espacio).length;
  if (sinEsp) L.push({ que: `Confirmar el espacio de ${sinEsp} idea${sinEsp > 1 ? "s" : ""}`, prioridad: 3, sesion: "ideas", donde: "#ideas" });
  for (const q of S.datos?.pendientes_emi || []) {
    const o = typeof q === "string" ? { que: q, prioridad: 2, sesion: "general", donde: "" } : q;
    if (/^Aprobar:/.test(o.que) && S.editor) continue; // las aprobaciones reales salen de las piezas
    L.push(o);
  }
  return L.sort((a, b) => a.prioridad - b.prioridad || String(a.sesion).localeCompare(b.sesion));
}
function listaPendientes() {
  const L = pendientes();
  if (!L.length) return `<p class="tenue">Nada pendiente.</p>`;
  let h = "", prio = 0;
  for (const p of L) {
    if (p.prioridad !== prio) { prio = p.prioridad; h += `<li class="cabeza p${prio}">${PRIO[prio] || "Media"}</li>`; }
    const ir = p.donde ? (p.donde.startsWith("#") ? `<a class="ir" href="${esc(p.donde)}">Ir →</a>` : `<a class="ir" href="${esc(seguro(p.donde))}" target="_blank" rel="noopener">Abrir ↗</a>`) : "";
    h += `<li><span class="sesion">${esc(REDES[p.sesion] || mayus(String(p.sesion)))}</span><span class="que">${esc(p.que)}</span>${ir}</li>`;
  }
  return `<ul class="lista pendientes">${h}</ul>`;
}

// ---------------------------------------------------------------- vistas
const V = {};
V.hoy = () => {
  const d = S.datos || {}, piezas = S.estado?.piezas || [];
  const ahora = new Date().toISOString();
  const semana = filasProximas().filter((f) => Date.parse(f.fecha) - Date.now() < 7 * 864e5).length;
  return `<section class="saludo"><p class="fecha-dia">${mayus(diaLargo(ahora))}</p>
    <p class="tenue">${hora(ahora)} · Ciudad de México</p>
    <div class="cifras"><div class="cifra"><b>${pendientes().length}</b><span>pendientes tuyos</span></div>
    <div class="cifra"><b>${semana}</b><span>salen en 7 días</span></div>
    <div class="cifra"><b>${piezas.filter((p) => p.estado === "publicada").length}</b><span>publicadas</span></div>
    <div class="cifra"><b>${(d.ideas || []).filter((i) => !["cerrada", "descartada"].includes(i.estado)).length + (S.estado?.inspiracion || []).length}</b><span>ideas e inspiración</span></div></div></section>
    <div class="dos"><div class="tarjeta vidrio"><h2>Lo que necesito de ti</h2>${S.editor ? listaPendientes() : entrarPrimero("Entra para ver tus pendientes.")}</div>
    <div class="tarjeta vidrio"><h2>Actividad</h2><ul class="lista">${(S.estado?.bitacora || []).slice(0, 7).map((b) => `<li><span class="tenue chico" style="min-width:92px">${fmt(b.fecha, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span><span>${esc(b.que)}</span></li>`).join("") || `<li class="tenue">Sin actividad.</li>`}</ul>
    ${(d.avisos || []).length ? `<h3 class="seccion">Avisos</h3><ul class="lista">${d.avisos.map((a) => `<li><span class="chip malo">!</span>${esc(a)}</li>`).join("")}</ul>` : ""}</div></div>
    <div class="tarjeta vidrio seccion"><div class="fila" style="justify-content:space-between"><h2>Próximas</h2><a class="tenue chico" href="#calendario">Ver calendario →</a></div>${tablaProximas(filasProximas())}</div>`;
};

const GRUPOS = [["Para aprobar", (p) => p.estado === "lista para aprobar"], ["Para subir desde la app", (p) => p.estado === "aprobada" && (p.solo_app || !API_PUBLICA.includes(p.red))],
  ["Programadas", (p) => ["programada", "publicando"].includes(p.estado) || (p.estado === "aprobada" && API_PUBLICA.includes(p.red) && !p.solo_app)],
  ["Con fallo", (p) => p.estado === "fallo"], ["Borradores", (p) => p.estado === "borrador"], ["Publicadas", (p) => p.estado === "publicada"]];
V.piezas = () => {
  if (!S.editor) return entrarPrimero("Las piezas (textos listos para aprobar y publicar) son privadas.");
  const ps = S.estado.piezas.filter((p) => p.estado !== "cancelada");
  const tarjeta = (p) => `<a class="pieza vidrio" href="#pieza/${p.id}"><div class="fila">${chipRed(p.red)} ${chipEstado(p.pausada ? "en pausa" : p.estado)}
    <span class="tenue chico">${p.fecha ? fmt(p.fecha) : p.hora_sugerida ? "sugerida " + fmt(p.hora_sugerida) : "sin hora"}</span>${(p.comentarios || []).length ? `<span class="chip">💬 ${p.comentarios.length}</span>` : ""}</div>
    <h3 style="margin-top:8px">${esc(p.titulo || "Sin título")}</h3><div class="txt">${esc(p.texto)}</div><p class="paso-mini">${esc(siguiente(p)[0])}</p></a>`;
  return `<div class="fila" style="justify-content:space-between;margin-bottom:6px"><h1>Piezas</h1><div class="fila"><span class="tenue chico" id="vivo">● en vivo</span><a class="boton" href="#pieza/nueva">Nueva pieza</a></div></div>
    ${GRUPOS.map(([nombre, f]) => { const l = ps.filter(f); return l.length ? `<h2 class="seccion">${nombre} <span class="tenue chico">${l.length}</span></h2><div class="rejilla">${l.map(tarjeta).join("")}</div>` : ""; }).join("") ||
    `<div class="vacio vidrio">Aún no hay piezas.</div>`}`;
};

V.pieza = (id) => {
  if (!S.editor) return entrarPrimero("Entra para ver y editar piezas.");
  const p = id === "nueva" ? { red: "x", texto: "", titulo: "", estado: "borrador", historial: [] } : S.estado.piezas.find((x) => x.id === id);
  if (!p) return `<div class="vacio vidrio">No existe esa pieza.</div>`;
  const fechaLocal = p.fecha ? new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA, dateStyle: "short", timeStyle: "short" }).format(new Date(p.fecha)).replace(" ", "T") : "";
  const publicable = API_PUBLICA.includes(p.red) && !p.solo_app;
  const cerrada = ["publicada", "publicando", "cancelada"].includes(p.estado);
  return `<a href="#piezas" class="tenue chico">← Piezas</a><div class="dos" style="margin-top:10px">
    <div><form id="editor" class="tarjeta vidrio"><h2>${id === "nueva" ? "Nueva pieza" : esc(p.titulo || "Pieza")}</h2>
      <div class="fila">${chipEstado(p.pausada ? "en pausa" : p.estado)} ${p.aprobado ? `<span class="chip ok">aprobada ${fmt(p.aprobado.fecha)}</span>` : ""}
        ${p.publicada?.url ? `<a class="chip ok" href="${esc(seguro(p.publicada.url))}" target="_blank" rel="noopener">ver publicada ↗</a>` : ""}</div>
      ${p.error ? `<p class="revision"><span class="e">${esc(p.error)}</span></p>` : ""}
      <p class="paso-grande">Siguiente: <b>${esc(siguiente(p)[0])}</b></p>
      <label>Red</label><select name="red">${Object.entries(REDES).filter(([k]) => k !== "instagram-historias").map(([k, v]) => `<option value="${k}" ${k === p.red ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label>Título interno</label><input name="titulo" value="${esc(p.titulo)}" maxlength="120">
      <label>Texto</label><textarea name="texto" spellcheck="true">${esc(p.texto)}</textarea><div class="contador" id="cont"></div>
      <div class="revision" id="rev"></div>
      <label>Fecha y hora (centro de México)</label><input type="datetime-local" name="fecha" value="${fechaLocal}">
      <p class="tenue chico">${p.hora_sugerida ? `Hora sugerida: <b>${fmt(p.hora_sugerida)}</b>${p.hora_motivo ? ` · ${esc(p.hora_motivo)}` : ""}. ` : ""}Si la dejas vacía, al aprobar la Matriz pone la mejor hora libre de esa red.</p>
      <label>Imagen o video (enlace de Drive, opcional)</label><input name="media" value="${esc(p.media)}" placeholder="https://drive.google.com/…">
      <label class="check"><input type="checkbox" name="solo_app" value="1" ${p.solo_app ? "checked" : ""}> Lleva video o archivo: se publica desde la app</label>
      <label>Nota interna</label><input name="nota" value="${esc(p.nota)}" maxlength="600">
      <div class="fila" style="margin-top:16px">
        ${cerrada ? "" : `<button class="boton" name="guardar">Guardar</button>`}
        ${id !== "nueva" && !cerrada ? `<button class="boton acento" type="button" id="aprobar">Aprobar</button>` : ""}
        ${id !== "nueva" && publicable && ["aprobada", "programada"].includes(p.estado) && !p.pausada ? `<button class="boton" type="button" id="publicar">Publicar ahora</button>` : ""}
        ${id !== "nueva" && !cerrada ? `<button class="boton suave" type="button" id="pausa">${p.pausada ? "Reanudar" : "Pausar"}</button>` : ""}
        ${p.estado === "publicando" ? `<button class="boton suave" type="button" id="salio">Sí salió</button><button class="boton suave" type="button" id="nosalio">No salió</button>` : ""}
        ${p.estado === "aprobada" && !publicable ? `<button class="boton acento" type="button" id="salio">Ya la publiqué</button>` : ""}
        ${id !== "nueva" ? `<button class="boton suave" type="button" id="copiar">Copiar texto</button>` : ""}
        ${p.red === "x" && p.publicada?.id ? `<button class="boton suave" type="button" id="metricas">Leer métricas</button>` : ""}
        ${id !== "nueva" && !cerrada ? `<button class="boton peligro" type="button" id="cancelar">Cancelar</button>` : ""}
      </div>
      <p class="tenue chico" style="margin-top:12px">${publicable ? "Al aprobar, sale sola a su hora por la API oficial. Si cambias el texto, la red, la hora o el archivo, hay que volver a aprobar." : "Aprueba, copia el texto, súbela desde la app y marca «Ya la publiqué»."}</p>
    </form>
    ${id !== "nueva" ? `<div class="tarjeta vidrio seccion"><h3>Notas y confirmaciones antes de publicar</h3>
      <p class="tenue chico">Lo que escribas aquí lo leen las sesiones de Claude antes de tocar o publicar esta pieza. Si algo debe esperar, usa «Pausar».</p>
      <ul class="lista hilo">${(p.comentarios || []).map((c) => `<li><span class="chip ${c.quien === "Emi" ? "aviso" : ""}">${c.quien === "Emi" ? "Tú" : esc(c.quien)}</span><span>${esc(c.texto)} <span class="tenue chico">${fmt(c.fecha)}</span></span></li>`).join("") || `<li class="tenue">Sin notas.</li>`}</ul>
      <form id="comentario" class="fila" style="margin-top:8px"><input name="texto" placeholder="Ej.: confirmo la foto · espera a que suba el video" style="flex:1"><button class="boton">Anotar</button></form></div>` : ""}</div>
    <div><div class="previa" id="previa">${previa(p)}</div>
      ${p.metricas ? `<div class="tarjeta vidrio seccion"><h3>Métricas · ${esc(p.metricas.fuente)} · ${fmt(p.metricas.fecha)}</h3>${tablaValores(p.metricas.valores)}</div>` : ""}
      ${id !== "nueva" && p.estado === "publicada" ? capturaForm(p) : ""}
      ${(p.historial || []).length ? `<div class="tarjeta vidrio seccion"><h3>Historial</h3><ul class="lista">${p.historial.map((h) => `<li><span class="tenue chico">${fmt(h.fecha)}</span> ${esc(h.quien)}: ${esc(h.que)}</li>`).join("")}</ul></div>` : ""}
    </div></div>`;
};
const tablaValores = (v) => `<table>${Object.entries(v || {}).map(([k, n]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td><b>${Number(n).toLocaleString("es-MX")}</b></td></tr>`).join("")}</table>`;
const capturaForm = (p) => `<form id="captura" class="tarjeta vidrio seccion"><h3>Anotar métricas de la app</h3>
  <p class="tenue chico">Copia los números tal como los da ${esc(REDES[p.red])}, uno por línea (<i>impresiones 1200</i>).</p>
  <textarea name="valores" style="min-height:100px" placeholder="impresiones 1200&#10;comentarios 8&#10;seguidores_ganados 3"></textarea>
  <button class="boton" style="margin-top:10px">Guardar métricas</button></form>`;

function semanaDe(f) { const d = new Date(f + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
V.calendario = (q) => {
  const base = semanaDe(new URLSearchParams(q || "").get("desde") || hoyMX());
  const dias = [...Array(7)].map((_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d.toISOString().slice(0, 10); });
  const items = [...(S.datos?.calendario || []).map((i) => ({ ...i, origen: "plan" })),
    ...(S.estado?.piezas || []).filter((p) => p.fecha && p.estado !== "cancelada").map((p) => ({ ...p, titulo: p.titulo || p.texto.slice(0, 40), origen: "pieza" }))];
  const enDia = (d) => items.filter((i) => diaClave(i.fecha) === d).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const mover = (n) => { const d = new Date(base); d.setDate(d.getDate() + 7 * n); return d.toISOString().slice(0, 10); };
  return `<div class="fila" style="justify-content:space-between;margin-bottom:16px"><h1>Calendario</h1><div class="fila">
    <a class="boton suave" href="#calendario?desde=${mover(-1)}">←</a><a class="boton suave" href="#calendario">Hoy</a><a class="boton suave" href="#calendario?desde=${mover(1)}">→</a></div></div>
    <div class="calendario">${dias.map((d) => `<div class="dia vidrio ${d === hoyMX() ? "hoy" : ""}"><h3>${fmt(d + "T12:00:00-06:00", { weekday: "long", day: "numeric", month: "short" })}</h3>
    ${enDia(d).map((i) => `<${i.origen === "pieza" ? `a href="#pieza/${i.id}"` : "div"} class="ev">${hora(i.fecha)} ${chipRed(i.red)}<div>${esc(i.titulo)}</div><span class="tenue chico">${esc(i.estado)}${i.origen === "plan" ? " · plan" : ""}</span></${i.origen === "pieza" ? "a" : "div"}>`).join("") || `<p class="tenue chico">—</p>`}</div>`).join("")}</div>
    <p class="tenue chico seccion">Topes por red (los declara cada skill): ${Object.entries(S.datos?.redes || {}).map(([k, r]) => `${REDES[k] || k}: ${r.cadencia.max_por_dia}/día, ${r.cadencia.max_por_semana}/semana${r.cadencia.separacion_min_h ? `, ${r.cadencia.separacion_min_h} h entre piezas` : ""}`).join(" · ")}</p>`;
};

// Ideas por espacio: la Matriz propone el espacio y tú lo confirmas.
function bloqueEspacio(x, tipo) {
  if (x.espacio) return `<span class="chip">${esc(ESPACIOS[x.espacio])}</span>`;
  const prop = x.espacio_propuesto ? `<span class="chip aviso">propuesto: ${esc(ESPACIOS[x.espacio_propuesto])}</span><button class="mini" data-esp="${tipo}:${x.id}:${x.espacio_propuesto}">Confirmar</button>` : `<span class="chip">sin espacio</span>`;
  return `${prop}<select class="mini-sel" data-cambiar="${tipo}:${x.id}"><option value="">Mover a…</option>${Object.entries(ESPACIOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>`;
}
V.ideas = (q) => {
  const filtro = new URLSearchParams(q || "").get("espacio") || "todas";
  const pasa = (x) => filtro === "todas" || (filtro === "sin" ? !x.espacio : x.espacio === filtro);
  const notas = (S.estado?.notas || []).filter(pasa), insp = (S.estado?.inspiracion || []).filter(pasa);
  const ideasRepo = (S.datos?.ideas || []).filter((i) => filtro === "todas" || i.espacio === filtro);
  const tabs = [["todas", "Todas"], ...Object.entries(ESPACIOS), ["sin", "Por confirmar"]].map(([k, v]) => `<a class="tab ${k === filtro ? "activa" : ""}" href="#ideas?espacio=${k}">${v}</a>`).join("");
  const A = { estilo: "Estilo", redaccion: "Redacción", edicion: "Edición", gancho: "Gancho", formato: "Formato", ritmo: "Ritmo", musica: "Música", que_tomar: "Qué tomar", evitar: "Qué evitar", para_que_red: "Para qué red" };
  return `<h1>Ideas</h1><nav class="tabs">${tabs}</nav>
    ${S.editor ? `<div class="dos seccion"><form id="inspiracion" class="tarjeta vidrio"><h3>Inspiración (Pinterest, TikTok, Reels, YouTube…)</h3>
      <label>Enlace</label><input name="url" placeholder="https://pin.it/… o https://www.tiktok.com/…" required>
      <label>¿Qué te llamó la atención?</label><textarea name="que_me_llamo" style="min-height:70px" placeholder="Los cortes, la tipografía, cómo arranca…"></textarea>
      <div class="fila" style="margin-top:8px"><select name="espacio" style="width:auto"><option value="">Espacio: que lo proponga la Matriz</option>${Object.entries(ESPACIOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><button class="boton">Guardar</button></div>
      <p class="tenue chico">La Matriz la analiza (estilo, redacción, edición, gancho, ritmo, qué tomar) y propone el espacio.</p></form>
    <form id="nota" class="tarjeta vidrio"><h3>Idea, truco o tendencia</h3><textarea name="texto" style="min-height:96px" required></textarea>
      <div class="fila" style="margin-top:8px"><select name="tipo" style="width:auto"><option value="idea">Idea</option><option value="truco">Truco</option><option value="tendencia">Tendencia</option><option value="leccion">Lección</option></select>
      <select name="espacio" style="width:auto"><option value="">Espacio…</option>${Object.entries(ESPACIOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select name="red" style="width:auto"><option value="todas">Todas las redes</option>${Object.entries(REDES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><button class="boton">Guardar</button></div></form></div>` : entrarPrimero("Entra para anotar ideas e inspiración.")}
    ${insp.length ? `<h2 class="seccion">Inspiración</h2><div class="rejilla">${insp.map((x) => `<div class="tarjeta vidrio insp"><div class="fila"><span class="chip">${esc(x.plataforma)}</span>${bloqueEspacio(x, "inspiracion")}</div>
      <p style="margin-top:8px"><a href="${esc(seguro(x.url))}" target="_blank" rel="noopener">${esc(x.url.replace(/^https:\/\/(www\.)?/, "").slice(0, 60))} ↗</a></p>
      ${x.que_me_llamo ? `<p><span class="tenue chico">Te llamó la atención:</span><br>${esc(x.que_me_llamo)}</p>` : ""}
      ${x.analisis ? `<dl class="analisis">${Object.entries(A).filter(([k]) => x.analisis[k]).map(([k, v]) => `<dt>${v}</dt><dd>${esc(x.analisis[k])}</dd>`).join("")}</dl>` : `<p class="tenue chico">Por analizar.</p>`}</div>`).join("")}</div>` : ""}
    ${notas.length ? `<h2 class="seccion">Notas</h2><div class="tarjeta vidrio"><ul class="lista">${notas.map((n) => `<li style="flex-wrap:wrap"><span class="chip ${n.quien === "claude" ? "" : "aviso"}">${n.quien === "claude" ? "Matriz" : "Tú"}</span>${chipRed(n.red)}<span style="flex:1;min-width:200px"><b>${esc(n.tipo)}</b> · ${esc(n.texto)} <span class="tenue chico">${fmt(n.fecha)}</span></span>${bloqueEspacio(n, "nota")}</li>`).join("")}</ul></div>` : ""}
    ${ideasRepo.length ? `<h2 class="seccion">Ideas en marcha</h2>${ideasRepo.map((i) => `<div class="tarjeta vidrio" style="margin-bottom:12px"><div class="fila"><span class="chip">${esc(ESPACIOS[i.espacio] || i.espacio)}</span><span class="chip">${esc(i.pilar)}</span>${chipEstado(i.estado)}</div>
      <p style="margin-top:8px"><b>${esc(i.tesis)}</b></p>${i.postura_emi ? `<p class="tenue">Tu postura: «${esc(i.postura_emi.texto)}»</p>` : ""}</div>`).join("")}` : ""}
    ${!insp.length && !notas.length && !ideasRepo.length ? `<div class="vacio vidrio seccion">Nada en este espacio todavía.</div>` : ""}`;
};

V.crecer = () => {
  const c = S.crecer;
  if (!c) return `<div class="vacio vidrio">Sin datos de crecimiento.</div>`;
  const regla = (r) => `<li><span class="chip ${esc(r.certeza)}">${esc(r.certeza)}</span><span>${esc(r.regla)}</span></li>`;
  return `<h1>Crecer</h1><p class="tenue">Qué funciona en cada red, con su fuente. <span class="chip oficial">oficial</span> lo dice la plataforma · <span class="chip terceros">terceros</span> estudios · <span class="chip criterio">criterio</span> hipótesis que se prueba con tus métricas. Actualizado: ${esc(c.actualizado)}.</p>
    <div class="tarjeta vidrio seccion"><h2>Para todas</h2><ul class="lista">${c.comunes.map(regla).join("")}</ul></div>
    <div class="rejilla seccion">${Object.entries(c.redes).map(([k, r]) => `<div class="tarjeta vidrio"><div class="fila" style="justify-content:space-between"><h2>${esc(REDES[k] || k)}</h2>${chipRed(k)}</div>
      <h3>Cuándo publicar</h3><ul class="lista">${r.cuando.map(regla).join("")}</ul>
      <h3 class="seccion">Qué premia</h3><ul class="lista">${r.que_premia.map(regla).join("")}</ul>
      <h3 class="seccion">Hashtags y enlaces</h3><ul class="lista">${regla(r.hashtags)}${regla(r.enlaces)}</ul>
      <h3 class="seccion">Evitar</h3><ul class="lista">${r.evitar.map((e) => `<li>✕ ${esc(e)}</li>`).join("")}</ul>
      <h3 class="seccion">Post de emergencia</h3><p>${esc(r.emergencia)}</p><p class="tenue chico">Fuente: ${esc(r.fuente)}</p></div>`).join("")}</div>`;
};

V.metricas = () => {
  const ps = (S.estado?.piezas || []).filter((p) => p.metricas);
  const reg = S.datos?.registro || [], g = S.estado?.gasto_x;
  return `<h1>Métricas</h1><p class="tenue">Cada red cuenta distinto: aquí se ven en sus propias unidades. X se lee sola a las 48 h y a los 7 días; las demás, con tus números.</p>
    ${g ? `<div class="tarjeta vidrio"><h3>Gasto en la API de X este mes</h3><p><b>${g.usd.toFixed(3)} USD</b> de ${S.estado.tope_x} USD de tope · ${g.llamadas.length} llamadas</p></div>` : ""}
    <div class="rejilla seccion">${[...ps.map((p) => ({ red: p.red, titulo: p.titulo || p.texto.slice(0, 50), fecha: p.publicada?.fecha, m: p.metricas, url: p.publicada?.url })),
      ...reg.map((r) => ({ red: r.red, titulo: r.id, fecha: r.fecha, m: r.metricas }))].map((x) => `<div class="tarjeta vidrio"><div class="fila">${chipRed(x.red)}<span class="tenue chico">${fmt(x.fecha)}</span></div>
      <h3 style="margin-top:8px">${x.url ? `<a href="${esc(seguro(x.url))}" target="_blank" rel="noopener">${esc(x.titulo)} ↗</a>` : esc(x.titulo)}</h3>${tablaValores(x.m.valores)}<p class="tenue chico">${esc(x.m.fuente)}</p></div>`).join("") || `<div class="vacio vidrio">Aún no hay métricas. Llegan con la primera publicación.</div>`}</div>
    <div class="tarjeta vidrio seccion"><h2>Lecciones y experimentos</h2><ul class="lista">${(S.datos?.lecciones || []).map((l) => `<li><span class="chip">${esc(l.alcance)}</span>${esc(l.regla)}</li>`).join("")}
      ${(S.datos?.experimentos || []).map((e) => `<li><span class="chip aviso">experimento</span>${esc(e.hipotesis)} · ${esc(e.estado)}</li>`).join("")}</ul>
      ${!(S.datos?.lecciones || []).length && !(S.datos?.experimentos || []).length ? `<p class="tenue">Sin lecciones todavía.</p>` : ""}</div>`;
};

V.recursos = () => {
  const r = S.recursos || {}, enc = S.estado?.encargos || [], estados = S.datos?.estados_skills || {};
  return `<h1>Recursos</h1><div class="dos"><div>
    <div class="tarjeta vidrio"><h2>Cómo grabar</h2><ul class="lista pasos">${(r.grabar || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
    <div class="tarjeta vidrio seccion"><h2>Cómo sale un video</h2><ul class="lista pasos">${(r.pasos_video || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
    <div class="tarjeta vidrio seccion"><h2>Encargos para Claude</h2><p class="tenue chico">Lo que escribas aquí lo leen las sesiones de Claude y lo continúan.</p>
      ${S.editor ? `<form id="encargo"><textarea name="texto" style="min-height:80px"></textarea>
      <div class="fila" style="margin-top:8px"><select name="para" style="width:auto"><option value="matriz-redes">Matriz de Redes</option>${(r.skills || []).map((s) => `<option value="${esc(s.nombre)}">${esc(s.nombre)}</option>`).join("")}</select><button class="boton">Dejar encargo</button></div></form>` : entrarPrimero("Entra para dejar encargos.")}
      <ul class="lista seccion">${enc.map((e) => `<li style="display:block"><div class="fila"><span class="chip ${e.estado === "hecho" ? "ok" : "aviso"}">${esc(e.estado)}</span><span class="chip">${esc(e.para)}</span><span class="tenue chico">${fmt(e.fecha)}</span></div>
        <p style="margin:6px 0">${esc(e.texto)}</p>${e.respuestas.map((x) => `<p class="tenue chico">↳ ${esc(x.quien)}: ${esc(x.texto)}</p>`).join("")}</li>`).join("")}</ul></div></div>
    <div><div class="tarjeta vidrio"><h2>Skills</h2><ul class="lista">${(r.skills || []).map((s) => `<li><a href="${esc(seguro(s.repo))}" target="_blank" rel="noopener"><b>${esc(s.nombre)}</b></a><span class="tenue">${esc(s.que)}</span></li>`).join("")}</ul></div>
    <div class="tarjeta vidrio seccion"><h2>Drive y enlaces privados</h2>${S.editor ? `<ul class="lista">${(S.estado.enlaces || []).map((d) => `<li><span class="chip">${esc(d.grupo)}</span><a href="${esc(seguro(d.url))}" target="_blank" rel="noopener">${esc(d.nombre)} ↗</a></li>`).join("") || `<li class="tenue">Sin enlaces.</li>`}</ul>
      <form id="enlace" class="fila" style="margin-top:10px"><input name="nombre" placeholder="Nombre" style="flex:1;min-width:120px"><input name="url" placeholder="https://drive.google.com/…" style="flex:2;min-width:160px"><button class="boton">Agregar</button></form>` :
      `<p class="tenue chico">Carpetas: ${(r.drive || []).map((d) => esc(d.nombre)).join(" · ")}. Se ven al entrar.</p>`}</div>
    <div class="tarjeta vidrio seccion"><h2>Enlaces</h2><ul class="lista">${(r.enlaces || []).map((d) => `<li><a href="${esc(seguro(d.url))}" target="_blank" rel="noopener">${esc(d.nombre)} ↗</a></li>`).join("")}</ul></div>
    <div class="tarjeta vidrio seccion"><h2>Estado de cada skill</h2><ul class="lista">${Object.entries(estados).map(([k, e]) => `<li>${chipRed(k)}${e.error ? `<span class="tenue chico">sin estado todavía</span>` : `<span>al día: ${esc(e.actualizado)} · ${e.publicados?.length || 0} publicados</span>`}</li>`).join("") || `<li class="tenue">Se llena con la actualización diaria.</li>`}</ul></div>
    </div></div>`;
};

V.ajustes = (q) => {
  if (!S.editor) return entrarPrimero("Entra para conectar tus redes.");
  const c = S.estado.conexiones, qs = new URLSearchParams(q || ""), msg = qs.get("linkedin"), msgx = qs.get("x");
  return `<h1>Ajustes</h1>${msg ? `<div class="tarjeta vidrio"><p>${msg === "ok" ? "✅ LinkedIn quedó conectado." : "LinkedIn: " + esc(msg)}</p></div>` : ""}${msgx ? `<div class="tarjeta vidrio"><p>${msgx === "ok" ? "✅ X quedó conectado." : "X: " + esc(msgx)}</p></div>` : ""}
    <div class="dos seccion"><div class="tarjeta vidrio"><div class="fila" style="justify-content:space-between"><h2>X</h2><span class="chip ${c.x ? "ok" : ""}">${c.x ? "conectado" : "sin conectar"}</span></div>
      <p class="tenue chico">console.x.com → tu app → User authentication settings: «Read and write», «Web App» y Callback URL <code>${esc(location.origin)}/api/x/volver</code>. Pega el Client ID y el Client Secret (OAuth 2.0) y toca «Conectar X».</p>
      <form id="llaves-x2"><label>Client ID</label><input name="client_id" autocomplete="off"><label>Client Secret</label><input name="client_secret" type="password" autocomplete="off">
      <div class="fila" style="margin-top:14px"><button class="boton">Guardar app de X</button><button class="boton acento" type="button" id="conectar-x" ${c.x_app ? "" : "disabled"}>Conectar X</button>${c.x ? `<button class="boton peligro" type="button" data-borrar="x2">Desconectar</button>` : ""}</div></form>
      <details style="margin-top:14px"><summary class="tenue chico">Llaves de OAuth 1.0a (opcional)</summary><form id="llaves-x">
      <label>API Key</label><input name="api_key" autocomplete="off"><label>API Key Secret</label><input name="api_secret" type="password" autocomplete="off">
      <label>Access Token</label><input name="access_token" autocomplete="off"><label>Access Token Secret</label><input name="access_secret" type="password" autocomplete="off">
      <div class="fila" style="margin-top:14px"><button class="boton">Guardar llaves</button><button class="boton peligro" type="button" data-borrar="x">Borrar</button></div></form></details></div>
    <div class="tarjeta vidrio"><div class="fila" style="justify-content:space-between"><h2>LinkedIn</h2><span class="chip ${c.linkedin ? "ok" : ""}">${c.linkedin ? "conectado" : "sin conectar"}</span></div>
      <p class="tenue chico">linkedin.com/developers → app con «Share on LinkedIn» y «Sign In with LinkedIn using OpenID Connect». En Auth agrega <code>${esc(location.origin)}/api/linkedin/volver</code>. Pega el Client ID y el Secret y conecta.</p>
      <form id="llaves-li"><label>Client ID</label><input name="client_id" autocomplete="off"><label>Client Secret</label><input name="client_secret" type="password" autocomplete="off">
      <div class="fila" style="margin-top:14px"><button class="boton">Guardar app</button><button class="boton acento" type="button" id="conectar-li" ${c.linkedin_app ? "" : "disabled"}>Conectar LinkedIn</button>
      ${c.linkedin ? `<button class="boton peligro" type="button" data-borrar="linkedin">Desconectar</button>` : ""}</div></form></div></div>
    <div class="dos seccion"><div class="tarjeta vidrio"><h2>Seguridad</h2><p class="tenue chico">Cierra la sesión en todos tus equipos.</p><button class="boton peligro" type="button" id="salir-todo">Salir de todos lados</button></div>
    <div class="tarjeta vidrio"><h2>Apariencia</h2><div class="fila"><button class="boton suave" data-tema="light">Blanco</button><button class="boton suave" data-tema="dark">Negro</button><button class="boton suave" data-tema="">Automático</button></div></div></div>`;
};

function entrarPrimero(msg) { return `<div class="vacio"><p>${esc(msg)}</p><button class="boton" data-entrar>Entrar</button></div>`; }

// ---------------------------------------------------------------- navegación, eventos y tiempo real
let vistaActual = "hoy";
function pintar() {
  const [ruta, q] = (location.hash.slice(1) || "hoy").split("?");
  const [vista, arg] = ruta.split("/");
  vistaActual = vista;
  document.querySelectorAll("nav a").forEach((a) => (a.getAttribute("href") === `#${vista === "pieza" ? "piezas" : vista}` ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $("#vista").innerHTML = (V[vista] || V.hoy)(arg || q, q);
  conectar(vista, arg);
}
function conectar(vista, arg) {
  document.querySelectorAll("[data-entrar]").forEach((b) => b.addEventListener("click", entrar));
  document.querySelectorAll("[data-tema]").forEach((b) => b.addEventListener("click", () => { const t = b.dataset.tema; try { t ? localStorage.setItem("tema", t) : localStorage.removeItem("tema"); } catch {} tema(); }));
  const ed = $("#editor");
  if (ed) {
    const actualizar = () => {
      const p = { red: ed.red.value, texto: ed.texto.value, media: ed.media.value, fecha: ed.fecha.value ? mxAISO(ed.fecha.value) : null };
      const r = revisar(p.texto, p.red);
      $("#cont").textContent = `${r.largo}${LIMITES[p.red] ? " / " + LIMITES[p.red] : ""}${p.red === "x" ? " (enlace = 23, emoji = 2)" : ""}`;
      $("#cont").classList.toggle("malo", r.e.some((x) => x.includes("caracteres")));
      $("#rev").innerHTML = r.e.map((x) => `<p class="e">✕ ${esc(x)}</p>`).join("") + r.w.map((x) => `<p class="w">⚠ ${esc(x)}</p>`).join("") || `<p class="tenue">✓ Sin errores.</p>`;
      $("#previa").innerHTML = previa(p); masLi();
    };
    ed.addEventListener("input", () => { ed.dataset.sucio = "1"; actualizar(); }); actualizar();
    ed.addEventListener("submit", (ev) => accion(ev, async () => {
      const fd = Object.fromEntries(new FormData(ed));
      fd.solo_app = !!fd.solo_app;
      fd.fecha = fd.fecha ? mxAISO(fd.fecha) : "";
      const p = await api("/api/pieza", { ...fd, id: arg !== "nueva" ? arg : undefined });
      delete ed.dataset.sucio; aviso("Guardado."); location.hash = `#pieza/${p.id}`;
    }));
    const actual = (S.estado?.piezas || []).find((x) => x.id === arg);
    const btn = (id, ruta, msg, confirmar) => $(id)?.addEventListener("click", (ev) => accion(ev, async () => {
      if (confirmar && !confirm(confirmar)) return;
      await api(`/api/pieza/${arg}/${ruta}`, {}); aviso(msg);
    }));
    $("#aprobar")?.addEventListener("click", (ev) => accion(ev, async () => {
      if (ed.dataset.sucio) return aviso("Primero guarda los cambios.");
      const cuerpo = {};
      if (actual?.estado === "fallo") {
        if (!confirm("Esta pieza falló al publicarse. ¿Ya revisaste en la red que NO salió?")) return;
        cuerpo.confirmo_que_no_salio = true;
      } else if (!confirm(actual?.fecha ? `¿Apruebas este texto? Sale el ${fmt(actual.fecha)}.` : "¿Apruebas este texto? La Matriz le pondrá la mejor hora libre.")) return;
      const p = await api(`/api/pieza/${arg}/aprobar`, cuerpo);
      aviso(p.fecha ? `Aprobada · ${p.estado === "programada" ? "sale sola" : "súbela"} el ${fmt(p.fecha)}` : "Aprobada.");
    }));
    btn("#publicar", "publicar", "Enviado a la red.", "¿Publicar ahora en la red?");
    btn("#cancelar", "cancelar", "Cancelada.", "¿Cancelar esta pieza?");
    btn("#metricas", "metricas", "Métricas leídas.");
    $("#pausa")?.addEventListener("click", (ev) => accion(ev, async () => { await api(`/api/pieza/${arg}/pausa`, { pausada: !actual?.pausada }); aviso(actual?.pausada ? "Reanudada." : "En pausa: no saldrá hasta que la reanudes."); }));
    for (const [id, salio] of [["#salio", true], ["#nosalio", false]]) $(id)?.addEventListener("click", (ev) => accion(ev, async () => {
      const url = salio ? prompt("Pega el enlace del post (opcional):") || "" : "";
      await api(`/api/pieza/${arg}/resolver`, { salio, url }); aviso("Anotado.");
    }));
    $("#copiar")?.addEventListener("click", async () => { await navigator.clipboard.writeText(ed.texto.value); aviso("Texto copiado."); });
  }
  $("#comentario")?.addEventListener("submit", (ev) => accion(ev, async () => { await api(`/api/pieza/${arg}/comentario`, Object.fromEntries(new FormData(ev.target))); aviso("Anotado."); }));
  $("#captura")?.addEventListener("submit", (ev) => accion(ev, async () => {
    const valores = {};
    for (const l of ev.target.valores.value.split("\n")) { const m = l.trim().match(/^(.+?)\s+([\d.,]+)$/); if (m) valores[aplanar(m[1]).replace(/ /g, "_")] = Number(m[2].replace(/,/g, "")); }
    await api("/api/pieza/captura", { id: arg, valores }); aviso("Métricas guardadas.");
  }));
  $("#nota")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/nota", Object.fromEntries(new FormData(ev.target))); aviso("Anotado."); }));
  $("#inspiracion")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/inspiracion", Object.fromEntries(new FormData(ev.target))); aviso("Guardada: la Matriz la analizará."); }));
  document.querySelectorAll("[data-esp]").forEach((b) => b.addEventListener("click", (ev) => accion(ev, async () => { const [t, id, e] = b.dataset.esp.split(":"); await api(`/api/${t}/${id}/espacio`, { espacio: e }); aviso("Confirmado."); })));
  document.querySelectorAll("[data-cambiar]").forEach((s) => s.addEventListener("change", (ev) => { if (!s.value) return; accion(ev, async () => { const [t, id] = s.dataset.cambiar.split(":"); await api(`/api/${t}/${id}/espacio`, { espacio: s.value }); aviso("Movida."); }); }));
  $("#enlace")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/enlace", Object.fromEntries(new FormData(ev.target))); aviso("Enlace guardado."); }));
  $("#encargo")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/encargo", Object.fromEntries(new FormData(ev.target))); aviso("Encargo guardado."); }));
  $("#llaves-x")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/llaves/x", Object.fromEntries(new FormData(ev.target))); aviso("Llaves de X guardadas."); }));
  $("#llaves-x2")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/llaves/x-app", Object.fromEntries(new FormData(ev.target))); aviso("App de X guardada."); }));
  $("#conectar-x")?.addEventListener("click", (ev) => accion(ev, async () => { const r = await api("/api/x/conectar", {}); location.href = r.url; }, false));
  $("#llaves-li")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/llaves/linkedin-app", Object.fromEntries(new FormData(ev.target))); aviso("App de LinkedIn guardada."); }));
  $("#conectar-li")?.addEventListener("click", (ev) => accion(ev, async () => { const r = await api("/api/linkedin/conectar", {}); location.href = r.url; }, false));
  $("#salir-todo")?.addEventListener("click", (ev) => accion(ev, async () => { if (!confirm("¿Cerrar la sesión en todos tus equipos?")) return; await api("/api/salir-todo", {}); aviso("Listo."); }));
  document.querySelectorAll("[data-borrar]").forEach((b) => b.addEventListener("click", (ev) => accion(ev, async () => {
    if (!confirm("¿Borrar estas credenciales del panel?")) return; await api("/api/llaves/borrar", { nombre: b.dataset.borrar }); aviso("Borradas.");
  })));
  masLi();
}
function masLi() { document.querySelectorAll(".pv-li .mas").forEach((m) => m.addEventListener("click", () => { const t = m.closest(".txt"); t.textContent = t.dataset.largo; })); }
// «2026-11-17T09:00» en hora del centro de México (sin horario de verano desde 2022: UTC−6).
const mxAISO = (local) => new Date(`${local}:00-06:00`).toISOString();
async function accion(ev, f, recargar = true) {
  ev.preventDefault();
  const b = ev.submitter || ev.currentTarget; if (b && b.tagName === "BUTTON") b.disabled = true;
  try { await f(); if (recargar) { await cargar(true); pintar(); } } catch (e) { aviso(e.message); } finally { if (b && b.tagName === "BUTTON") b.disabled = false; }
}
// Tiempo real: cada 20 s, si la pestaña está a la vista y no estás escribiendo, se actualiza sola.
setInterval(async () => {
  if (document.visibilityState !== "visible" || !S.editor) return;
  const activo = document.activeElement;
  if (activo && /INPUT|TEXTAREA|SELECT/.test(activo.tagName)) return;
  if ($("#editor")?.dataset.sucio || $("#dialogo")?.open) return;
  const antes = JSON.stringify(S.estado);
  await cargar(true);
  if (JSON.stringify(S.estado) !== antes) { const y = scrollY; pintar(); scrollTo(0, y); }
}, 20000);
async function entrar() {
  const d = $("#dialogo");
  d.innerHTML = `<form method="dialog" id="f-entrar"><h2>Entrar</h2><label>Contraseña</label><input type="password" name="clave" autocomplete="current-password" required autofocus>
    <div class="fila" style="margin-top:14px"><button class="boton" value="ok">Entrar</button><button class="boton suave" value="no" formnovalidate>Cancelar</button></div></form>`;
  d.showModal();
  $("#f-entrar").addEventListener("submit", async (ev) => {
    if (ev.submitter?.value !== "ok") return;
    ev.preventDefault();
    try { await api("/api/entrar", { clave: ev.target.clave.value }); d.close(); await cargar(); pintar(); aviso("Listo."); } catch (e) { aviso(e.message); }
  });
}
$("#sesion").addEventListener("click", async () => { if (S.editor) { await api("/api/salir", {}); await cargar(); pintar(); } else entrar(); });
function tema() { let t = null; try { t = localStorage.getItem("tema"); } catch {} t ? document.documentElement.setAttribute("data-theme", t) : document.documentElement.removeAttribute("data-theme"); }
async function alta(token) {
  const d = $("#dialogo");
  d.innerHTML = `<form id="f-alta"><h2>Crea tu contraseña</h2><p class="tenue chico">Este enlace sirve una sola vez. Usa al menos 10 caracteres.</p>
    <label>Contraseña nueva</label><input type="password" name="clave" autocomplete="new-password" minlength="10" required autofocus>
    <label>Repítela</label><input type="password" name="otra" autocomplete="new-password" minlength="10" required>
    <div class="fila" style="margin-top:14px"><button class="boton acento">Crear y entrar</button></div></form>`;
  d.showModal();
  $("#f-alta").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.clave.value !== f.otra.value) return aviso("No coinciden.");
    try { await api("/api/alta", { alta: token, clave: f.clave.value }); d.close(); history.replaceState(null, "", "#hoy"); await cargar(); pintar(); aviso("Listo."); } catch (e) { aviso(e.message); }
  });
}
window.addEventListener("hashchange", pintar);
tema();
const altaToken = location.hash.startsWith("#alta=") ? location.hash.slice(6) : null;
if (altaToken) history.replaceState(null, "", "#hoy");
await cargar();
pintar();
if (altaToken && !S.editor) alta(altaToken);

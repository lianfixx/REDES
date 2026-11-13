// Panel de la Matriz de Redes. Sin dependencias. Lee /datos.json (lo genera redes.py desde GitHub),
// /crecimiento/*.json y, con la contraseña, /api/estado (piezas, notas, encargos y conexiones en el Worker).
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ZONA = "America/Mexico_City";
const REDES = { x: "X", linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok", "instagram-historias": "Historias" };
const API_PUBLICA = ["x", "linkedin"];
const S = { datos: null, crecer: null, recursos: null, estado: null, editor: false, configurado: false };

const fmt = (iso, o = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) =>
  iso ? new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, ...o }).format(new Date(iso)) : "sin fecha";
const hoyMX = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const chipRed = (r) => `<span class="chip ${esc(r)}">${esc(REDES[r] || r)}</span>`;
const ESTADO_CHIP = { publicada: "ok", aprobada: "ok", programada: "ok", fallo: "malo", cancelada: "", "lista para aprobar": "aviso", borrador: "" };
const chipEstado = (e) => `<span class="chip ${ESTADO_CHIP[e] ?? ""}">${esc(e)}</span>`;

function aviso(t) { const a = $("#aviso"); a.textContent = t; a.classList.add("ver"); clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove("ver"), 3200); }

async function api(ruta, cuerpo) {
  const r = await fetch(ruta, cuerpo === undefined ? { credentials: "same-origin" } :
    { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({ error: `Respuesta inválida (${r.status})` }));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}
async function cargar() {
  const leer = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  [S.datos, S.crecer, S.recursos] = await Promise.all([leer("datos.json"), leer("crecimiento/redes.json"), leer("crecimiento/recursos.json")]);
  try { const s = await api("/api/sesion"); S.editor = s.editor; S.configurado = s.configurado; } catch { S.editor = false; }
  if (S.editor) { try { S.estado = await api("/api/estado"); } catch (e) { aviso(e.message); } }
  $("#sesion").textContent = S.editor ? "Salir" : "Entrar";
}

// ---------------------------------------------------------------- reglas de texto (las mismas del Worker)
const PROHIBIDAS = ["lo hizo una ia", "lo armo una ia", "lo edito una ia", "lo escribio una ia", "generado por ia", "generado con ia",
  "hecho por ia", "hecho por una ia", "creado por ia", "creado por una ia", "texto de ia", "nadie lo edito"];
const aplanar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).join(" ");
const URL_RE = /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|mx|org|net|site|dev|io|ai)(?:\/\S*)?/gi;
function largoX(t) {
  let total = 0;
  const sin = String(t || "").normalize("NFC").replace(URL_RE, () => { total += 23; return ""; });
  for (const ch of sin) { const o = ch.codePointAt(0); if ([0x200d, 0xfe0f, 0xfe0e].includes(o) || (o >= 0x1f3fb && o <= 0x1f3ff)) continue; total += o > 0x10ff && !(o >= 0x2000 && o <= 0x206f) ? 2 : 1; }
  return total;
}
const LIMITES = { x: 280, linkedin: 3000, instagram: 2200, tiktok: 4000 };
function revisar(texto, red) {
  const e = [], w = [], plano = ` ${aplanar(texto)} `;
  for (const f of PROHIBIDAS) if (plano.includes(` ${f} `)) e.push(`«${f}»: ninguna pieza dice que la hizo una IA.`);
  if (/\b(castorena|indep)\b/.test(plano)) e.push("Nombra al despacho o a un cliente.");
  if (/(comenta|escribe) \S+ (y|para) (te|les) (mando|paso|envio)/.test(plano)) e.push("Anzuelo de interacción: las redes lo castigan.");
  const largo = red === "x" ? largoX(texto) : [...String(texto || "")].length;
  if (LIMITES[red] && largo > LIMITES[red]) e.push(`Pasa de ${LIMITES[red]} caracteres.`);
  if (red === "linkedin" && [...String(texto || "").split("\n")[0]].length > 140) w.push("La primera línea pasa de 140 caracteres (se corta antes de «ver más»).");
  if (red === "x" && /#\w/.test(texto)) w.push("En X los hashtags no suman.");
  return { e, w, largo };
}

// ---------------------------------------------------------------- vistas previas
function enlazar(t) { return esc(t).replace(URL_RE, (u) => `<span class="lnk">${u}</span>`); }
const HOSTS_MEDIA = ["drive.google.com", "lh3.googleusercontent.com", "pbs.twimg.com", "media.licdn.com"];
const seguro = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
const mediaPermitida = (u) => { try { return HOSTS_MEDIA.includes(new URL(u).hostname); } catch { return false; } };
function media(m) {
  if (!m) return "";
  if (!mediaPermitida(m)) return `<div class="pv-media">Archivo: ${esc(m)}</div>`;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(m)) return `<div class="pv-media"><video src="${esc(m)}" muted playsinline controls></video></div>`;
  if (/^https:\/\//.test(m)) return `<div class="pv-media"><img src="${esc(m)}" alt=""></div>`;
  return `<div class="pv-media">${esc(m)}</div>`;
}
function previaX(p, oscuro) {
  return `<div class="pv-x ${oscuro ? "oscuro" : ""}"><div class="cab"><div class="av">EG</div><div style="min-width:0;flex:1">
    <div><span class="nom">Emiliano García Milla</span> <span class="usr">@emilianomilla_ · ${p.fecha ? fmt(p.fecha, { day: "numeric", month: "short" }) : "ahora"}</span></div>
    <div class="txt">${enlazar(p.texto)}</div>${media(p.media)}
    <div class="acc"><span>💬</span><span>🔁</span><span>♡</span><span>📊</span><span>🔖 ↗</span></div></div></div></div>`;
}
function previaLi(p) {
  const t = String(p.texto || ""), corto = t.length > 210 ? t.slice(0, 210).replace(/\s+\S*$/, "") : t;
  return `<div class="pv-li"><div class="cab"><div class="av">EG</div><div><div class="nom">Emiliano García Milla</div>
    <div class="tit">Abogado | Maestría en Alta Dirección (en curso) | IA + Derecho</div><div class="tit">Ahora · 🌐</div></div></div>
    <div class="txt" data-largo="${esc(t)}">${esc(corto)}${t.length > corto.length ? `<span class="mas">… más</span>` : ""}</div>${media(p.media)}
    <div class="reac"><span>👍 Recomendar</span><span>💬 Comentar</span><span>🔁 Compartir</span><span>✈️ Enviar</span></div></div>`;
}
function previaTel(p, red) {
  const ok = p.media && mediaPermitida(p.media);
  const m = ok && /\.(mp4|mov|webm)(\?|$)/i.test(p.media) ? `<video src="${esc(p.media)}" muted playsinline loop autoplay></video>` :
    ok ? `<img src="${esc(p.media)}" alt="">` : "";
  return `<div class="telefono"><div class="pantalla">${m}<div class="pie"><b>${red === "tiktok" ? "@emilianomilla_" : "emilianomilla_"}</b>${esc(p.texto)}</div></div></div>`;
}
const previa = (p) => p.red === "x" ? `${previaX(p)}<div style="height:12px"></div>${previaX(p, true)}` : p.red === "linkedin" ? previaLi(p) : previaTel(p, p.red);

// ---------------------------------------------------------------- vistas
const V = {};
V.hoy = () => {
  const d = S.datos || {}, piezas = S.estado?.piezas || [];
  const porAprobar = piezas.filter((p) => p.estado === "lista para aprobar");
  const pend = d.pendientes_emi || [];
  const semana = (d.semana || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  return `<section class="saludo vidrio"><h1>Hola, Emi.</h1>
    <p class="tenue">${fmt(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long" })} · lo que sale, lo que falta y lo que funciona, en un solo lugar.</p>
    <div class="cifras"><div class="cifra"><b>${pend.length + porAprobar.length}</b><span>pendientes tuyos</span></div>
    <div class="cifra"><b>${semana.length}</b><span>piezas esta semana</span></div>
    <div class="cifra"><b>${piezas.filter((p) => p.estado === "publicada").length}</b><span>publicadas desde el panel</span></div>
    <div class="cifra"><b>${(d.ideas || []).filter((i) => !["cerrada", "descartada"].includes(i.estado)).length}</b><span>ideas abiertas</span></div></div></section>
    <div class="dos"><div class="tarjeta vidrio"><h2>Lo que necesito de ti</h2><ul class="lista">
      ${porAprobar.map((p) => `<li>${chipRed(p.red)}<a href="#pieza/${p.id}">Aprobar: ${esc(p.titulo || p.texto.slice(0, 60))}</a></li>`).join("")}
      ${pend.map((t) => `<li><span class="chip aviso">Tú</span><span>${esc(t)}</span></li>`).join("") || (porAprobar.length ? "" : `<li class="tenue">Nada pendiente. 🎉</li>`)}
    </ul></div>
    <div class="tarjeta vidrio"><h2>Esta semana</h2><ul class="lista">
      ${semana.map((i) => `<li>${chipRed(i.red)}<span><b>${fmt(i.fecha)}</b> · ${esc(i.titulo)}</span> ${chipEstado(i.estado)}</li>`).join("") || `<li class="tenue">Nada programado esta semana.</li>`}
    </ul></div></div>
    ${(d.avisos || []).length ? `<div class="tarjeta vidrio seccion"><h2>Avisos</h2><ul class="lista">${d.avisos.map((a) => `<li><span class="chip malo">!</span>${esc(a)}</li>`).join("")}</ul></div>` : ""}
    <div class="tarjeta vidrio seccion"><h2>Próximas</h2><ul class="lista">${(d.proximas || []).map((i) => `<li>${chipRed(i.red)}<span><b>${fmt(i.fecha)}</b> · ${esc(i.titulo)}</span> ${chipEstado(i.estado)}</li>`).join("") || `<li class="tenue">Sin próximas.</li>`}</ul></div>`;
};

V.piezas = () => {
  if (!S.editor) return entrarPrimero("Las piezas (textos listos para aprobar y publicar) son privadas.");
  const ps = S.estado.piezas.filter((p) => p.estado !== "cancelada");
  return `<div class="fila" style="justify-content:space-between;margin-bottom:16px"><h1>Piezas</h1><a class="boton acento" href="#pieza/nueva">Nueva pieza</a></div>
    <div class="rejilla">${ps.map((p) => `<a class="pieza vidrio" style="text-decoration:none;display:block" href="#pieza/${p.id}">
      <div class="fila">${chipRed(p.red)} ${chipEstado(p.estado)} <span class="tenue chico">${p.fecha ? fmt(p.fecha) : "sin fecha"}</span></div>
      <h3 style="margin-top:8px">${esc(p.titulo || "Sin título")}</h3><div class="txt">${esc(p.texto)}</div></a>`).join("") ||
      `<div class="vacio vidrio">Aún no hay piezas. Las skills las dejan aquí listas para aprobar, o crea una.</div>`}</div>`;
};

V.pieza = (id) => {
  if (!S.editor) return entrarPrimero("Entra para ver y editar piezas.");
  const p = id === "nueva" ? { red: "x", texto: "", titulo: "", estado: "borrador", historial: [] } : S.estado.piezas.find((x) => x.id === id);
  if (!p) return `<div class="vacio vidrio">No existe esa pieza.</div>`;
  const fechaLocal = p.fecha ? new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA, dateStyle: "short", timeStyle: "short" }).format(new Date(p.fecha)).replace(" ", "T") : "";
  const publicable = API_PUBLICA.includes(p.red) && !p.solo_app;
  return `<a href="#piezas" class="tenue chico">← Piezas</a><div class="dos" style="margin-top:10px">
    <form id="editor" class="tarjeta vidrio"><h2>${id === "nueva" ? "Nueva pieza" : esc(p.titulo || "Pieza")}</h2>
      <div class="fila">${chipEstado(p.estado)} ${p.aprobado ? `<span class="chip ok">aprobada ${fmt(p.aprobado.fecha)} · ${esc(p.aprobado_huella)}</span>` : ""}
        ${p.publicada?.url ? `<a class="chip ok" href="${esc(seguro(p.publicada.url))}" target="_blank" rel="noopener">ver publicada ↗</a>` : ""}</div>
      ${p.error ? `<p class="revision"><span class="e">${esc(p.error)}</span></p>` : ""}
      <label>Red</label><select name="red">${Object.entries(REDES).filter(([k]) => k !== "instagram-historias").map(([k, v]) => `<option value="${k}" ${k === p.red ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label>Título interno</label><input name="titulo" value="${esc(p.titulo)}" maxlength="120" placeholder="Ej.: Lanzamiento · Matriz">
      <label>Texto</label><textarea name="texto" spellcheck="true">${esc(p.texto)}</textarea><div class="contador" id="cont"></div>
      <div class="revision" id="rev"></div>
      <label>Fecha y hora (centro de México)</label><input type="datetime-local" name="fecha" value="${fechaLocal}">
      <label>Imagen o video (enlace https de Drive, opcional; X y LinkedIn por ahora publican solo texto)</label><input name="media" value="${esc(p.media)}" placeholder="https://…">
      <label>Nota</label><input name="nota" value="${esc(p.nota)}" maxlength="600">
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="solo_app" value="1" ${p.solo_app ? "checked" : ""} style="width:auto"> Lleva video o archivo: se publica desde la app</label>
      <div class="fila" style="margin-top:16px">
        <button class="boton" name="guardar">Guardar</button>
        ${id !== "nueva" ? `<button class="boton acento" type="button" id="aprobar" ${["publicada", "publicando"].includes(p.estado) ? "disabled" : ""}>Aprobar este texto</button>
        ${publicable ? `<button class="boton" type="button" id="publicar" ${["aprobada", "programada"].includes(p.estado) ? "" : "disabled"}>Publicar ahora</button>` : ""}
        ${p.estado === "publicando" ? `<button class="boton suave" type="button" id="salio">Sí salió</button><button class="boton suave" type="button" id="nosalio">No salió</button>` : ""}
        ${p.estado === "aprobada" && !publicable ? `<button class="boton acento" type="button" id="salio">Ya la publiqué</button>` : ""}
        <button class="boton suave" type="button" id="copiar">Copiar texto</button>
        ${p.red === "x" && p.publicada?.id ? `<button class="boton suave" type="button" id="metricas">Leer métricas</button>` : ""}
        <button class="boton peligro" type="button" id="cancelar">Cancelar</button>` : ""}
      </div>
      <p class="tenue chico" style="margin-top:12px">${publicable ? "Al aprobar, se publica a su hora por la API oficial. Si cambias el texto, la red, la hora o el archivo, hay que volver a aprobar." : (p.solo_app ? "Esta pieza lleva video: aprueba, copia el texto, súbela desde la app con su video y marca «Ya la publiqué»." : "Esta red aún no publica por API: aprueba, copia el texto, publícalo desde la app y marca «Ya la publiqué».")}</p>
    </form>
    <div><div class="previa" id="previa">${previa(p)}</div>
      ${p.metricas ? `<div class="tarjeta vidrio seccion"><h3>Métricas · ${esc(p.metricas.fuente)} · ${fmt(p.metricas.fecha)}</h3>${tablaValores(p.metricas.valores)}</div>` : ""}
      ${id !== "nueva" && p.estado === "publicada" ? capturaForm(p) : ""}
      ${(p.historial || []).length ? `<div class="tarjeta vidrio seccion"><h3>Historial</h3><ul class="lista">${p.historial.map((h) => `<li><span class="tenue chico">${fmt(h.fecha)}</span> ${esc(h.quien)}: ${esc(h.que)}</li>`).join("")}</ul></div>` : ""}
    </div></div>`;
};
const tablaValores = (v) => `<table>${Object.entries(v || {}).map(([k, n]) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td><b>${Number(n).toLocaleString("es-MX")}</b></td></tr>`).join("")}</table>`;
const capturaForm = (p) => `<form id="captura" class="tarjeta vidrio seccion"><h3>Anotar métricas de la app</h3>
  <p class="tenue chico">Copia los números tal como los da ${esc(REDES[p.red])} (una línea por dato: <i>impresiones 1200</i>).</p>
  <textarea name="valores" style="min-height:100px" placeholder="impresiones 1200&#10;comentarios 8&#10;seguidores_ganados 3"></textarea>
  <button class="boton" style="margin-top:10px">Guardar métricas</button></form>`;

function semanaDe(fechaISO) { const d = new Date(fechaISO + "T12:00:00"); const l = new Date(d); l.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return l; }
V.calendario = (q) => {
  const base = semanaDe(new URLSearchParams(q || "").get("desde") || hoyMX());
  const dias = [...Array(7)].map((_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d.toISOString().slice(0, 10); });
  const items = [...(S.datos?.calendario || []).map((i) => ({ ...i, origen: "plan" })),
    ...(S.estado?.piezas || []).filter((p) => p.fecha && p.estado !== "cancelada").map((p) => ({ ...p, titulo: p.titulo || p.texto.slice(0, 40), origen: "pieza" }))];
  const enDia = (d) => items.filter((i) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(i.fecha)) === d).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const mover = (n) => { const d = new Date(base); d.setDate(d.getDate() + 7 * n); return d.toISOString().slice(0, 10); };
  return `<div class="fila" style="justify-content:space-between;margin-bottom:16px"><h1>Calendario</h1><div class="fila">
    <a class="boton suave" href="#calendario?desde=${mover(-1)}">←</a><a class="boton suave" href="#calendario">Hoy</a><a class="boton suave" href="#calendario?desde=${mover(1)}">→</a></div></div>
    <div class="calendario">${dias.map((d) => `<div class="dia vidrio ${d === hoyMX() ? "hoy" : ""}"><h3>${fmt(d + "T12:00:00-06:00", { weekday: "long", day: "numeric", month: "short" })}</h3>
    ${enDia(d).map((i) => `<${i.origen === "pieza" ? `a href="#pieza/${i.id}"` : "div"} class="ev" style="display:block;text-decoration:none">${fmt(i.fecha, { hour: "2-digit", minute: "2-digit" })} ${chipRed(i.red)}<div>${esc(i.titulo)}</div><span class="tenue chico">${esc(i.estado)}</span></${i.origen === "pieza" ? "a" : "div"}>`).join("") || `<p class="tenue chico">—</p>`}</div>`).join("")}</div>
    <p class="tenue chico seccion">Topes por red (los declara cada skill): ${Object.entries(S.datos?.redes || {}).map(([k, r]) => `${REDES[k] || k}: ${r.cadencia.max_por_dia}/día, ${r.cadencia.max_por_semana}/semana${r.cadencia.separacion_min_h ? `, ${r.cadencia.separacion_min_h} h entre piezas` : ""}`).join(" · ")}</p>`;
};

V.ideas = () => {
  const ideas = S.datos?.ideas || [], notas = S.estado?.notas || [];
  return `<div class="dos"><div><h1>Ideas</h1>
    ${S.editor ? `<form id="nota" class="tarjeta vidrio"><label>Anota una idea, un truco o algo que viste</label><textarea name="texto" style="min-height:90px"></textarea>
      <div class="fila" style="margin-top:8px"><select name="tipo" style="width:auto"><option value="idea">Idea</option><option value="truco">Truco</option><option value="tendencia">Tendencia</option><option value="leccion">Lección</option></select>
      <select name="red" style="width:auto"><option value="todas">Todas las redes</option>${Object.entries(REDES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <button class="boton">Guardar</button></div></form>` : entrarPrimero("Entra para anotar ideas.")}
    <div class="tarjeta vidrio seccion"><h2>Notas recientes</h2><ul class="lista">${notas.map((n) => `<li><span class="chip ${n.quien === "claude" ? "" : "aviso"}">${n.quien === "claude" ? "Matriz" : "Tú"}</span><span>${chipRed(n.red)} <b>${esc(n.tipo)}</b> · ${esc(n.texto)} <span class="tenue chico">${fmt(n.fecha)}</span></span></li>`).join("") || `<li class="tenue">Sin notas.</li>`}</ul></div></div>
    <div><h2 style="margin-top:8px">Registro de ideas (GitHub)</h2>${ideas.map((i) => `<div class="tarjeta vidrio" style="margin-bottom:12px"><div class="fila"><span class="chip">${esc(i.pilar)}</span>${chipEstado(i.estado)}<span class="tenue chico">${esc(i.fecha_alta)}</span></div>
      <p style="margin-top:8px"><b>${esc(i.tesis)}</b></p>${i.postura_emi ? `<p class="tenue">Tu postura: «${esc(i.postura_emi.texto)}»</p>` : ""}
      <p class="chico">Riesgos: jurídico ${i.riesgo_juridico?.nivel ?? "?"} · político ${i.riesgo_politico?.nivel ?? "?"} · reputacional ${i.riesgo_reputacional?.nivel ?? "?"}</p></div>`).join("") || `<div class="vacio vidrio">Sin ideas registradas.</div>`}</div></div>`;
};

V.crecer = () => {
  const c = S.crecer;
  if (!c) return `<div class="vacio vidrio">Sin datos de crecimiento.</div>`;
  const regla = (r) => `<li><span class="chip ${esc(r.certeza)}">${esc(r.certeza)}</span><span>${esc(r.regla)}</span></li>`;
  return `<h1>Crecer</h1><p class="tenue">Qué funciona en cada red, con su fuente. <span class="chip oficial">oficial</span> lo dice la plataforma o su código · <span class="chip terceros">terceros</span> estudios · <span class="chip criterio">criterio</span> hipótesis que se prueba con tus métricas. Actualizado: ${esc(c.actualizado)}.</p>
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
  const reg = S.datos?.registro || [];
  const g = S.estado?.gasto_x;
  return `<h1>Métricas</h1><p class="tenue">Cada red cuenta distinto: aquí se ven en sus propias unidades. X se lee solo a las 48 h y a los 7 días; las demás, con tu captura o tus números.</p>
    ${g ? `<div class="tarjeta vidrio"><h3>Gasto en la API de X este mes</h3><p><b>${g.usd.toFixed(3)} USD</b> de ${S.estado.tope_x} USD de tope · ${g.llamadas.length} llamadas</p></div>` : ""}
    <div class="rejilla seccion">${[...ps.map((p) => ({ red: p.red, titulo: p.titulo || p.texto.slice(0, 50), fecha: p.publicada?.fecha, m: p.metricas, url: p.publicada?.url })),
      ...reg.map((r) => ({ red: r.red, titulo: r.id, fecha: r.fecha, m: r.metricas }))].map((x) => `<div class="tarjeta vidrio"><div class="fila">${chipRed(x.red)}<span class="tenue chico">${fmt(x.fecha)}</span></div>
      <h3 style="margin-top:8px">${x.url ? `<a href="${esc(seguro(x.url))}" target="_blank" rel="noopener">${esc(x.titulo)} ↗</a>` : esc(x.titulo)}</h3>${tablaValores(x.m.valores)}<p class="tenue chico">${esc(x.m.fuente)}</p></div>`).join("") || `<div class="vacio vidrio">Aún no hay métricas. Llegan cuando se publique la primera pieza.</div>`}</div>
    <div class="tarjeta vidrio seccion"><h2>Lecciones y experimentos</h2><ul class="lista">${(S.datos?.lecciones || []).map((l) => `<li><span class="chip">${esc(l.alcance)}</span>${esc(l.regla)}</li>`).join("")}
      ${(S.datos?.experimentos || []).map((e) => `<li><span class="chip aviso">experimento</span>${esc(e.hipotesis)} · ${esc(e.estado)}</li>`).join("") || ""}</ul>
      ${!(S.datos?.lecciones || []).length && !(S.datos?.experimentos || []).length ? `<p class="tenue">Sin lecciones todavía: salen de las primeras métricas.</p>` : ""}</div>`;
};

V.recursos = () => {
  const r = S.recursos || {}, enc = S.estado?.encargos || [];
  const estados = S.datos?.estados_skills || {};
  return `<h1>Recursos</h1><div class="dos"><div>
    <div class="tarjeta vidrio"><h2>Cómo sale un video</h2><ul class="lista pasos">${(r.pasos_video || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
    <div class="tarjeta vidrio seccion"><h2>Encargos para Claude</h2><p class="tenue chico">Lo que escribas aquí lo leen las sesiones de Claude y lo continúan; sus respuestas aparecen abajo.</p>
      ${S.editor ? `<form id="encargo"><textarea name="texto" style="min-height:80px" placeholder="Ej.: prepara los textos de la semana del 23 para LinkedIn y X"></textarea>
      <div class="fila" style="margin-top:8px"><select name="para" style="width:auto"><option value="matriz-redes">Matriz de Redes</option>${(r.skills || []).map((s) => `<option value="${esc(s.nombre)}">${esc(s.nombre)}</option>`).join("")}</select><button class="boton">Dejar encargo</button></div></form>` : entrarPrimero("Entra para dejar encargos.")}
      <ul class="lista seccion">${enc.map((e) => `<li style="display:block"><div class="fila"><span class="chip ${e.estado === "hecho" ? "ok" : "aviso"}">${esc(e.estado)}</span><span class="chip">${esc(e.para)}</span><span class="tenue chico">${fmt(e.fecha)}</span></div>
        <p style="margin:6px 0">${esc(e.texto)}</p>${e.respuestas.map((x) => `<p class="tenue chico">↳ ${esc(x.quien)}: ${esc(x.texto)}</p>`).join("")}</li>`).join("")}</ul></div></div>
    <div><div class="tarjeta vidrio"><h2>Skills</h2><ul class="lista">${(r.skills || []).map((s) => `<li><a href="${esc(seguro(s.repo))}" target="_blank" rel="noopener"><b>${esc(s.nombre)}</b></a><span class="tenue">${esc(s.que)}</span></li>`).join("")}</ul></div>
    <div class="tarjeta vidrio seccion"><h2>Drive y enlaces privados</h2>${S.editor ? `<ul class="lista">${(S.estado.enlaces || []).map((d) => `<li><span class="chip">${esc(d.grupo)}</span><a href="${esc(seguro(d.url))}" target="_blank" rel="noopener">${esc(d.nombre)} ↗</a></li>`).join("") || `<li class="tenue">Sin enlaces todavía.</li>`}</ul>
      <form id="enlace" class="fila" style="margin-top:10px"><input name="nombre" placeholder="Nombre" style="flex:1;min-width:120px"><input name="url" placeholder="https://drive.google.com/…" style="flex:2;min-width:160px"><button class="boton">Agregar</button></form>` :
      `<p class="tenue chico">Carpetas: ${(r.drive || []).map((d) => esc(d.nombre)).join(" · ")}. Los enlaces se ven al entrar (no son públicos).</p>`}</div>
    <div class="tarjeta vidrio seccion"><h2>Enlaces</h2><ul class="lista">${(r.enlaces || []).map((d) => `<li><a href="${esc(seguro(d.url))}" target="_blank" rel="noopener">${esc(d.nombre)} ↗</a></li>`).join("")}</ul></div>
    <div class="tarjeta vidrio seccion"><h2>Estado de cada skill</h2><ul class="lista">${Object.entries(estados).map(([k, e]) => `<li>${chipRed(k)}${e.error ? `<span class="tenue chico">sin red/estado.json todavía</span>` : `<span>al día: ${esc(e.actualizado)} · ${e.publicados?.length || 0} publicados</span>`}</li>`).join("") || `<li class="tenue">Se llena con la actualización diaria.</li>`}</ul></div>
    ${S.editor ? `<div class="tarjeta vidrio seccion"><h2>Bitácora</h2><ul class="lista">${(S.estado.bitacora || []).slice(0, 25).map((b) => `<li><span class="tenue chico">${fmt(b.fecha)}</span> ${esc(b.quien)}: ${esc(b.que)}</li>`).join("")}</ul></div>` : ""}
    </div></div>`;
};

V.ajustes = (q) => {
  if (!S.editor) return entrarPrimero("Entra para conectar tus redes.");
  const c = S.estado.conexiones, msg = new URLSearchParams(q || "").get("linkedin");
  return `<h1>Ajustes</h1>${msg ? `<div class="tarjeta vidrio"><p>${msg === "ok" ? "✅ LinkedIn quedó conectado." : "LinkedIn: " + esc(msg)}</p></div>` : ""}
    <div class="dos seccion"><form id="llaves-x" class="tarjeta vidrio"><div class="fila" style="justify-content:space-between"><h2>X</h2><span class="chip ${c.x ? "ok" : ""}">${c.x ? "conectado" : "sin conectar"}</span></div>
      <p class="tenue chico">En console.x.com → tu app (lectura y escritura) → Keys and tokens. Se guardan cifradas y no se vuelven a mostrar.</p>
      <label>API Key</label><input name="api_key" autocomplete="off"><label>API Key Secret</label><input name="api_secret" type="password" autocomplete="off">
      <label>Access Token</label><input name="access_token" autocomplete="off"><label>Access Token Secret</label><input name="access_secret" type="password" autocomplete="off">
      <div class="fila" style="margin-top:14px"><button class="boton">Guardar llaves de X</button>${c.x ? `<button class="boton peligro" type="button" data-borrar="x">Borrar</button>` : ""}</div></form>
    <div class="tarjeta vidrio"><div class="fila" style="justify-content:space-between"><h2>LinkedIn</h2><span class="chip ${c.linkedin ? "ok" : ""}">${c.linkedin ? "conectado" : "sin conectar"}</span></div>
      <p class="tenue chico">1) En linkedin.com/developers crea una app con los productos «Share on LinkedIn» y «Sign In with LinkedIn using OpenID Connect». 2) En Auth, agrega esta dirección de regreso: <code>${esc(location.origin)}/api/linkedin/volver</code>. 3) Pega aquí el Client ID y el Secret, y conecta.</p>
      <form id="llaves-li"><label>Client ID</label><input name="client_id" autocomplete="off"><label>Client Secret</label><input name="client_secret" type="password" autocomplete="off">
      <div class="fila" style="margin-top:14px"><button class="boton">Guardar app</button><button class="boton acento" type="button" id="conectar-li" ${c.linkedin_app ? "" : "disabled"}>Conectar LinkedIn</button>
      ${c.linkedin ? `<button class="boton peligro" type="button" data-borrar="linkedin">Desconectar</button>` : ""}</div></form></div></div>
    <div class="tarjeta vidrio seccion"><h2>Seguridad</h2><p class="tenue chico">Cierra la sesión en todos tus equipos (por ejemplo, si perdiste el teléfono).</p><button class="boton peligro" type="button" id="salir-todo">Salir de todos lados</button></div>
    <div class="tarjeta vidrio seccion"><h2>Apariencia</h2><div class="fila"><button class="boton suave" data-tema="light">Claro</button><button class="boton suave" data-tema="dark">Oscuro</button><button class="boton suave" data-tema="">Automático</button></div></div>`;
};

function entrarPrimero(msg) { return `<div class="vacio vidrio"><p>${esc(msg)}</p><button class="boton" data-entrar>Entrar</button></div>`; }

// ---------------------------------------------------------------- navegación y eventos
async function pintar() {
  const [ruta, q] = (location.hash.slice(1) || "hoy").split("?");
  const [vista, arg] = ruta.split("/");
  document.querySelectorAll("nav a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#${vista === "pieza" ? "piezas" : vista}`));
  document.querySelectorAll("nav a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  const f = V[vista] || V.hoy;
  $("#vista").innerHTML = f(arg || q, q);
  conectar(vista, arg);
}
function conectar(vista, arg) {
  document.querySelectorAll("[data-entrar]").forEach((b) => b.addEventListener("click", entrar));
  document.querySelectorAll("[data-tema]").forEach((b) => b.addEventListener("click", () => { const t = b.dataset.tema; try { t ? localStorage.setItem("tema", t) : localStorage.removeItem("tema"); } catch {} tema(); }));
  const ed = $("#editor");
  if (ed) {
    const actualizar = () => {
      const p = { red: ed.red.value, texto: ed.texto.value, media: ed.media.value, fecha: ed.fecha.value ? new Date(ed.fecha.value).toISOString() : null };
      const r = revisar(p.texto, p.red);
      $("#cont").textContent = `${r.largo}${LIMITES[p.red] ? " / " + LIMITES[p.red] : ""}${p.red === "x" ? " (enlace = 23, emoji = 2)" : ""}`;
      $("#cont").classList.toggle("malo", r.e.some((x) => x.includes("caracteres")));
      $("#rev").innerHTML = r.e.map((x) => `<p class="e">✕ ${esc(x)}</p>`).join("") + r.w.map((x) => `<p class="w">⚠ ${esc(x)}</p>`).join("") || `<p class="tenue">✓ Sin errores.</p>`;
      $("#previa").innerHTML = previa(p); masLi();
    };
    ed.addEventListener("input", actualizar); actualizar();
    ed.addEventListener("submit", (ev) => accion(ev, async () => {
      const fd = Object.fromEntries(new FormData(ed));
      fd.solo_app = !!fd.solo_app;
      if (fd.fecha) fd.fecha = mxAISO(fd.fecha);
      const p = await api("/api/pieza", { ...fd, id: arg !== "nueva" ? arg : undefined });
      aviso("Guardado."); location.hash = `#pieza/${p.id}`;
    }));
    const btn = (id, ruta, msg, confirmar) => $(id)?.addEventListener("click", (ev) => accion(ev, async () => {
      if (confirmar && !confirm(confirmar)) return;
      await api(`/api/pieza/${arg}/${ruta}`, {}); aviso(msg);
    }));
    const actual = (S.estado?.piezas || []).find((x) => x.id === arg);
    $("#aprobar")?.addEventListener("click", (ev) => accion(ev, async () => {
      const cuerpo = {};
      if (actual?.estado === "fallo") {
        if (!confirm("Esta pieza falló al publicarse. ¿Ya revisaste en la red que NO salió?")) return;
        cuerpo.confirmo_que_no_salio = true;
      } else if (!confirm("¿Apruebas este texto tal cual, en esta red y a esta hora? Si tiene fecha futura, se publicará solo.")) return;
      await api(`/api/pieza/${arg}/aprobar`, cuerpo); aviso("Aprobada.");
    }));
    for (const [id, salio] of [["#salio", true], ["#nosalio", false]]) $(id)?.addEventListener("click", (ev) => accion(ev, async () => {
      const url = salio ? prompt("Pega el enlace del post (opcional):") || "" : "";
      await api(`/api/pieza/${arg}/resolver`, { salio, url }); aviso("Anotado.");
    }));
    btn("#publicar", "publicar", "Enviado a la red.", "¿Publicar ahora en la red?");
    btn("#cancelar", "cancelar", "Cancelada.", "¿Cancelar esta pieza?");
    btn("#metricas", "metricas", "Métricas leídas.");
    $("#copiar")?.addEventListener("click", async () => { await navigator.clipboard.writeText(ed.texto.value); aviso("Texto copiado."); });
  }
  $("#captura")?.addEventListener("submit", (ev) => accion(ev, async () => {
    const valores = {};
    for (const l of ev.target.valores.value.split("\n")) { const m = l.trim().match(/^(.+?)\s+([\d.,]+)$/); if (m) valores[aplanar(m[1]).replace(/ /g, "_")] = Number(m[2].replace(/,/g, "")); }
    await api("/api/pieza/captura", { id: arg, valores }); aviso("Métricas guardadas.");
  }));
  $("#nota")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/nota", Object.fromEntries(new FormData(ev.target))); aviso("Anotado."); }));
  $("#enlace")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/enlace", Object.fromEntries(new FormData(ev.target))); aviso("Enlace guardado."); }));
  $("#encargo")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/encargo", Object.fromEntries(new FormData(ev.target))); aviso("Encargo guardado."); }));
  $("#llaves-x")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/llaves/x", Object.fromEntries(new FormData(ev.target))); aviso("Llaves de X guardadas."); }));
  $("#llaves-li")?.addEventListener("submit", (ev) => accion(ev, async () => { await api("/api/llaves/linkedin-app", Object.fromEntries(new FormData(ev.target))); aviso("App de LinkedIn guardada."); }));
  $("#conectar-li")?.addEventListener("click", (ev) => accion(ev, async () => { const r = await api("/api/linkedin/conectar", {}); location.href = r.url; }, false));
  $("#salir-todo")?.addEventListener("click", (ev) => accion(ev, async () => { if (!confirm("¿Cerrar la sesión en todos tus equipos?")) return; await api("/api/salir-todo", {}); aviso("Listo."); }));
  document.querySelectorAll("[data-borrar]").forEach((b) => b.addEventListener("click", (ev) => accion(ev, async () => {
    if (!confirm("¿Borrar estas credenciales del panel?")) return; await api("/api/llaves/borrar", { nombre: b.dataset.borrar }); aviso("Borradas.");
  })));
  masLi();
}
function masLi() { document.querySelectorAll(".pv-li .mas").forEach((m) => m.addEventListener("click", () => { const t = m.closest(".txt"); t.textContent = t.dataset.largo; })); }
function mxAISO(local) {
  // «2026-11-17T09:00» en hora del centro de México (sin horario de verano desde 2022: UTC−6).
  return new Date(`${local}:00-06:00`).toISOString();
}
async function accion(ev, f, recargar = true) {
  ev.preventDefault();
  const b = ev.submitter || ev.currentTarget; if (b) b.disabled = true;
  try { await f(); if (recargar) { await cargar(); pintar(); } } catch (e) { aviso(e.message); } finally { if (b) b.disabled = false; }
}
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
$("#sesion").addEventListener("click", async () => {
  if (S.editor) { await api("/api/salir", {}); S.estado = null; await cargar(); pintar(); } else entrar();
});
function tema() { let t = null; try { t = localStorage.getItem("tema"); } catch {} t ? document.documentElement.setAttribute("data-theme", t) : document.documentElement.removeAttribute("data-theme"); }
async function alta(token) {
  const d = $("#dialogo");
  d.innerHTML = `<form id="f-alta"><h2>Crea tu contraseña</h2><p class="tenue chico">Este enlace sirve una sola vez. Usa al menos 10 caracteres; guárdala en tu llavero del iPhone.</p>
    <label>Contraseña nueva</label><input type="password" name="clave" autocomplete="new-password" minlength="10" required autofocus>
    <label>Repítela</label><input type="password" name="otra" autocomplete="new-password" minlength="10" required>
    <div class="fila" style="margin-top:14px"><button class="boton acento">Crear y entrar</button></div></form>`;
  d.showModal();
  $("#f-alta").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.clave.value !== f.otra.value) return aviso("No coinciden.");
    try { await api("/api/alta", { alta: token, clave: f.clave.value }); d.close(); history.replaceState(null, "", "#hoy"); await cargar(); pintar(); aviso("Listo: ya puedes entrar con tu contraseña."); }
    catch (e) { aviso(e.message); }
  });
}
window.addEventListener("hashchange", pintar);
tema();
const altaToken = location.hash.startsWith("#alta=") ? location.hash.slice(6) : null;
if (altaToken) history.replaceState(null, "", "#hoy");
await cargar();
pintar();
if (altaToken && !S.editor) alta(altaToken);

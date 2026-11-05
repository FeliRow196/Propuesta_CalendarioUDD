'use strict';
/**
 * Motor de reglas de "Mi Semana" (portado del prototipo web Mejora_miudd).
 * Funciones puras: reciben bloques y preferencias, devuelven propuestas y alertas.
 * Los minutos se cuentan desde las 00:00 (ej. 08:30 = 510).
 */
// Sin dependencias de Node: el mismo archivo se usa en la app móvil (modo local).
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const t = (h, m = 0) => h * 60 + m;
const fmt = (m) => {
  m = Math.max(0, Math.min(1439, Math.round(m)));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
const parseT = (s) => {
  const [h, m] = String(s || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};
const dur = (m) => {
  const h = Math.floor(m / 60), mi = m % 60;
  return h ? (mi ? `${h} h ${mi} min` : `${h} h`) : `${mi} min`;
};

// Igual que Mi UDD, la semana va de lunes a sábado (sin domingo)
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const NUM_DIAS = DAYS.length;
const SPOTS = [
  'Punto Pausa QR · Patio central',
  'Punto Pausa QR · Biblioteca',
  'Punto Pausa QR · Casino',
  'Punto Pausa QR · Jardín',
];

const DEFAULT_PREFS = {
  wake: '06:45', sleepHours: 7, modoCertamen: true,
  lunchTime: '13:00', lunchMin: 45,
  pauseMin: 10, pausesPerDay: 2, // 10 min = el recreo entre módulos
  exerciseType: 'Caminar', exerciseMin: 30, exerciseDays: 3,
  priorities: ['descanso', 'alimentacion', 'pausas', 'actividad'],
};

/** Nivel que cursa el estudiante de ejemplo (segundo semestre de Ingeniería Informática). */
const NIVEL_DEMO = 2;

// Módulos UDD: 1 h 10 min cada uno, con 10 min de recreo entre módulos, desde las 08:30
const MODULOS = [t(8, 30), t(9, 50), t(11, 10), t(12, 30), t(13, 50), t(15, 10), t(16, 30), t(17, 50)];
const DURACION_MODULO = 70;
/** Clase en el módulo n (1 = 08:30–09:40 … 8 = 17:50–19:00). */
const modulo = (day, n, place) => ({ day, start: MODULOS[n - 1], end: MODULOS[n - 1] + DURACION_MODULO, place });

/**
 * Ramos reales de la malla (sin Créditos Extra Disciplinares). Es el mismo catálogo que se carga
 * en Firestore (colección "ramos"); esta copia se usa si no hay conexión.
 * Las salas y horarios de Nivel 2 son de ejemplo para el prototipo; algunos ramos tienen
 * dos módulos seguidos (por ejemplo, Cálculo Diferencial el lunes).
 */
const RAMOS = [
  { id: 'introduccion-vida-universitaria', nombre: 'Introducción a la Vida Universitaria', nivel: 1, orden: 1 },
  { id: 'desafios-ingenieria-informatica', nombre: 'Desafíos de la Ingeniería Informática', nivel: 1, orden: 2 },
  { id: 'algebra', nombre: 'Álgebra', nivel: 1, orden: 3 },
  { id: 'introduccion-calculo', nombre: 'Introducción al Cálculo', nivel: 1, orden: 4 },
  { id: 'taller-programacion', nombre: 'Taller de Programación', nivel: 1, orden: 5 },
  { id: 'ingles-a2-menos', nombre: 'Inglés Nivel A2-', nivel: 1, orden: 6 },
  { id: 'comunicacion-escrita', nombre: 'Comunicación Escrita', nivel: 1, orden: 7 },
  { id: 'comunicacion-oral', nombre: 'Comunicación Oral', nivel: 1, orden: 8 },
  { id: 'calculo-diferencial', nombre: 'Cálculo Diferencial', nivel: 2, orden: 1,
    clases: [modulo(0, 1, 'Sala 204'), modulo(0, 2, 'Sala 204'), modulo(2, 2, 'Sala 204')] },
  { id: 'geometria', nombre: 'Geometría', nivel: 2, orden: 2,
    clases: [modulo(1, 1, 'Sala 210'), modulo(3, 1, 'Sala 210')] },
  { id: 'bootcamp-lenguajes-programacion', nombre: 'Bootcamp Lenguajes de Programación', nivel: 2, orden: 3,
    clases: [modulo(0, 3, 'Lab. Computación'), modulo(1, 2, 'Lab. Computación'), modulo(1, 3, 'Lab. Computación'),
      modulo(3, 2, 'Lab. Computación'), modulo(3, 3, 'Lab. Computación')] },
  { id: 'taller-obtencion-preparacion-datos', nombre: 'Taller de Obtención y Preparación de Datos', nivel: 2, orden: 4,
    clases: [modulo(0, 6, 'Lab. Computación'), modulo(3, 4, 'Lab. Computación'), modulo(3, 5, 'Lab. Computación')] },
  { id: 'ingles-a2-mas', nombre: 'Inglés Nivel A2+', nivel: 2, orden: 5,
    clases: [modulo(0, 4, 'Sala 105'), modulo(2, 3, 'Sala 105'), modulo(3, 7, 'Sala 105')] },
  { id: 'taller-habilidades-autogestion', nombre: 'Taller de Habilidades Para la Autogestión', nivel: 2, orden: 6,
    clases: [modulo(1, 7, 'Sala 108')] },
  { id: 'lectura-critica', nombre: 'Lectura Crítica', nivel: 2, orden: 7,
    clases: [modulo(1, 6, 'Sala 301')] },
  { id: 'pensamiento-critico', nombre: 'Pensamiento Crítico', nivel: 2, orden: 8,
    clases: [modulo(3, 6, 'Sala 301'), modulo(4, 3, 'Sala 301')] },
];

/**
 * Semana de ejemplo: solo las clases UDD (desde los ramos del nivel).
 * No hay actividades personales (privacidad) ni certámenes (se ven aparte).
 */
function seedBlocks(ramos = RAMOS, nivel = NIVEL_DEMO) {
  const B = [];
  const add = (day, s, e, title, type, place = '', ramoId) => B.push({
    id: nid(), day, start: s, end: e, title, type, place,
    fixed: type === 'clase' || type === 'certamen',
    source: type === 'clase' || type === 'certamen' ? 'udd' : 'user',
    ...(ramoId ? { ramoId } : {}),
  });
  for (const r of ramos.filter((x) => x.nivel === nivel)) {
    // Solo lunes a sábado (si el catálogo de Firestore trae un domingo, se ignora)
    (r.clases || []).filter((c) => c.day >= 0 && c.day < NUM_DIAS).forEach((c) => add(c.day, c.start, c.end, r.nombre, 'clase', c.place, r.id));
  }
  return B;
}

/* ---------- utilidades de horario ---------- */
const winStart = (d) => (d >= 5 ? t(9) : t(7));

function gapsFrom(items, ws, we) {
  const iv = items
    .map((b) => ({ s: Math.max(ws, b.start), e: Math.min(we, b.end) }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s);
  const out = [];
  let cur = ws;
  for (const x of iv) {
    if (x.s > cur) out.push({ start: cur, end: x.s });
    cur = Math.max(cur, x.e);
  }
  if (cur < we) out.push({ start: cur, end: we });
  return out.filter((g) => g.end - g.start >= 5);
}

const dayBlocks = (blocks, d) =>
  blocks.filter((b) => b.day === d).sort((a, b) => a.start - b.start || a.end - b.end);

const loadOf = (blocks, d) =>
  blocks.filter((b) => b.day === d && b.type !== 'cuidado').reduce((a, b) => a + (b.end - b.start), 0);

const hasCert = (blocks, d) => d >= 0 && d < NUM_DIAS && blocks.some((b) => b.day === d && b.type === 'certamen');

/** Nivel de carga del día: ok < 6 h, mid < 9 h, high en adelante. */
const loadLevel = (m) => (m < 360 ? 'ok' : m < 540 ? 'mid' : 'high');

function overlapsOf(blocks, d) {
  const items = dayBlocks(blocks, d);
  const pairs = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (items[j].start < items[i].end && items[i].start < items[j].end) pairs.push([items[i], items[j]]);
  return pairs;
}

/**
 * Genera propuestas de autocuidado y alertas de la semana.
 * @returns {{proposals: object[], conflicts: object[]}}
 */
function generate(blocks, prefs) {
  const P = { ...DEFAULT_PREFS, ...prefs };
  const props = [];
  const conflicts = [];
  const temp = blocks.map((b) => ({ ...b }));
  const free = (d, ws, we) => gapsFrom(temp.filter((b) => b.day === d), ws, we);
  const nb = (d, s, e) => {
    const it = temp.filter((b) => b.day === d);
    const prev = it.filter((b) => b.end <= s).sort((a, b) => b.end - a.end)[0];
    const next = it.filter((b) => b.start >= e).sort((a, b) => a.start - b.start)[0];
    return { prev, next };
  };
  const gapWhy = (d, g) => {
    const { prev, next } = nb(d, g.start, g.end);
    if (prev && next && prev.title === next.title) return `Tienes ${dur(g.end - g.start)} de recreo entre los dos módulos de «${prev.title}».`;
    if (prev && next) return `Tienes ${dur(g.end - g.start)} libres entre «${prev.title}» y «${next.title}».`;
    if (prev) return `Quedas libre después de «${prev.title}».`;
    if (next) return `Tienes tiempo antes de «${next.title}».`;
    return 'Tu día tiene espacio libre aquí.';
  };
  const push = (d, s, e, title, cat, place, reason) => {
    const p = { id: nid(), day: d, start: s, end: e, title, cat, place, reason, status: 'pending' };
    props.push(p);
    temp.push({ ...p, type: 'cuidado' });
  };
  const hasCat = (d, c) => blocks.some((b) => b.day === d && b.type === 'cuidado' && b.cat === c);

  // 1) Detección de conflictos y sobrecarga
  for (let d = 0; d < NUM_DIAS; d++) {
    overlapsOf(blocks, d).forEach(([a, b]) =>
      conflicts.push({ day: d, level: 'alta', text: `«${a.title}» se cruza con «${b.title}» (${fmt(b.start)}).` }));
    const L = loadOf(blocks, d);
    if (L >= 600) conflicts.push({ day: d, level: 'alta', text: `Día sobrecargado: ${dur(L)} de clases.` });
    else if (L >= 480) conflicts.push({ day: d, level: 'media', text: `Día exigente: ${dur(L)} ocupado.` });

    const iv = dayBlocks(blocks, d).filter((b) => b.type !== 'cuidado');
    let s = null, e = null, best = 0, bs = 0, be = 0;
    for (const b of iv) {
      if (s === null || b.start - e >= 15) { s = b.start; e = b.end; } else e = Math.max(e, b.end);
      if (e - s > best) { best = e - s; bs = s; be = e; }
    }
    if (best > 240) conflicts.push({ day: d, level: 'media', text: `${dur(best)} de clases seguidas, solo con recreos de 10 min (${fmt(bs)}–${fmt(be)}).` });
  }

  // 2) Propuestas según el orden de prioridades del estudiante
  const bed = Math.min(1440, 1440 + parseT(P.wake) - Math.round(P.sleepHours * 60));
  for (const cat of P.priorities) {
    if (cat === 'descanso') {
      for (let d = 0; d < NUM_DIAS; d++) {
        const last = dayBlocks(blocks, d).filter((b) => b.type !== 'cuidado').pop();
        if (last && last.end > bed - 60)
          conflicts.push({ day: d, level: 'media', text: `Terminas a las ${fmt(last.end)}: te queda poco tiempo para desconectarte antes de dormir.` });
        if (P.modoCertamen && hasCert(blocks, d + 1) && !hasCat(d, 'descanso')) {
          const c = dayBlocks(blocks, d + 1).find((b) => b.type === 'certamen');
          const g = free(d, bed - 30, bed).find((g) => g.end - g.start >= 20);
          if (g) push(d, g.start, g.end, 'Desconexión y a dormir', 'descanso', 'Casa',
            `Mañana tienes «${c.title}» a las ${fmt(c.start)}. Dormir ${P.sleepHours} h te ayuda más que una hora extra de repaso.`);
        }
      }
    }
    if (cat === 'alimentacion') {
      for (let d = 0; d < NUM_DIAS; d++) {
        if (loadOf(blocks, d) === 0 || hasCat(d, 'alimentacion')) continue;
        const gs = free(d, t(12), t(15));
        const want = parseT(P.lunchTime);
        const g = gs.find((g) => g.end - g.start >= P.lunchMin);
        if (g) {
          const s = Math.min(Math.max(want, g.start), g.end - P.lunchMin);
          push(d, s, s + P.lunchMin, 'Almuerzo', 'alimentacion', 'Casino o donde prefieras', gapWhy(d, g));
          continue;
        }
        const big = gs.filter((g) => g.end - g.start >= 20).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
        if (big) {
          const L = Math.min(big.end - big.start, P.lunchMin);
          push(d, big.start, big.start + L, 'Almuerzo rápido', 'alimentacion', 'Casino',
            `Tu día está apretado: este es el hueco más largo para comer (${dur(big.end - big.start)}).`);
          conflicts.push({ day: d, level: 'media', text: `Solo tienes ${dur(big.end - big.start)} para almorzar.` });
          continue;
        }
        conflicts.push({ day: d, level: 'alta', text: 'No tienes hueco para almorzar entre 12:00 y 15:00.' });
        const sn = free(d, t(10), t(17)).find((g) => g.end - g.start >= 10);
        if (sn) push(d, sn.start, sn.start + 10, 'Colación', 'alimentacion', 'Lleva algo desde casa',
          `No hay espacio para almorzar. Aprovecha estos ${dur(sn.end - sn.start)} para comer algo y no llegar en blanco a la tarde.`);
      }
    }
    if (cat === 'pausas') {
      for (let d = 0; d < 5; d++) {
        // Las pausas ya agendadas cuentan para el límite diario (evita duplicarlas al regenerar)
        const left = P.pausesPerDay - blocks.filter((b) => b.day === d && b.type === 'cuidado' && b.cat === 'pausas').length;
        if (loadOf(blocks, d) === 0 || left <= 0) continue;
        const gs = free(d, t(9, 30), t(19, 30))
          .filter((g) => g.end - g.start >= P.pauseMin)
          .map((g) => {
            const { prev } = nb(d, g.start, g.end);
            return { ...g, prev, score: (prev && prev.type === 'certamen' ? 3 : 0) + (prev && prev.end - prev.start >= 120 ? 1 : 0) };
          })
          // Una pausa activa va después de una clase (no antes de la primera ni justo después de comer)
          .filter((g) => g.prev && (g.prev.type === 'clase' || g.prev.type === 'certamen'))
          .sort((a, b) => b.score - a.score || a.start - b.start)
          .slice(0, left);
        gs.forEach((g, i) => {
          const post = g.prev && g.prev.type === 'certamen';
          push(d, g.start, g.start + P.pauseMin, post ? 'Respiro post-certamen' : 'Pausa activa', 'pausas',
            SPOTS[(d + i) % SPOTS.length],
            post ? `Recién terminas «${g.prev.title}». ${P.pauseMin} min para soltar la tensión antes de seguir.` : gapWhy(d, g));
        });
      }
    }
    if (cat === 'actividad') {
      let count = 0;
      const order = DAYS.map((_, i) => i).sort(
        (a, b) => (loadOf(blocks, a) + (hasCert(blocks, a) ? 240 : 0)) - (loadOf(blocks, b) + (hasCert(blocks, b) ? 240 : 0)));
      for (const d of order) {
        if (count >= P.exerciseDays) break;
        if (hasCat(d, 'actividad')) { count++; continue; }
        const gs = free(d, winStart(d), t(21)).filter((g) => g.end - g.start >= P.exerciseMin);
        // Preferimos la tarde: desde las 13:00 si el hueco lo permite, aunque empiece antes
        const pm = gs.find((g) => g.end - Math.max(g.start, t(13)) >= P.exerciseMin);
        const g = pm || gs[0];
        if (!g) continue;
        const st = pm ? Math.max(g.start, t(13)) : g.start;
        push(d, st, st + P.exerciseMin, `${P.exerciseType} ${P.exerciseMin} min`, 'actividad',
          P.exerciseType === 'Gimnasio' ? 'Gimnasio UDD' : 'Al aire libre',
          `Es uno de tus días más livianos (${dur(loadOf(blocks, d))} ocupado). ${gapWhy(d, g)}`);
        count++;
      }
    }
  }
  props.sort((a, b) => a.day - b.day || a.start - b.start);
  const rank = { alta: 0, media: 1 };
  conflicts.sort((a, b) => a.day - b.day || rank[a.level] - rank[b.level]);
  return { proposals: props, conflicts };
}

/**
 * Propuesta de un solo día. Usa la semana completa como contexto (por ejemplo, para saber
 * qué días son los más livianos para la actividad física) y devuelve solo ese día.
 */
function generateDay(blocks, prefs, day) {
  const { proposals, conflicts } = generate(blocks, prefs);
  return { proposals: proposals.filter((p) => p.day === day), conflicts: conflicts.filter((c) => c.day === day) };
}

/**
 * Reemplaza las sugerencias de un día por las nuevas, sin tocar los demás días.
 * Del día regenerado solo se conservan las aceptadas cuyo bloque sigue en la agenda.
 */
function mergeDayProposals(old, fresh, blocks, day) {
  const keep = (old || []).filter((p) => p.day !== day
    || (p.status === 'accepted' && blocks.some((b) => b.proposalId === p.id)));
  return [...keep, ...fresh].sort((a, b) => a.day - b.day || a.start - b.start);
}

/**
 * Al regenerar, conserva las propuestas ya aceptadas cuyo bloque sigue en la agenda,
 * para que "Mi propuesta" no las pierda (y se puedan deshacer).
 */
function mergeProposals(old, fresh, blocks) {
  const keep = (old || []).filter((p) => p.status === 'accepted' && blocks.some((b) => b.proposalId === p.id));
  return [...keep, ...fresh].sort((a, b) => a.day - b.day || a.start - b.start);
}

/** Datos de una propuesta al aceptarla (opcionalmente movida); guarda su horario original en "orig". */
function acceptProposal(p, move) {
  const orig = p.orig || { day: p.day, start: p.start, end: p.end };
  const m = { ...p, day: move?.day ?? p.day, start: move?.start ?? p.start, end: move?.end ?? p.end };
  return { ...m, orig, status: 'accepted', moved: m.day !== orig.day || m.start !== orig.start };
}

/** Vuelve una propuesta a "pendiente" en su día y hora originales (Deshacer o borrar su bloque). */
const resetProposal = (p) => ({ ...p, ...(p.orig || {}), status: 'pending', moved: false });

/** Convierte una propuesta aceptada en un bloque de la agenda. */
function blockFromProposal(p) {
  return {
    id: nid(), day: p.day, start: p.start, end: p.end, title: p.title, type: 'cuidado',
    cat: p.cat, place: p.place, fixed: false, source: 'ia', proposalId: p.id,
  };
}

module.exports = {
  DAYS, NUM_DIAS, DEFAULT_PREFS, RAMOS, NIVEL_DEMO, MODULOS, DURACION_MODULO, seedBlocks, generate, generateDay, blockFromProposal, mergeProposals, mergeDayProposals, acceptProposal, resetProposal,
  gapsFrom, dayBlocks, loadOf, hasCert, loadLevel, overlapsOf, fmt, dur, parseT, t, nid,
};

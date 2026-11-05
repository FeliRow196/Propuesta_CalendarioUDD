'use strict';
/**
 * Propuesta de autocuidado generada con Gemini (plan gratuito de la API de Google).
 * Gemini recibe las clases, los huecos libres y las preferencias, y devuelve sugerencias en JSON
 * (formato fijado con responseJsonSchema). Después validamos cada sugerencia contra los
 * huecos reales: lo que no calza se descarta. Las alertas siguen saliendo del motor de reglas.
 */
const { ApiError } = require('@google/genai');
const { DAYS, DEFAULT_PREFS, gapsFrom, generate, fmt, parseT, t, nid } = require('./engine');

// Ambos tienen cuota gratis; si el primero agota su cuota diaria o no está disponible, probamos el segundo
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
let ESPERA_REINTENTO = 2000; // ms entre la primera y la segunda ronda de intentos
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const CATS = ['descanso', 'alimentacion', 'pausas', 'actividad'];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']; // como Mi UDD: sin domingo
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const SCHEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string', description: 'Una o dos frases sobre cómo viene la semana del estudiante.' },
    propuestas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dia: { type: 'integer', enum: [0, 1, 2, 3, 4, 5], description: '0 = lunes … 5 = sábado' },
          inicio: { type: 'string', description: 'Hora de inicio, formato HH:MM (24 h)' },
          fin: { type: 'string', description: 'Hora de término, formato HH:MM (24 h)' },
          categoria: { type: 'string', enum: CATS },
          titulo: { type: 'string' },
          lugar: { type: 'string' },
          motivo: { type: 'string' },
        },
        required: ['dia', 'inicio', 'fin', 'categoria', 'titulo', 'lugar', 'motivo'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumen', 'propuestas'],
  additionalProperties: false,
};

const SYSTEM = `Eres el asistente de bienestar de "Mi Semana", un módulo de la app Mi UDD (Universidad del Desarrollo, Chile).
Ayudas a estudiantes a reservar tiempo de autocuidado alrededor de sus clases: descanso, alimentación, pausas activas y actividad física.

Horario UDD: las clases son módulos de 1 h 10 min con 10 minutos de recreo entre módulos (08:30–09:40, 09:50–11:00, 11:10–12:20, 12:30–13:40, 13:50–15:00, 15:10–16:20, 16:30–17:40, 17:50–19:00). Un ramo puede tener dos módulos seguidos. Los recreos de 10 minutos son el momento natural para una pausa activa breve.

Cómo proponer:
- Usa solo los huecos libres que te entrego; cada sugerencia debe caber completa dentro de un hueco y no cruzarse con otra sugerencia.
- Respeta las preferencias: hora y duración del almuerzo, duración y cantidad de pausas por día de clases, tipo, duración y días de actividad física, y horas de sueño.
- Si el tiempo no alcanza, prioriza las categorías en el orden de prioridades del estudiante.
- Las pausas activas van justo después de una clase; el almuerzo, entre 12:00 y 15:00; la actividad física, de preferencia en la tarde y en los días más livianos.
- No repitas lo que el estudiante ya tiene agendado como autocuidado.
- El motivo debe ser breve (una o dos frases), cálido y concreto: menciona las clases o el hueco que lo justifican. Tutea al estudiante y escribe en español de Chile, sin modismos exagerados.
- No des consejos médicos ni diagnósticos. No inventes clases, lugares de la universidad ni datos personales.
- Para los lugares, usa opciones genéricas del campus (Casino, Biblioteca, Patio central, Gimnasio UDD) o "Al aire libre".`;

/** Resumen compacto de la semana para el modelo: clases, huecos libres y autocuidado ya agendado. */
function describirSemana(blocks, prefs) {
  const P = { ...DEFAULT_PREFS, ...prefs };
  const dias = DIAS.map((nombre, d) => {
    const del = blocks.filter((b) => b.day === d).sort((a, b) => a.start - b.start);
    const ini = d >= 5 ? t(9) : t(7);
    return {
      dia: d, nombre,
      clases: del.filter((b) => b.type === 'clase').map((b) => `${fmt(b.start)}-${fmt(b.end)} ${b.title}${b.place ? ` (${b.place})` : ''}`),
      autocuidado_agendado: del.filter((b) => b.type === 'cuidado').map((b) => `${fmt(b.start)}-${fmt(b.end)} ${b.title} [${b.cat}]`),
      huecos_libres: gapsFrom(del, ini, t(21, 30)).filter((g) => g.end - g.start >= 10).map((g) => `${fmt(g.start)}-${fmt(g.end)}`),
    };
  });
  return {
    preferencias: {
      se_levanta: P.wake, horas_de_sueno: P.sleepHours,
      almuerzo: `${P.lunchTime}, ${P.lunchMin} min`,
      pausas: `${P.pausesPerDay} por día de clases, de ${P.pauseMin} min`,
      actividad_fisica: `${P.exerciseType}, ${P.exerciseMin} min, ${P.exerciseDays} días por semana`,
      prioridades: P.priorities,
    },
    semana: dias,
  };
}

/**
 * Convierte la respuesta de Gemini en propuestas válidas para la app.
 * Descarta las que no caben en un hueco libre real o se cruzan con otra, y aplica las mismas
 * reglas de pausas que el motor: van justo después de una clase y no más de las preferidas por día.
 */
function validar(salida, blocks, dia, prefs) {
  const P = { ...DEFAULT_PREFS, ...prefs };
  const ocupado = blocks.map((b) => ({ day: b.day, start: b.start, end: b.end }));
  const pausas = {}; // pausas por día, contando las ya agendadas
  blocks.filter((b) => b.type === 'cuidado' && b.cat === 'pausas').forEach((b) => { pausas[b.day] = (pausas[b.day] || 0) + 1; });
  const out = [];
  for (const p of (salida && salida.propuestas) || []) {
    if (!HHMM.test(String(p.inicio)) || !HHMM.test(String(p.fin))) continue;
    const day = p.dia, start = parseT(p.inicio), end = parseT(p.fin);
    if (!Number.isInteger(day) || day < 0 || day >= DIAS.length || !CATS.includes(p.categoria)) continue;
    if (dia !== undefined && day !== dia) continue; // propuesta por día: solo el día pedido
    if (!(end > start) || end - start < 5 || end - start > 180) continue;
    const ini = day >= 5 ? t(9) : t(7);
    const cabe = gapsFrom(ocupado.filter((b) => b.day === day), ini, t(23)).some((g) => g.start <= start && end <= g.end);
    if (!cabe) continue;
    if (p.categoria === 'pausas') {
      const trasClase = blocks.some((b) => b.day === day && b.type === 'clase' && b.end <= start && start - b.end <= 15);
      if (!trasClase || (pausas[day] || 0) >= P.pausesPerDay) continue;
      pausas[day] = (pausas[day] || 0) + 1;
    }
    ocupado.push({ day, start, end });
    out.push({
      id: nid(), day, start, end,
      title: String(p.titulo || '').trim().slice(0, 60) || 'Autocuidado',
      cat: p.categoria,
      place: String(p.lugar || '').trim().slice(0, 60),
      reason: String(p.motivo || '').trim().slice(0, 400),
      status: 'pending', ai: true,
    });
    if (out.length >= 30) break;
  }
  return out.sort((a, b) => a.day - b.day || a.start - b.start);
}

/** Traduce un error de la API de Gemini a un mensaje claro en español. */
function mensajeDeError(e) {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'Se agotó la cuota gratuita de la IA por ahora. Intenta más tarde.';
    if (e.status === 400 && /api key/i.test(e.message)) return 'La clave de la IA no es válida. Revisa GEMINI_API_KEY.';
    if (e.status === 401 || e.status === 403) return 'La clave de la IA no tiene permiso. Revisa GEMINI_API_KEY.';
    return `La IA no respondió (error ${e.status}).`;
  }
  if (e && (e.name === 'AbortError' || /timeout|timed out/i.test(e.message))) return 'La IA tardó demasiado en responder.';
  return 'No se pudo conectar con la IA.';
}

/**
 * Pide la propuesta a Gemini. `ai` es un cliente GoogleGenAI de @google/genai (inyectable para pruebas).
 * Con `dia` (0 = lunes … 5 = sábado) propone solo ese día, usando el resto de la semana como contexto.
 * Devuelve { proposals, conflicts, resumen, modelo }; lanza un Error con mensaje en español si falla.
 */
async function proponerConIA(ai, blocks, prefs, dia) {
  const semana = describirSemana(blocks, prefs);
  const tarea = dia === undefined
    ? 'Propón mi semana de autocuidado.'
    : `Propón autocuidado SOLO para el ${DIAS[dia]} (dia = ${dia}); todas las propuestas deben tener dia = ${dia}. `
      + 'Usa el resto de la semana solo como contexto (por ejemplo, para decidir si ese día conviene actividad física por ser de los más livianos). '
      + `El resumen debe hablar de cómo viene el ${DIAS[dia]}.`;
  const pedido = `Esta es mi semana (los días van de 0 = lunes a 5 = sábado; las horas en formato 24 h):\n\n${JSON.stringify(semana, null, 2)}\n\n${tarea}`;
  // Dos rondas por los modelos: las sobrecargas de Gemini (503/504) suelen durar segundos.
  // Un modelo sin cuota (429) o inexistente (404) no se vuelve a intentar.
  // Peor caso: 4 intentos × 20 s + espera ≈ 82 s, dentro del límite de la función (120 s).
  let res, modelo, ultimoError;
  const descartados = new Set();
  for (const [i, m] of [...MODELS, ...MODELS].entries()) {
    if (descartados.has(m)) continue;
    if (i === MODELS.length) await esperar(ESPERA_REINTENTO);
    try {
      res = await ai.models.generateContent({
        model: m,
        contents: pedido,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseJsonSchema: SCHEMA,
          httpOptions: { timeout: 20000 },
        },
      });
      modelo = m;
      break;
    } catch (e) {
      ultimoError = e;
      console.warn(`Gemini ${m} falló:`, e instanceof ApiError ? `${e.status} ${e.message}` : e.message);
      const status = e instanceof ApiError ? e.status : null;
      if (status === 429 || status === 404) descartados.add(m);
      // Clave inválida, sin permiso o solicitud mal formada: no sirve reintentar
      else if (status !== null && status < 500) break;
    }
  }
  if (!res) throw new Error(mensajeDeError(ultimoError));

  const fin = res.candidates?.[0]?.finishReason;
  if (res.promptFeedback?.blockReason || fin === 'SAFETY' || fin === 'RECITATION') throw new Error('La IA no pudo generar esta propuesta.');
  if (fin === 'MAX_TOKENS') throw new Error('La respuesta de la IA quedó incompleta.');
  const texto = res.text || '';
  let salida;
  try { salida = JSON.parse(texto); } catch { throw new Error('La IA devolvió una respuesta que no se pudo leer.'); }

  const proposals = validar(salida, blocks, dia, prefs);
  if (proposals.length === 0) throw new Error('La IA no encontró propuestas que calcen con tu semana.');
  // Las alertas son cálculos exactos: siguen saliendo de las reglas
  const conflicts = generate(blocks, prefs).conflicts.filter((c) => dia === undefined || c.day === dia);
  return {
    proposals,
    conflicts,
    resumen: String(salida.resumen || '').trim().slice(0, 300),
    modelo,
  };
}

module.exports = {
  proponerConIA, describirSemana, validar, SCHEMA, MODELS, DAYS,
  setEsperaReintento: (ms) => { ESPERA_REINTENTO = ms; }, // para las pruebas
};

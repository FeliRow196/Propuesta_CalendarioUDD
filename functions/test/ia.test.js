'use strict';
// Pruebas de la propuesta con IA usando un cliente de Gemini simulado (no gasta cuota)
const test = require('node:test');
const assert = require('node:assert');
const { ApiError } = require('@google/genai');
const { proponerConIA, describirSemana, validar, MODELS, setEsperaReintento } = require('../ia');
setEsperaReintento(0);
const { seedBlocks, DEFAULT_PREFS, overlapsOf } = require('../engine');

// respuestas: una por llamada; cada una es un objeto de salida, un texto o un Error a lanzar
const fakeAI = (...respuestas) => {
  const calls = [];
  return {
    calls,
    models: { generateContent: async (params) => {
      calls.push(params);
      const r = respuestas[Math.min(calls.length - 1, respuestas.length - 1)];
      if (r instanceof Error) throw r;
      const { finishReason = 'STOP', ...salida } = typeof r === 'string' ? {} : r;
      return { text: typeof r === 'string' ? r : JSON.stringify(salida), candidates: [{ finishReason }] };
    } },
  };
};
const apiError = (status, message = 'error') => new ApiError({ status, message });
const UNA = { resumen: 'Semana exigente el jueves.', propuestas: [
  { dia: 1, inicio: '13:00', fin: '13:45', categoria: 'alimentacion', titulo: 'Almuerzo', lugar: 'Casino', motivo: 'Tienes un hueco largo.' },
] };

test('describe la semana con clases y huecos libres, sin datos personales', () => {
  const s = describirSemana(seedBlocks(), DEFAULT_PREFS);
  assert.strictEqual(s.semana.length, 6); // lunes a sábado, como Mi UDD
  assert.ok(s.semana[0].clases.some((c) => c.includes('Cálculo Diferencial')));
  assert.ok(s.semana[5].huecos_libres.length > 0);
});

test('acepta propuestas que caben en un hueco y descarta las que chocan con clases o entre sí', () => {
  const blocks = seedBlocks(); // lunes: Cálculo 08:30-09:40 y 09:50-11:00, Bootcamp 11:10-12:20...
  const out = validar({ propuestas: [
    { dia: 0, inicio: '09:40', fin: '09:50', categoria: 'pausas', titulo: 'Pausa', lugar: 'Patio central', motivo: 'ok' },
    { dia: 0, inicio: '09:00', fin: '09:30', categoria: 'pausas', titulo: 'Choca', lugar: '', motivo: 'choca con Cálculo' },
    { dia: 0, inicio: '09:45', fin: '09:50', categoria: 'pausas', titulo: 'Doble', lugar: '', motivo: 'choca con la anterior' },
    { dia: 9, inicio: '10:00', fin: '10:15', categoria: 'pausas', titulo: 'Día malo', lugar: '', motivo: '' },
    { dia: 5, inicio: '13:00', fin: '13:30', categoria: 'yoga', titulo: 'Cat mala', lugar: '', motivo: '' },
    { dia: 5, inicio: '25:00', fin: '25:30', categoria: 'actividad', titulo: 'Hora mala', lugar: '', motivo: '' },
    { dia: 5, inicio: '13:00', fin: '13:30', categoria: 'actividad', titulo: 'Caminar', lugar: 'Al aire libre', motivo: 'sábado libre' },
  ] }, blocks);
  assert.deepStrictEqual(out.map((p) => p.title), ['Pausa', 'Caminar']);
  assert.ok(out.every((p) => p.status === 'pending' && p.ai && p.id));
  const todos = [...blocks, ...out.map((p) => ({ ...p, type: 'cuidado' }))];
  for (let d = 0; d < 7; d++) assert.strictEqual(overlapsOf(todos, d).length, 0);
});

test('llama a Gemini con el modelo, las instrucciones y el formato JSON correctos', async () => {
  const ai = fakeAI(UNA);
  const r = await proponerConIA(ai, seedBlocks(), DEFAULT_PREFS);
  const p = ai.calls[0];
  assert.strictEqual(p.model, MODELS[0]);
  assert.strictEqual(p.config.responseMimeType, 'application/json');
  assert.ok(p.config.responseJsonSchema && p.config.systemInstruction);
  assert.strictEqual(r.proposals.length, 1);
  assert.strictEqual(r.resumen, 'Semana exigente el jueves.');
  assert.strictEqual(r.modelo, MODELS[0]);
  assert.ok(r.conflicts.some((x) => x.text.includes('almorzar')), 'las alertas salen de las reglas');
});

test('si se agota la cuota gratis del primer modelo, usa el segundo', async () => {
  const ai = fakeAI(apiError(429, 'quota'), UNA);
  const r = await proponerConIA(ai, seedBlocks(), DEFAULT_PREFS);
  assert.deepStrictEqual(ai.calls.map((c) => c.model), MODELS);
  assert.strictEqual(r.modelo, MODELS[1]);
});

test('errores de la IA se convierten en mensajes claros en español', async () => {
  const b = seedBlocks();
  await assert.rejects(proponerConIA(fakeAI('no es json'), b, DEFAULT_PREFS), /no se pudo leer/);
  await assert.rejects(proponerConIA(fakeAI({ resumen: '', propuestas: [] }), b, DEFAULT_PREFS), /no encontró propuestas/);
  await assert.rejects(proponerConIA(fakeAI({ finishReason: 'SAFETY' }), b, DEFAULT_PREFS), /no pudo generar/);
  await assert.rejects(proponerConIA(fakeAI({ finishReason: 'MAX_TOKENS' }), b, DEFAULT_PREFS), /incompleta/);
  await assert.rejects(proponerConIA(fakeAI(apiError(429)), b, DEFAULT_PREFS), /cuota gratuita/);
  await assert.rejects(proponerConIA(fakeAI(apiError(400, 'API key not valid')), b, DEFAULT_PREFS), /GEMINI_API_KEY/);
  const lenta = Object.assign(new Error('Request timed out'), { name: 'AbortError' });
  await assert.rejects(proponerConIA(fakeAI(lenta), b, DEFAULT_PREFS), /tardó demasiado/);
});

test('propuesta por día: pide solo ese día y descarta lo que la IA proponga para otros días', async () => {
  const ai = fakeAI({ resumen: 'El jueves viene cargado.', propuestas: [
    { dia: 3, inicio: '11:00', fin: '11:10', categoria: 'alimentacion', titulo: 'Colación', lugar: 'Casino', motivo: 'No hay hueco para almorzar.' },
    { dia: 1, inicio: '13:00', fin: '13:45', categoria: 'alimentacion', titulo: 'Almuerzo martes', lugar: 'Casino', motivo: 'otro día' },
  ] });
  const r = await proponerConIA(ai, seedBlocks(), DEFAULT_PREFS, 3);
  assert.match(ai.calls[0].contents, /SOLO para el Jueves \(dia = 3\)/);
  assert.deepStrictEqual(r.proposals.map((p) => p.title), ['Colación']);
  assert.ok(r.conflicts.length > 0 && r.conflicts.every((c) => c.day === 3));
});

test('descarta pausas que no van justo después de una clase o que exceden las preferidas por día', () => {
  const out = validar({ propuestas: [
    { dia: 0, inicio: '09:40', fin: '09:50', categoria: 'pausas', titulo: 'Tras Cálculo', lugar: '', motivo: '' },
    { dia: 0, inicio: '11:00', fin: '11:10', categoria: 'pausas', titulo: 'Tras Cálculo 2', lugar: '', motivo: '' },
    { dia: 0, inicio: '12:20', fin: '12:30', categoria: 'pausas', titulo: 'Tercera', lugar: '', motivo: 'excede 2 por día' },
    { dia: 4, inicio: '13:30', fin: '13:45', categoria: 'pausas', titulo: 'Sin clase antes', lugar: '', motivo: '' },
  ] }, seedBlocks(), undefined, DEFAULT_PREFS);
  assert.deepStrictEqual(out.map((p) => p.title), ['Tras Cálculo', 'Tras Cálculo 2']);
});

test('si ambos modelos están sobrecargados, hace una segunda ronda y responde', async () => {
  const ai = fakeAI(apiError(504, 'Deadline expired'), apiError(503, 'high demand'), UNA);
  const r = await proponerConIA(ai, seedBlocks(), DEFAULT_PREFS);
  assert.deepStrictEqual(ai.calls.map((c) => c.model), [MODELS[0], MODELS[1], MODELS[0]]);
  assert.strictEqual(r.modelo, MODELS[0]);
});

test('un modelo sin cuota (429) no se reintenta, y una clave inválida corta de inmediato', async () => {
  const ai = fakeAI(apiError(429, 'quota'), apiError(503, 'high demand'), UNA);
  const r = await proponerConIA(ai, seedBlocks(), DEFAULT_PREFS);
  assert.deepStrictEqual(ai.calls.map((c) => c.model), [MODELS[0], MODELS[1], MODELS[1]]);
  assert.strictEqual(r.modelo, MODELS[1]);
  const mala = fakeAI(apiError(400, 'API key not valid'));
  await assert.rejects(proponerConIA(mala, seedBlocks(), DEFAULT_PREFS), /GEMINI_API_KEY/);
  assert.strictEqual(mala.calls.length, 1);
});

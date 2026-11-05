'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { generate, seedBlocks, DEFAULT_PREFS, overlapsOf, loadOf, t } = require('../src/engine');

// La semana de ejemplo no trae certámenes (se ven aparte); el motor los sigue considerando si existen
const conCertamen = () => [...seedBlocks(),
  { id: 'c1', day: 3, start: t(18), end: t(19), title: 'Certamen 2 · Geometría', type: 'certamen', fixed: true }];

test('la semana de ejemplo genera propuestas de alimentación, pausas y actividad', () => {
  const { proposals } = generate(seedBlocks(), DEFAULT_PREFS);
  const cats = new Set(proposals.map((p) => p.cat));
  for (const c of ['alimentacion', 'pausas', 'actividad']) assert.ok(cats.has(c), `falta ${c}`);
});

test('modo certamen propone dormir la noche anterior a un certamen', () => {
  const { proposals } = generate(conCertamen(), DEFAULT_PREFS);
  const noches = proposals.filter((p) => p.cat === 'descanso').map((p) => p.day);
  assert.deepStrictEqual(noches, [2]); // certamen el jueves → descansar el miércoles
});

test('con modo certamen apagado no hay propuestas de descanso', () => {
  const { proposals } = generate(conCertamen(), { ...DEFAULT_PREFS, modoCertamen: false });
  assert.strictEqual(proposals.filter((p) => p.cat === 'descanso').length, 0);
});

test('ninguna propuesta se cruza con clases, certámenes ni entre sí', () => {
  const blocks = seedBlocks();
  const { proposals } = generate(blocks, DEFAULT_PREFS);
  const todos = [...blocks, ...proposals.map((p) => ({ ...p, type: 'cuidado' }))];
  for (let d = 0; d < 7; d++) assert.strictEqual(overlapsOf(todos, d).length, 0, `cruce el día ${d}`);
});

test('detecta cruces de horario entre bloques', () => {
  const blocks = [
    { id: 'a', day: 0, start: t(9), end: t(11), title: 'A', type: 'clase' },
    { id: 'b', day: 0, start: t(10), end: t(12), title: 'B', type: 'cuidado', cat: 'pausas' },
  ];
  const { conflicts } = generate(blocks, DEFAULT_PREFS);
  assert.ok(conflicts.some((c) => c.level === 'alta' && c.text.includes('se cruza')));
});

test('detecta días sobrecargados (10 h o más)', () => {
  const blocks = [{ id: 'a', day: 2, start: t(8), end: t(19), title: 'Maratón', type: 'clase' }];
  assert.ok(loadOf(blocks, 2) >= 600);
  const { conflicts } = generate(blocks, DEFAULT_PREFS);
  assert.ok(conflicts.some((c) => c.day === 2 && c.text.includes('sobrecargado')));
});

test('respeta la cantidad de pausas y de días de actividad configurados', () => {
  const prefs = { ...DEFAULT_PREFS, pausesPerDay: 1, exerciseDays: 2 };
  const { proposals } = generate(seedBlocks(), prefs);
  for (let d = 0; d < 5; d++) assert.ok(proposals.filter((p) => p.cat === 'pausas' && p.day === d).length <= 1);
  assert.ok(new Set(proposals.filter((p) => p.cat === 'actividad').map((p) => p.day)).size <= 2);
});

test('el horario de ejemplo usa solo clases de los ramos reales de Nivel 2 (sin certámenes ni Créditos Extra Disciplinares)', () => {
  const { RAMOS } = require('../src/engine');
  assert.strictEqual(RAMOS.length, 16);
  assert.ok(!RAMOS.some((r) => /cr[eé]ditos/i.test(r.nombre)));
  const nivel2 = RAMOS.filter((r) => r.nivel === 2).map((r) => r.nombre);
  const clases = seedBlocks().filter((b) => b.fixed);
  for (const b of clases) assert.ok(b.type === 'clase' && nivel2.includes(b.title), b.title);
  for (const n of nivel2) assert.ok(clases.some((b) => b.title === n), `falta ${n}`);
  for (let d = 0; d < 7; d++) assert.strictEqual(overlapsOf(seedBlocks(), d).length, 0, `cruce el día ${d}`);
});

test('las pausas activas van después de una clase, nunca antes de la primera', () => {
  const blocks = seedBlocks();
  const { proposals } = generate(blocks, DEFAULT_PREFS);
  for (const p of proposals.filter((x) => x.cat === 'pausas')) {
    const antes = blocks.filter((b) => b.day === p.day && b.type === 'clase' && b.end <= p.start);
    assert.ok(antes.length > 0, `pausa sin clase previa: día ${p.day} ${p.start}`);
  }
});

test('la actividad física prefiere la tarde (desde las 13:00) si hay espacio', () => {
  const { proposals } = generate(seedBlocks(), DEFAULT_PREFS);
  for (const p of proposals.filter((x) => x.cat === 'actividad' && x.day >= 5)) assert.ok(p.start >= t(13), `fin de semana a las ${p.start}`);
});

test('propuesta por día: solo devuelve ese día y no toca los demás al regenerarlo', () => {
  const { generateDay, mergeDayProposals, blockFromProposal } = require('../src/engine');
  const blocks = seedBlocks();
  const lun = generateDay(blocks, DEFAULT_PREFS, 0);
  assert.ok(lun.proposals.length > 0 && lun.proposals.every((p) => p.day === 0));
  assert.ok(lun.conflicts.every((c) => c.day === 0));
  const mie = generateDay(blocks, DEFAULT_PREFS, 2);
  let props = mergeDayProposals(lun.proposals, mie.proposals, blocks, 2);
  const aceptada = { ...props.find((p) => p.day === 2), status: 'accepted' };
  props = props.map((p) => (p.id === aceptada.id ? aceptada : p));
  const conBloque = [...blocks, blockFromProposal(aceptada)];
  const otraVez = mergeDayProposals(props, generateDay(conBloque, DEFAULT_PREFS, 2).proposals, conBloque, 2);
  assert.strictEqual(otraVez.filter((p) => p.day === 0).length, lun.proposals.length, 'el lunes no cambia');
  assert.ok(otraVez.some((p) => p.id === aceptada.id), 'la aceptada del miércoles se conserva');
});

test('la semana va de lunes a sábado: nunca se propone ni se alerta el domingo', () => {
  const { DAYS, NUM_DIAS } = require('../src/engine');
  assert.deepStrictEqual(DAYS, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']);
  const { proposals, conflicts } = generate(seedBlocks(), { ...DEFAULT_PREFS, exerciseDays: 7 });
  assert.ok(proposals.every((p) => p.day < NUM_DIAS) && conflicts.every((c) => c.day < NUM_DIAS));
});

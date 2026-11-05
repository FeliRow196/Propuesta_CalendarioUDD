'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');
const { MemoryStore } = require('../src/store');

let server, base;
test.before(async () => {
  server = createApp(new MemoryStore());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = async (method, path, body, uid = 'u1') => {
  const r = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', 'x-user-id': uid },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
};

test('health responde y GET /api/week trae la semana de ejemplo', async () => {
  assert.strictEqual((await call('GET', '/health')).data.ok, true);
  const { data } = await call('GET', '/api/week');
  assert.ok(data.blocks.length >= 14 && data.blocks.every((b) => b.type === 'clase'));
  assert.strictEqual(data.generated, false);
});

test('generar -> aceptar una propuesta -> deshacer', async () => {
  const gen = (await call('POST', '/api/generate')).data;
  assert.ok(gen.generated && gen.proposals.length > 0);
  const pr = gen.proposals[0];
  const antes = gen.blocks.length;

  const acc = (await call('POST', `/api/proposals/${pr.id}/accept`, {})).data;
  assert.strictEqual(acc.blocks.length, antes + 1);
  assert.strictEqual(acc.proposals.find((x) => x.id === pr.id).status, 'accepted');

  const und = (await call('POST', `/api/proposals/${pr.id}/undo`)).data;
  assert.strictEqual(und.blocks.length, antes);
  assert.strictEqual(und.proposals.find((x) => x.id === pr.id).status, 'pending');
});

test('aceptar todas agrega un bloque por cada propuesta pendiente', async () => {
  const before = (await call('POST', '/api/generate', null, 'u2')).data;
  const pend = before.proposals.filter((p) => p.status === 'pending').length;
  const after = (await call('POST', '/api/proposals/accept-all', null, 'u2')).data;
  assert.strictEqual(after.blocks.length, before.blocks.length + pend);
});

test('crear, editar y borrar una actividad propia; cambios marcan la propuesta como desactualizada', async () => {
  await call('POST', '/api/generate', null, 'u3');
  const created = await call('POST', '/api/blocks', { day: 5, start: 900, end: 960, title: 'Estudiar', type: 'cuidado', cat: 'pausas' }, 'u3');
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.dirty, true);
  const id = created.data.blocks.find((b) => b.title === 'Estudiar').id;
  const upd = await call('PUT', `/api/blocks/${id}`, { title: 'Estudiar Física' }, 'u3');
  assert.ok(upd.data.blocks.some((b) => b.title === 'Estudiar Física'));
  const del = await call('DELETE', `/api/blocks/${id}`, null, 'u3');
  assert.ok(!del.data.blocks.some((b) => b.id === id));
});

test('valida datos y protege el horario UDD', async () => {
  const mala = await call('POST', '/api/blocks', { day: 9, start: 100, end: 50, title: '', type: 'cuidado' });
  assert.strictEqual(mala.status, 400);
  const clase = await call('POST', '/api/blocks', { day: 0, start: 600, end: 660, title: 'X', type: 'clase' });
  assert.strictEqual(clase.status, 400);
  const week = (await call('GET', '/api/week')).data;
  const fijo = week.blocks.find((b) => b.fixed);
  assert.strictEqual((await call('DELETE', `/api/blocks/${fijo.id}`)).status, 409);
});

test('guardar preferencias valida prioridades y los usuarios están aislados', async () => {
  assert.strictEqual((await call('PUT', '/api/prefs', { priorities: ['descanso'] }, 'u4')).status, 400);
  const ok = await call('PUT', '/api/prefs', { pausesPerDay: 3 }, 'u4');
  assert.strictEqual(ok.data.prefs.pausesPerDay, 3);
  assert.strictEqual((await call('GET', '/api/week', null, 'u5')).data.prefs.pausesPerDay, 2);
});

test('reset restaura el estado inicial', async () => {
  await call('POST', '/api/generate', null, 'u6');
  const r = (await call('POST', '/api/reset', null, 'u6')).data;
  assert.strictEqual(r.generated, false);
  assert.strictEqual(r.proposals.length, 0);
});

test('regenerar conserva las aceptadas y no duplica pausas', async () => {
  await call('POST', '/api/generate', null, 'u7');
  const acc = (await call('POST', '/api/proposals/accept-all', null, 'u7')).data;
  const n = acc.proposals.length;
  const r = (await call('POST', '/api/generate', null, 'u7')).data;
  assert.strictEqual(r.proposals.filter((p) => p.status === 'accepted').length, n);
  for (let d = 0; d < 5; d++) {
    const pausas = r.blocks.filter((b) => b.day === d && b.cat === 'pausas').length
      + r.proposals.filter((p) => p.day === d && p.cat === 'pausas' && p.status === 'pending').length;
    assert.ok(pausas <= r.prefs.pausesPerDay, `día ${d}: ${pausas} pausas`);
  }
});

test('deshacer una propuesta movida la devuelve a su horario original', async () => {
  const g = (await call('POST', '/api/generate', null, 'u8')).data;
  const p = g.proposals[0];
  const moved = (await call('POST', `/api/proposals/${p.id}/accept`, { day: 5, start: 1200, end: 1200 + (p.end - p.start) }, 'u8')).data;
  assert.strictEqual(moved.proposals.find((x) => x.id === p.id).moved, true);
  const r = (await call('POST', `/api/proposals/${p.id}/undo`, null, 'u8')).data;
  const back = r.proposals.find((x) => x.id === p.id);
  assert.deepStrictEqual([back.status, back.day, back.start, back.end, back.moved], ['pending', p.day, p.start, p.end, false]);
  assert.ok(!r.blocks.some((b) => b.proposalId === p.id));
});

test('no se pueden guardar actividades personales (privacidad)', async () => {
  const r = await call('POST', '/api/blocks', { day: 1, start: 1080, end: 1260, title: 'Trabajo part-time', type: 'personal' }, 'u9');
  assert.strictEqual(r.status, 400);
});

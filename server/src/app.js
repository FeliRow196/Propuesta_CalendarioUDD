'use strict';
/**
 * API REST de Mi Semana, con el módulo http nativo de Node (sin dependencias).
 * El usuario se identifica con el header x-user-id (por defecto "demo").
 */
const http = require('http');
const { generate, blockFromProposal, mergeProposals, acceptProposal, resetProposal, nid } = require('./engine');

// Sin 'personal': la app no guarda actividades personales (privacidad)
const TYPES = ['clase', 'certamen', 'cuidado'];

function validateBlock(b) {
  const errs = [];
  if (!Number.isInteger(b.day) || b.day < 0 || b.day > 5) errs.push('day debe ser 0-5 (lunes a sábado)');
  if (!Number.isInteger(b.start) || !Number.isInteger(b.end)) errs.push('start y end deben ser minutos enteros');
  else if (b.start < 0 || b.end > 1440 || b.end <= b.start) errs.push('el rango horario no es válido');
  if (!b.title || !String(b.title).trim()) errs.push('title es obligatorio');
  if (!TYPES.includes(b.type)) errs.push('type no válido');
  return errs;
}

function createApp(store) {
  const send = (res, code, body) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type,x-user-id',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) reject(new Error('cuerpo muy grande')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } });
  });

  async function snapshot(uid) {
    const [user, blocks] = await Promise.all([store.getUser(uid), store.listBlocks(uid)]);
    return { ...user, blocks };
  }
  const markDirty = async (uid) => {
    const u = await store.getUser(uid);
    if (u.generated) await store.saveUser(uid, { dirty: true });
  };

  async function route(req, res) {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const uid = String(req.headers['x-user-id'] || 'demo').slice(0, 80);
    const m = req.method;
    let p;

    if (m === 'OPTIONS') return send(res, 204, {});
    if (path === '/health') return send(res, 200, { ok: true, store: store.kind });

    if (path === '/api/week' && m === 'GET') return send(res, 200, await snapshot(uid));

    if (path === '/api/blocks' && m === 'POST') {
      const b = await readBody(req);
      const block = {
        id: nid(), day: b.day, start: b.start, end: b.end, title: String(b.title || '').trim(),
        type: b.type, place: b.place || '', cat: b.cat, fixed: false, source: 'user',
      };
      const errs = validateBlock(block);
      if (errs.length) return send(res, 400, { error: errs.join('; ') });
      if (block.type === 'clase' || block.type === 'certamen') return send(res, 400, { error: 'Las clases y certámenes vienen del horario UDD y no se crean a mano' });
      await store.putBlock(uid, block);
      await markDirty(uid);
      return send(res, 201, await snapshot(uid));
    }

    if ((p = path.match(/^\/api\/blocks\/([\w-]+)$/))) {
      const id = p[1];
      const all = await store.listBlocks(uid);
      const cur = all.find((b) => b.id === id);
      if (!cur) return send(res, 404, { error: 'Bloque no encontrado' });
      if (cur.fixed) return send(res, 409, { error: 'Este bloque viene del horario UDD y no se puede modificar' });
      if (m === 'PUT') {
        const b = await readBody(req);
        const next = { ...cur, day: b.day ?? cur.day, start: b.start ?? cur.start, end: b.end ?? cur.end,
          title: b.title !== undefined ? String(b.title).trim() : cur.title, place: b.place ?? cur.place,
          cat: b.cat ?? cur.cat, type: cur.source === 'ia' ? 'cuidado' : (b.type ?? cur.type) };
        const errs = validateBlock(next);
        if (errs.length) return send(res, 400, { error: errs.join('; ') });
        await store.putBlock(uid, next);
        await markDirty(uid);
        return send(res, 200, await snapshot(uid));
      }
      if (m === 'DELETE') {
        await store.deleteBlock(uid, id);
        if (cur.proposalId) {
          const u = await store.getUser(uid);
          await store.saveUser(uid, { proposals: u.proposals.map((x) => (x.id === cur.proposalId ? resetProposal(x) : x)) });
        }
        await markDirty(uid);
        return send(res, 200, await snapshot(uid));
      }
    }

    if (path === '/api/prefs' && m === 'PUT') {
      const b = await readBody(req);
      const u = await store.getUser(uid);
      const prefs = { ...u.prefs, ...b };
      if (!Array.isArray(prefs.priorities) || prefs.priorities.length !== 4) return send(res, 400, { error: 'priorities debe tener 4 elementos' });
      await store.saveUser(uid, { prefs, dirty: u.generated ? true : u.dirty });
      return send(res, 200, await snapshot(uid));
    }

    if (path === '/api/generate' && m === 'POST') {
      const [u, blocks] = await Promise.all([store.getUser(uid), store.listBlocks(uid)]);
      const { proposals, conflicts } = generate(blocks, u.prefs);
      await store.saveUser(uid, { proposals: mergeProposals(u.proposals, proposals, blocks), conflicts, generated: true, dirty: false });
      return send(res, 200, await snapshot(uid));
    }

    if (path === '/api/proposals/accept-all' && m === 'POST') {
      const u = await store.getUser(uid);
      const proposals = [];
      for (const pr of u.proposals) {
        if (pr.status === 'pending') { await store.putBlock(uid, blockFromProposal(pr)); proposals.push({ ...pr, status: 'accepted' }); }
        else proposals.push(pr);
      }
      await store.saveUser(uid, { proposals });
      return send(res, 200, await snapshot(uid));
    }

    if ((p = path.match(/^\/api\/proposals\/([\w-]+)\/(accept|reject|undo)$/)) && m === 'POST') {
      const [, id, action] = p;
      const u = await store.getUser(uid);
      const pr = u.proposals.find((x) => x.id === id);
      if (!pr) return send(res, 404, { error: 'Propuesta no encontrada' });
      const body = await readBody(req);
      let next = { ...pr };
      if (action === 'accept') {
        if (pr.status !== 'accepted') {
          // "Mover": permite aceptar en otro día u hora
          next = acceptProposal(pr, body);
          const errs = validateBlock({ ...next, type: 'cuidado' });
          if (errs.length) return send(res, 400, { error: errs.join('; ') });
          await store.putBlock(uid, blockFromProposal(next));
        }
      } else if (action === 'reject') {
        next.status = 'rejected';
      } else {
        const blocks = await store.listBlocks(uid);
        for (const b of blocks.filter((x) => x.proposalId === id)) await store.deleteBlock(uid, b.id);
        next = resetProposal(pr);
      }
      await store.saveUser(uid, { proposals: u.proposals.map((x) => (x.id === id ? next : x)) });
      return send(res, 200, await snapshot(uid));
    }

    if (path === '/api/reset' && m === 'POST') {
      await store.resetUser(uid);
      return send(res, 200, await snapshot(uid));
    }

    return send(res, 404, { error: 'Ruta no encontrada' });
  }

  return http.createServer((req, res) => {
    route(req, res).catch((err) => send(res, 500, { error: err.message || 'Error interno' }));
  });
}

module.exports = { createApp };

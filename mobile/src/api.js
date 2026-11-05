/**
 * Cliente de datos. Primero intenta Firestore directo desde el teléfono (no necesita servidor);
 * si no está configurado, la API Node.js; y si nada responde, un "modo local" con el mismo
 * motor de reglas en el teléfono, para que la demo nunca se quede en blanco.
 */
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfigured, firestoreStorage } from './firebase';
import { TODAY } from './theme';
import {
  seedBlocks, generateDay, blockFromProposal, mergeDayProposals, acceptProposal, resetProposal, DEFAULT_PREFS, nid,
} from './engine';

const API_URL = (Constants.expoConfig?.extra?.apiUrl || '').replace(/\/+$/, '');
const USER_ID = 'demo-felipe';

async function req(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(API_URL + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-id': USER_ID },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const remote = {
  week: () => req('GET', '/api/week'),
  addBlock: (b) => req('POST', '/api/blocks', b),
  updateBlock: (id, b) => req('PUT', `/api/blocks/${id}`, b),
  deleteBlock: (id) => req('DELETE', `/api/blocks/${id}`),
  savePrefs: (p) => req('PUT', '/api/prefs', p),
  generate: () => req('POST', '/api/generate'),
  accept: (id, move) => req('POST', `/api/proposals/${id}/accept`, move || {}),
  reject: (id) => req('POST', `/api/proposals/${id}/reject`),
  undo: (id) => req('POST', `/api/proposals/${id}/undo`),
  acceptAll: () => req('POST', '/api/proposals/accept-all'),
  reset: () => req('POST', '/api/reset'),
};

const LOCAL_KEY = 'mi-semana:local';
// Subirlo cuando cambie el horario de ejemplo (7 = clases de Nivel 2 en módulos UDD, semana de lunes a sábado; sin certámenes ni actividades personales)
const SEED_VERSION = 7;

const readLocal = async () => {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; } // almacenamiento ilegible: partimos con la semana de ejemplo
};

/**
 * Motor de reglas corriendo en el teléfono. Siempre guarda una copia en el teléfono y,
 * si recibe `cloud` (Firestore), también la sube a la nube.
 */
async function createDevice(cloud) {
  // El horario UDD sale del catálogo de ramos en Firestore; sin conexión, de la copia incluida en la app
  // Las lecturas de la nube tienen un límite: sin señal seguimos con la copia del teléfono
  // (Firestore guarda las escrituras pendientes y las sube al volver la conexión)
  const fromCloud = (fn) => (cloud ? withTimeout(fn(), 5000).catch(() => null) : null);
  const ramos = (await fromCloud(() => cloud.ramos())) || undefined;
  // Si el catálogo de Firestore no trae ninguna clase (por ejemplo, editado por error), se usa la copia incluida
  // en la app: nadie debe abrir Mi Semana con el horario en blanco
  const clasesIniciales = () => {
    const desdeNube = ramos ? seedBlocks(ramos) : [];
    return desdeNube.some((b) => b.type === 'clase') ? desdeNube : seedBlocks();
  };
  const fresh = () => ({
    prefs: JSON.parse(JSON.stringify(DEFAULT_PREFS)), proposals: [], conflicts: [],
    generated: false, dirty: false, days: {}, dirtyDays: [], blocks: clasesIniciales(), seedVersion: SEED_VERSION,
  });
  // Nos quedamos con la versión más reciente: así lo hecho sin señal se sube al volver a conectarse.
  // Las semanas creadas con un horario de ejemplo anterior se descartan.
  const saved = [await readLocal(), await fromCloud(() => cloud.load())].filter((x) => x && x.seedVersion === SEED_VERSION)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  // La propuesta es por día: days[d] = { by: 'ia' | 'reglas', resumen, aiError } y dirtyDays = días desactualizados.
  // Semanas guardadas antes de este cambio: cada día que ya tenía sugerencias cuenta como generado.
  if (saved && !saved.days) {
    saved.days = {};
    if (saved.generated) new Set((saved.proposals || []).map((p) => p.day)).forEach((d) => { saved.days[d] = { by: saved.generatedBy || 'reglas', resumen: '', aiError: null }; });
    saved.dirtyDays = saved.dirty ? Object.keys(saved.days).map(Number) : [];
  }
  let s = { ...fresh(), ...saved };
  // Cada acción termina en snap(): ahí se guarda el estado
  const snap = async () => {
    s.updatedAt = Date.now();
    s.generated = Object.keys(s.days).length > 0;
    s.dirty = s.dirtyDays.length > 0;
    AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(s)).catch(() => {});
    if (cloud) cloud.save(JSON.parse(JSON.stringify(s)));
    return JSON.parse(JSON.stringify(s));
  };
  // Un cambio en un día deja desactualizada solo la propuesta de ese día (si ya tenía una)
  const touch = (...dias) => dias.forEach((d) => { if (s.days[d] && !s.dirtyDays.includes(d)) s.dirtyDays.push(d); });
  const findBlock = (id) => {
    const b = s.blocks.find((x) => x.id === id);
    if (!b) throw new Error('Bloque no encontrado');
    if (b.fixed) throw new Error('Este bloque viene del horario UDD y no se puede modificar');
    return b;
  };
  return {
    week: snap,
    // Solo autocuidado: la app no guarda actividades personales (privacidad)
    addBlock: async (b) => { s.blocks.push({ ...b, type: 'cuidado', cat: b.cat || 'pausas', id: nid(), fixed: false, source: 'user' }); touch(b.day); return snap(); },
    updateBlock: async (id, b) => { const cur = findBlock(id); const antes = cur.day; Object.assign(cur, b); touch(antes, cur.day); return snap(); },
    deleteBlock: async (id) => {
      const b = findBlock(id);
      s.blocks = s.blocks.filter((x) => x.id !== id);
      if (b.proposalId) s.proposals = s.proposals.map((p) => (p.id === b.proposalId ? resetProposal(p) : p));
      touch(b.day); return snap();
    },
    savePrefs: async (p) => { s.prefs = { ...s.prefs, ...p }; touch(...Object.keys(s.days).map(Number)); return snap(); },
    // Propuesta de un día (0 = lunes … 6 = domingo). Los demás días no se tocan.
    generate: async (day) => {
      // Primero la IA (vía Cloud Function); si falla o no hay señal, el motor de reglas
      let r = null, aiError = null;
      if (cloud) {
        try { r = await cloud.ia(s.blocks, s.prefs, day); } catch (e) { aiError = e.message || 'La IA no está disponible.'; }
      }
      const by = r ? 'ia' : 'reglas';
      if (!r) r = { ...generateDay(s.blocks, s.prefs, day), resumen: '' };
      // Para hoy no sirve proponer algo que ya pasó (ej. el almuerzo de las 13:00 si ya son las 15:00)
      const ahora = new Date();
      const yaPaso = (p) => day === TODAY && p.start < ahora.getHours() * 60 + ahora.getMinutes();
      s.proposals = mergeDayProposals(s.proposals, r.proposals.filter((p) => p.day === day && !yaPaso(p)), s.blocks, day);
      s.conflicts = [...s.conflicts.filter((c) => c.day !== day), ...r.conflicts.filter((c) => c.day === day)];
      s.days = { ...s.days, [day]: { by, resumen: r.resumen || '', aiError } };
      s.dirtyDays = s.dirtyDays.filter((d) => d !== day);
      return snap();
    },
    accept: async (id, move) => {
      s.proposals = s.proposals.map((p) => {
        if (p.id !== id || p.status === 'accepted') return p;
        const m = acceptProposal(p, move);
        s.blocks.push(blockFromProposal(m));
        return m;
      });
      return snap();
    },
    reject: async (id) => { s.proposals = s.proposals.map((p) => (p.id === id ? { ...p, status: 'rejected' } : p)); return snap(); },
    undo: async (id) => {
      s.blocks = s.blocks.filter((b) => b.proposalId !== id);
      s.proposals = s.proposals.map((p) => (p.id === id ? resetProposal(p) : p));
      return snap();
    },
    // Acepta todas las pendientes de un día (o de toda la semana si no se indica)
    acceptAll: async (day) => {
      s.proposals = s.proposals.map((p) => {
        if (p.status !== 'pending' || (day !== undefined && p.day !== day)) return p;
        s.blocks.push(blockFromProposal(p));
        return { ...p, status: 'accepted' };
      });
      return snap();
    },
    reset: async () => { if (cloud) await cloud.rotate(); s = fresh(); return snap(); },
  };
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * Devuelve { api, mode, store }. Orden: Firestore directo (si está configurado en app.json),
 * luego la API Node.js (si hay apiUrl) y, si nada responde, solo el teléfono.
 */
export async function connect() {
  if (firebaseConfigured()) {
    try {
      const cloud = await withTimeout(firestoreStorage(), 8000);
      return { api: await createDevice(cloud), mode: 'nube', store: 'firestore', direct: true };
    } catch (e) { console.warn('Firestore no disponible, sigo sin nube:', e.message); }
  }
  // La API Node.js solo se usa si la app no tiene Firebase configurado
  if (API_URL && !firebaseConfigured()) {
    try {
      const h = await req('GET', '/health');
      // /health no toca la base de datos: probamos /api/week para no quedar pegados si Firestore falla
      if (h.ok) { await remote.week(); return { api: remote, mode: 'nube', store: h.store }; }
    } catch (e) { /* sin servidor: seguimos en local */ }
  }
  return { api: await createDevice(null), mode: 'local', store: 'teléfono' };
}

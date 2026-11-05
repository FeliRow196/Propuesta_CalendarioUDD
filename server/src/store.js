'use strict';
/**
 * Capa de persistencia. Dos implementaciones con la misma interfaz:
 *  - FirestoreStore: usa Firestore (firebase-admin) cuando hay credenciales.
 *  - MemoryStore: respaldo en memoria para desarrollo y pruebas.
 *
 * Estructura en Firestore:
 *   users/{uid}                -> { prefs, proposals, conflicts, generated, dirty }
 *   users/{uid}/blocks/{id}    -> bloque de la agenda
 */
const { DEFAULT_PREFS, seedBlocks } = require('./engine');

const freshUser = () => ({
  prefs: JSON.parse(JSON.stringify(DEFAULT_PREFS)),
  proposals: [], conflicts: [], generated: false, dirty: false,
});

class MemoryStore {
  constructor() { this.users = new Map(); this.kind = 'memoria'; }
  _u(uid) {
    if (!this.users.has(uid)) {
      const blocks = new Map(seedBlocks().map((b) => [b.id, b]));
      this.users.set(uid, { doc: freshUser(), blocks });
    }
    return this.users.get(uid);
  }
  async getUser(uid) { return JSON.parse(JSON.stringify(this._u(uid).doc)); }
  async saveUser(uid, patch) { Object.assign(this._u(uid).doc, JSON.parse(JSON.stringify(patch))); }
  async listBlocks(uid) { return [...this._u(uid).blocks.values()].map((b) => ({ ...b })); }
  async putBlock(uid, b) { this._u(uid).blocks.set(b.id, { ...b }); }
  async deleteBlock(uid, id) { this._u(uid).blocks.delete(id); }
  async resetUser(uid) { this.users.delete(uid); this._u(uid); }
}

class FirestoreStore {
  constructor(db) { this.db = db; this.kind = 'firestore'; }
  _ref(uid) { return this.db.collection('users').doc(uid); }
  async _ensure(uid) {
    const snap = await this._ref(uid).get();
    if (snap.exists) return snap.data();
    const doc = freshUser();
    const batch = this.db.batch();
    batch.set(this._ref(uid), doc);
    seedBlocks().forEach((b) => batch.set(this._ref(uid).collection('blocks').doc(b.id), b));
    await batch.commit();
    return doc;
  }
  async getUser(uid) { return this._ensure(uid); }
  async saveUser(uid, patch) { await this._ensure(uid); await this._ref(uid).set(patch, { merge: true }); }
  async listBlocks(uid) {
    await this._ensure(uid);
    const qs = await this._ref(uid).collection('blocks').get();
    return qs.docs.map((d) => d.data());
  }
  async putBlock(uid, b) { await this._ref(uid).collection('blocks').doc(b.id).set(b); }
  async deleteBlock(uid, id) { await this._ref(uid).collection('blocks').doc(id).delete(); }
  async resetUser(uid) {
    const col = this._ref(uid).collection('blocks');
    const qs = await col.get();
    const batch = this.db.batch();
    qs.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(this._ref(uid));
    await batch.commit();
    await this._ensure(uid);
  }
}

/**
 * Elige Firestore si hay credenciales; si no, memoria.
 * Sin clave de cuenta de servicio basta con GOOGLE_CLOUD_PROJECT + `gcloud auth application-default login`.
 */
function createStore() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
  if (!json && !file && !projectId) return new MemoryStore();
  // Solo se cargan cuando se necesitan (firebase-admin v14 usa módulos separados)
  const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({
    credential: json ? cert(JSON.parse(json)) : applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
  const db = getFirestore(app);
  // Algunos campos opcionales pueden quedar undefined; sin esto Firestore rechaza el guardado
  db.settings({ ignoreUndefinedProperties: true });
  return new FirestoreStore(db);
}

module.exports = { createStore, MemoryStore, FirestoreStore };

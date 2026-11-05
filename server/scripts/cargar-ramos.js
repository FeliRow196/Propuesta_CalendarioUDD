'use strict';
/**
 * Carga (o actualiza) el catálogo de ramos en Firestore: colección "ramos", un documento por ramo.
 * Uso:  $env:GOOGLE_CLOUD_PROJECT="modulomiudd"; npm run cargar-ramos
 * Después se pueden corregir salas u horarios desde la consola de Firebase sin recompilar la app.
 */
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { RAMOS } = require('../src/engine');

const json = process.env.FIREBASE_SERVICE_ACCOUNT;
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
const db = getFirestore(initializeApp({
  credential: json ? cert(JSON.parse(json)) : applicationDefault(),
  ...(projectId ? { projectId } : {}),
}));

(async () => {
  const batch = db.batch();
  RAMOS.forEach((r) => batch.set(db.collection('ramos').doc(r.id), r));
  await batch.commit();
  for (const n of [1, 2]) {
    console.log(`Nivel ${n}:`);
    RAMOS.filter((r) => r.nivel === n).forEach((r) => console.log(`  ✔ ${r.nombre}`));
  }
  console.log(`${RAMOS.length} ramos cargados en Firestore (colección "ramos").`);
})().catch((e) => { console.error('No se pudieron cargar los ramos:', e.message); process.exit(1); });

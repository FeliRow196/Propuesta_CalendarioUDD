'use strict';
/**
 * Cloud Functions de Mi Semana.
 * propuestaIA: la app le envía su semana (clases + autocuidado y preferencias) y recibe
 * la propuesta de autocuidado escrita por Gemini. La clave de Gemini vive en Secret Manager
 * y debe venir de un proyecto de Google SIN facturación, para que use solo la cuota gratuita.
 */
const { onCall, HttpsError } = require('firebase-functions/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleGenAI } = require('@google/genai');
const { proponerConIA } = require('./ia');

initializeApp();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const LIMITE_DIARIO = 20; // propuestas con IA por participante al día (cuida la cuota)

exports.propuestaIA = onCall({
  region: 'southamerica-east1', // misma región que Firestore
  secrets: [GEMINI_API_KEY],
  timeoutSeconds: 120,
  memory: '512MiB',
  maxInstances: 5,
  // Callable de Firebase: el servicio es invocable y la protección está aquí (sesión, validación y límite diario)
  invoker: 'public',
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes abrir la app con sesión para usar la IA.');

  const { blocks, prefs, dia } = request.data || {};
  if (!Array.isArray(blocks) || blocks.length > 300 || typeof prefs !== 'object' || prefs === null
    || (dia !== undefined && !(Number.isInteger(dia) && dia >= 0 && dia <= 5))) {
    throw new HttpsError('invalid-argument', 'La semana enviada no es válida.');
  }
  // Solo clases y autocuidado: nunca actividades personales (privacidad)
  const semana = blocks
    .filter((b) => (b.type === 'clase' || b.type === 'cuidado') && Number.isInteger(b.day) && Number.isInteger(b.start) && Number.isInteger(b.end))
    .map((b) => ({ day: b.day, start: b.start, end: b.end, type: b.type, cat: b.cat, title: String(b.title || '').slice(0, 80), place: String(b.place || '').slice(0, 60) }));

  // Límite diario por participante
  const hoy = new Date().toISOString().slice(0, 10);
  const uso = getFirestore().collection('usoIA').doc(`${uid}_${hoy}`);
  const n = await getFirestore().runTransaction(async (tx) => {
    const actual = (await tx.get(uso)).data()?.n || 0;
    if (actual >= LIMITE_DIARIO) return actual;
    tx.set(uso, { uid, dia: hoy, n: FieldValue.increment(1) }, { merge: true });
    return actual;
  });
  if (n >= LIMITE_DIARIO) throw new HttpsError('resource-exhausted', `Llegaste al límite de ${LIMITE_DIARIO} propuestas con IA por hoy.`);

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
  try {
    return await proponerConIA(ai, semana, prefs, dia);
  } catch (e) {
    console.error('propuestaIA falló:', e);
    throw new HttpsError('unavailable', e.message || 'La IA no está disponible ahora.');
  }
});

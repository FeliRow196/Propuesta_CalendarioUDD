/**
 * Conexión directa de la app a Firestore (sin servidor).
 * Cada teléfono entra con Autenticación anónima: recibe un uid propio sin pedir login,
 * y las reglas de Firestore solo le permiten leer y escribir users/{su uid}.
 * La configuración viene de app.json → extra.firebase (no es secreta).
 */
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, signInAnonymously, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const config = Constants.expoConfig?.extra?.firebase;
let services = null;

function init() {
  if (!services) {
    const app = initializeApp(config);
    services = {
      // La sesión anónima se guarda en el teléfono: el mismo uid al volver a abrir la app
      auth: initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }),
      db: initializeFirestore(app, { ignoreUndefinedProperties: true }),
      // Cloud Functions (propuesta con IA), en la misma región que Firestore
      functions: getFunctions(app, 'southamerica-east1'),
    };
  }
  return services;
}

export const firebaseConfigured = () => Boolean(config?.apiKey && config?.projectId && config?.appId);

async function currentUid() {
  const { auth } = init();
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

/**
 * Almacenamiento en Firestore: un documento users/{uid} con toda la semana.
 * load() devuelve null si el usuario es nuevo.
 */
export async function firestoreStorage() {
  const { auth, db, functions } = init();
  let ref = doc(db, 'users', await currentUid());
  const propuestaIA = httpsCallable(functions, 'propuestaIA', { timeout: 100000 });
  return {
    // Propuesta de un día escrita por la IA (Cloud Function). Devuelve { proposals, conflicts, resumen } o lanza un error
    ia: async (blocks, prefs, dia) => (await propuestaIA({ blocks, prefs, dia })).data,
    load: async () => {
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
    // Catálogo de ramos (colección "ramos"); null si está vacío o no se puede leer
    ramos: async () => {
      try {
        const qs = await getDocs(collection(db, 'ramos'));
        return qs.empty ? null : qs.docs.map((d) => d.data());
      } catch (e) { return null; }
    },
    // Firestore encola la escritura si no hay señal y la sube al volver la conexión
    save: (state) => setDoc(ref, state).catch((e) => console.warn('No se pudo guardar en Firestore:', e.message)),
    // "Nuevo participante": nueva sesión anónima → nuevo documento en Firestore
    rotate: async () => {
      await signOut(auth);
      ref = doc(db, 'users', await currentUid());
    },
  };
}

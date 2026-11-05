# Mi UDD · Mi Semana

Prototipo funcional para presentar en la universidad: una recreación del Inicio de **Mi UDD** con un módulo nuevo, **Mi Semana**. El módulo toma tus clases UDD y te propone espacios de autocuidado: descanso, comidas, pausas y actividad física. Por privacidad (y para no cargar la base de datos) no guarda actividades personales: solo clases y autocuidado.

Es la versión nativa del prototipo web `Mejora_miudd`. Se usa la misma lógica, ahora como app Android real.

| Capa | Tecnología |
|---|---|
| App móvil | React Native con Expo (SDK 58) |
| Base de datos | Firestore, directo desde la app (SDK de Firebase + Autenticación anónima) |
| API (opcional) | Node.js (`http` nativo, sin frameworks) con `firebase-admin` |
| APK | EAS Build (`buildType: apk`) |

```
mi-udd-app/
├── mobile/            App React Native (Expo)
│   ├── App.js         Navegación Inicio ↔ Mi Semana + menú lateral
│   ├── src/api.js     Datos: Firestore directo → API → modo local (en ese orden)
│   ├── src/firebase.js Conexión a Firestore con sesión anónima
│   ├── src/engine.js  Motor de reglas (copia de server/src/engine.js)
│   ├── src/screens/   HomeScreen (Inicio Mi UDD) y WeekModule (módulo nuevo)
│   └── src/components EditSheet (crear/editar/mover) y ui (botones, chips…)
└── server/            API Node.js + Firestore
    ├── src/engine.js  Reglas: huecos libres, conflictos, propuestas
    ├── src/store.js   Firestore o memoria (según credenciales)
    ├── src/app.js     Endpoints REST
    └── test/          21 pruebas (motor + API)
```

## Funcionalidades del módulo Mi Semana

- **Mi semana:** selector de lunes a sábado con una barra de color por día (rojo = ya pasó, amarillo = hoy, verde = falta). También tiene una línea de tiempo con los bloques del día, los huecos libres (toca uno para agendar ahí) y el botón **+**. Las clases y los certámenes vienen del horario UDD y no se pueden editar.
- **Alertas:** cruces de horario, días sobrecargados (10 h o más), 4 h seguidas sin pausa, días sin hueco para almorzar y días en que terminas muy tarde.
- **Preferencias:** hora de levantarse, horas de sueño, *modo certamen*, almuerzo, pausas y actividad física. Además puedes ordenar tus prioridades (si no alcanza el tiempo, se agenda primero lo de arriba).
- **Mi propuesta (por día):** eliges el día y la app propone solo para ese día (usando el resto de la semana como contexto). Cada sugerencia trae su motivo y se puede **Aceptar**, **Mover** a otro día u hora (con huecos sugeridos) o **Rechazar**, y todo tiene **Deshacer**. **Aceptar todas** y **Regenerar** actúan solo sobre el día elegido. Si cambias un día o tus preferencias, la app avisa qué días quedaron desactualizados.
- **Menú lateral:** opción "Nuevo participante (reiniciar)" para hacer pruebas con usuarios.

> Las propuestas se generan con reglas. No hay un modelo de IA real detrás.

## Firestore sin servidor (cómo funciona la app sola)

La app se conecta **directo a Firestore**; no necesita el notebook ni la API.

- La configuración del proyecto Firebase está en `mobile/app.json` → `extra.firebase` (no es secreta).
- Cada teléfono entra con **Autenticación anónima** (Firebase → Authentication → Anónimo debe estar activado) y guarda su semana en `users/{uid}`.
- Las reglas de [`firestore.rules`](firestore.rules) solo dejan a cada teléfono leer y escribir su propio documento.
- Sin señal, la app sigue funcionando con la copia guardada en el teléfono y se sincroniza al volver a conectarse.
- "Nuevo participante (reiniciar)" crea otra sesión anónima: el participante anterior queda guardado en Firestore.
- **Ramos:** la colección `ramos` tiene los 16 ramos de Nivel 1 y Nivel 2 de Ingeniería Informática (sin Créditos Extra Disciplinares). El horario de ejemplo usa los de **Nivel 2**; sus salas y horarios se pueden editar en la consola de Firebase y se aplican a los participantes nuevos. Para volver a cargarlos: `cd server` y `$env:GOOGLE_CLOUD_PROJECT="modulomiudd"; npm run cargar-ramos`.

Si `extra.firebase` no está, la app usa la API (`extra.apiUrl`) y, si tampoco responde, el modo local. Lo que sigue sobre la API es opcional.

---

## 1. Correr la API (Node.js)

Requisito: Node 22 o superior.

```bash
cd server
npm install
npm test          # 21 pruebas
npm start         # http://localhost:3000
```

Sin credenciales, la API guarda los datos **en memoria**. Sirve para desarrollar, pero los datos se pierden al reiniciar.

### Conectar Firestore

1. En la [consola de Firebase](https://console.firebase.google.com), crea un proyecto y activa **Firestore Database** (modo producción).
2. Ve a *Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada*. Eso descarga un `.json`.
3. Inicia la API apuntando a ese archivo:

```bash
# Linux / macOS
GOOGLE_APPLICATION_CREDENTIALS=./clave.json npm start
# Windows PowerShell
$env:GOOGLE_APPLICATION_CREDENTIALS=".\clave.json"; npm start
```

Al abrir `http://localhost:3000/health` debería responder `{"ok":true,"store":"firestore"}`.

**Si Firebase dice "No se permite crear claves en esta cuenta de servicio"** (política de la organización), usa tu cuenta de Google en vez de una clave. Requiere [Google Cloud CLI](https://cloud.google.com/sdk/docs/install):

```powershell
gcloud auth application-default login                     # abre el navegador, entra con la cuenta dueña del proyecto
gcloud auth application-default set-quota-project <id-del-proyecto>
$env:GOOGLE_CLOUD_PROJECT="<id-del-proyecto>"; npm start
```

Estructura en Firestore: `users/{uid}` guarda las preferencias y la propuesta, y `users/{uid}/blocks/{id}` guarda cada actividad.

⚠️ **No subas `clave.json` a GitHub.** Ya está en `.gitignore`.

### Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Estado y tipo de almacenamiento |
| GET | `/api/week` | Semana completa (bloques, preferencias, propuesta) |
| POST/PUT/DELETE | `/api/blocks[/:id]` | Crear, editar o borrar actividades propias |
| PUT | `/api/prefs` | Guardar preferencias |
| POST | `/api/generate` | Generar propuesta |
| POST | `/api/proposals/:id/accept\|reject\|undo` | Acciones sobre una sugerencia (`accept` acepta `{day,start,end}` para mover) |
| POST | `/api/proposals/accept-all` | Aceptar todas |
| POST | `/api/reset` | Volver a la semana de ejemplo |

El usuario se identifica con el header `x-user-id`. La app usa `demo-felipe`.

---

## 2. Correr la app en tu celular (desarrollo)

```bash
cd mobile
npm install
npx expo install --fix   # alinea las versiones exactas con el SDK de Expo
npx expo start
```

Escanea el QR con **Expo Go** en Android.

**Conectar la app a tu API:** en `mobile/app.json`, cambia `extra.apiUrl` por la IP de tu notebook en la red WiFi (en Windows: `ipconfig` → "Dirección IPv4"). Por ejemplo, `http://192.168.1.15:3000`. El celular y el notebook deben estar en la misma red.

Si la app no encuentra la API, entra en **modo local** automáticamente y funciona igual, con los datos guardados solo en el teléfono (se mantienen al cerrar la app; "Nuevo participante" los reinicia). En la barra del módulo verás **☁ Firestore** o **📱 Local**.

---

## 3. Generar el APK

### Opción A · En la nube con EAS (recomendada, no necesitas Android Studio)

```bash
npm install -g eas-cli
cd mobile
eas login                 # cuenta gratuita de expo.dev
eas build:configure       # solo la primera vez, acepta lo que propone
npm run build:apk         # = eas build -p android --profile preview
```

Tarda unos 10 a 20 minutos. Al final te entrega un **enlace y un QR para descargar el `.apk`**. Ábrelo en el celular e instálalo (Android te pedirá permitir "orígenes desconocidos").

### Opción B · Local con Android Studio

Requiere Android Studio + JDK 17.

```bash
cd mobile
npx expo prebuild -p android
cd android
./gradlew assembleRelease      # Windows: gradlew.bat assembleRelease
```

El APK queda en `android/app/build/outputs/apk/release/app-release.apk`.

### Para la presentación: API pública

El APK ya usa Firestore directo (ver "Firestore sin servidor"), así que no depende de tu WiFi ni de tu notebook.

---

## Notas

- `mobile/src/engine.js` es una copia de `server/src/engine.js`. Si cambias las reglas, copia el archivo de nuevo.
- Es un prototipo académico: el horario, el QR y los datos son de ejemplo.

---

## Propuesta con IA (Gemini, sin costo)

En **Mi propuesta**, la app le pide las sugerencias a **Gemini** (plan gratuito de la API de Google) a través de una Cloud Function (`functions/`, región `southamerica-east1`):

- La app envía solo sus clases, el autocuidado ya agendado y las preferencias (nunca datos personales).
- Gemini responde en JSON con un esquema fijo; la función revisa que cada sugerencia calce en un hueco libre real y descarta las que no.
- Modelos: `gemini-3.8-flash` y, si se agota su cuota gratis, `gemini-3.5-flash-lite`. Si ambos fallan o no hay señal, la propuesta sale de las reglas y la app lo avisa.
- Las alertas se siguen calculando con reglas. Límite: 20 propuestas con IA por participante al día.
- En el plan gratuito, Google puede usar lo enviado para mejorar sus productos (por eso solo se envían clases y preferencias).

**Para que no cueste nada:** crea la clave en [Google AI Studio](https://aistudio.google.com) (*Get API key*) dentro de un proyecto **sin facturación** (no uses `modulomiudd`, que tiene Blaze). Sin facturación, Google no puede cobrar: si se agota la cuota, la IA simplemente no responde y la app usa las reglas.

**Activarla (una vez):**

```powershell
cd C:\Users\Felip\Downloads\mi-udd-app\mi-udd-app
npx firebase-tools login
npx firebase-tools functions:secrets:set GEMINI_API_KEY   # pega la clave de AI Studio
npx firebase-tools deploy --only functions
```

Antes de publicar, Firebase copia `server/src/engine.js` a `functions/engine.js` automáticamente (`npm run copiar-motor` dentro de `functions/`).

Pruebas de la función (sin gastar cuota): `cd functions` y `npm test`.

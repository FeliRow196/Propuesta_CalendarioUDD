# Mi UDD · Mi Semana

🏆 **Primer lugar · Concurso Semana i+ 2026 (Universidad del Desarrollo)**

**Mi Semana** es un módulo de bienestar estudiantil pensado para vivir dentro de la app **Mi UDD**. Lee el horario de clases, detecta dónde se concentra la carga de la semana y propone espacios de autocuidado (comidas, pausas, actividad física y descanso) en los huecos libres reales. El estudiante siempre decide: cada sugerencia se puede aceptar, mover o rechazar.

📄 **Informe del proyecto:** [docs/Informe_CalendarioUDD.pdf](docs/Informe_CalendarioUDD.pdf) ([versión .docx](docs/Informe_CalendarioUDD.docx))

---

## El problema

Una jornada UDD puede tener hasta 8 módulos de 1 h 10 min separados por recreos de 10 minutos, que apenas alcanzan para cambiar de sala. En semanas de certámenes el almuerzo se reduce a lo que sobre entre dos clases, la pausa no ocurre y el sueño cede frente al estudio.

En una encuesta del equipo a 40 estudiantes UDD:

- El **50 %** calificó su estrés académico en 4 o 5 (escala de 1 a 5).
- Lo primero que sacrifican es **dormir 7-8 horas** (36,8 %), luego las pausas (26,3 %), la alimentación (21,1 %) y la actividad física (15,8 %).
- La principal barrera no es la falta de interés, sino el **agotamiento mental** (42,1 %).

Las agendas de papel y los calendarios genéricos se abandonan justo en las semanas críticas, porque mantenerlos exige energía. Las herramientas de productividad con IA imponen bloques y quitan el control al estudiante.

## La solución

- **Cero fricción:** las clases ya vienen cargadas; el estudiante no transcribe nada.
- **Visibilidad de la carga:** cada día muestra horas de clase, tiempo libre y nivel de carga, con alertas por cruces, más de 4 h seguidas sin pausa, días sin hueco para almorzar y días que terminan tarde.
- **Sugerencias, no imposiciones:** la propuesta del día explica el motivo de cada sugerencia, y todo se puede aceptar, mover, rechazar o deshacer.
- **IA verificada por código:** Gemini redacta y personaliza la propuesta, y el motor de reglas comprueba que cada sugerencia calce en un hueco real. Si la IA no responde, la propuesta sale de las reglas.
- **Privacidad por diseño:** solo se guardan clases y autocuidado (nunca actividades personales), con acceso anónimo.

> El proyecto nació como un [prototipo web](https://felirow196.github.io/Mejora_miudd/) durante Semana-i y evolucionó a esta app Android nativa.

## Equipo

**Calendario UDD**, estudiantes de Ingeniería Civil en Informática, UDD Concepción:

- Felipe Rubilar
- Mauro Pérez

---

## Arquitectura

| Capa | Tecnología |
|---|---|
| App móvil | React Native 0.88 con Expo SDK 58 |
| Base de datos | Cloud Firestore, directo desde la app (SDK de Firebase + autenticación anónima) |
| IA | Cloud Function `propuestaIA` (Node.js 22) con Gemini; clave en Secret Manager |
| API opcional | Node.js (`http` nativo, sin frameworks) con `firebase-admin` |
| Pruebas | `node:test` (motor, API y capa de IA) |
| APK | EAS Build |

```
mi-udd-app/
├── mobile/              App React Native (Expo)
│   ├── App.js           Navegación Inicio ↔ Mi Semana + menú lateral
│   ├── src/api.js       Datos: Firestore directo → API → modo local (en ese orden)
│   ├── src/firebase.js  Conexión a Firestore con sesión anónima
│   ├── src/engine.js    Motor de reglas (copia de server/src/engine.js)
│   ├── src/screens/     HomeScreen (Inicio Mi UDD) y WeekModule (módulo nuevo)
│   └── src/components/  EditSheet (crear/editar/mover) y ui (botones, chips…)
├── functions/           Cloud Function de IA (Gemini) y sus pruebas
├── server/              API Node.js opcional + motor de reglas
│   ├── src/engine.js    Reglas: huecos libres, carga, alertas, propuestas
│   ├── src/store.js     Firestore o memoria (según credenciales)
│   ├── src/app.js       Endpoints REST
│   └── test/            Pruebas del motor y la API
├── docs/                Informe del proyecto
└── firestore.rules      Cada sesión solo lee y escribe su propio documento
```

El motor de reglas (`server/src/engine.js`) son funciones puras sin dependencias. El mismo archivo corre en el teléfono, en la API y en la Cloud Function.

### Datos en Firestore

- `users/{uid}`: la semana de cada participante (bloques, preferencias, propuestas y alertas).
- `ramos/{ramoId}`: catálogo de ramos (16 ramos de Nivel 1 y 2 de Ingeniería Informática). Se puede editar sin recompilar la app.
- `usoIA/{uid}_{fecha}`: contador diario de propuestas con IA (límite de 20 por participante al día), solo accesible desde el backend.

> **Sobre la configuración de Firebase:** `mobile/app.json → extra.firebase` contiene la configuración web del proyecto. No es secreta: la seguridad la dan las reglas de [`firestore.rules`](firestore.rules) y la autenticación anónima. Si haces un fork, reemplázala por la de tu propio proyecto.

---

## Cómo correrlo

Requisito: Node 22 o superior.

### App (desarrollo)

```bash
cd mobile
npm install
npx expo install --fix
npx expo start          # escanea el QR con Expo Go en Android
```

Sin conexión a Firebase ni a la API, la app entra en **modo local** y funciona igual, con los datos guardados en el teléfono.

### Pruebas

```bash
cd server && npm install && npm test
cd functions && npm install && npm test   # usa un cliente de IA simulado, no gasta cuota
```

### APK

```bash
npm install -g eas-cli
cd mobile
eas login
npm run build:apk       # = eas build -p android --profile preview
```

EAS entrega un enlace y un QR para descargar el `.apk`.

### API opcional (Node.js)

```bash
cd server
npm start               # http://localhost:3000, datos en memoria
```

Para usar Firestore, inicia con `GOOGLE_APPLICATION_CREDENTIALS=./clave.json` (clave de cuenta de servicio) o con `gcloud auth application-default login` y `GOOGLE_CLOUD_PROJECT=<id-del-proyecto>`. **No subas la clave al repositorio** (ya está en `.gitignore`).

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Estado y tipo de almacenamiento |
| GET | `/api/week` | Semana completa (bloques, preferencias, propuesta) |
| POST/PUT/DELETE | `/api/blocks[/:id]` | Crear, editar o borrar actividades |
| PUT | `/api/prefs` | Guardar preferencias |
| POST | `/api/generate` | Generar propuesta |
| POST | `/api/proposals/:id/accept\|reject\|undo` | Acciones sobre una sugerencia |
| POST | `/api/proposals/accept-all` | Aceptar todas |
| POST | `/api/reset` | Volver a la semana de ejemplo |

### Propuesta con IA (Gemini)

La Cloud Function usa el plan gratuito de la API de Gemini. Crea la clave en [Google AI Studio](https://aistudio.google.com) y publícala:

```bash
npx firebase-tools login
npx firebase-tools functions:secrets:set GEMINI_API_KEY
npx firebase-tools deploy --only functions
```

La app solo envía clases, autocuidado agendado y preferencias, nunca datos personales. Si la IA no responde, la propuesta se genera con reglas y la app lo avisa.

---

## Estado y próximos pasos

Es un prototipo: el Inicio de Mi UDD es una recreación y todos los participantes parten con un horario de ejemplo de Nivel 2. Los siguientes pasos son un piloto de 3 semanas con estudiantes de primer año y, después, la integración con el horario real de Mi UDD. Los detalles están en el [informe](docs/Informe_CalendarioUDD.pdf).

export const C = {
  blue: '#0B4F8A', navy: '#1d3f6e',
  // Azul UDD: color principal de toda la app (Inicio y Mi Semana)
  udd: '#0D4B8E', uddHero: '#0B66A1', uddTitle: '#0D5AA7', uddBorder: '#0A2E5C', uddLink: '#29A9E1',
  ink: '#1f2328', muted: '#6b7280', line: '#e7e7ea', soft: '#f6f6f8', white: '#fff',
  clase: '#1F6FB5', claseBg: '#EAF2FB',
  cert: '#D23A2A', certBg: '#FDECEA',
  cuid: '#1E8E5A', cuidBg: '#E7F6EE',
  warn: '#9A6200', warnBg: '#FFF4DB',
};

export const TYPE = {
  clase: { label: 'Clase', color: C.clase, bg: C.claseBg, text: '#0f4a80' },
  certamen: { label: 'Certamen', color: C.cert, bg: C.certBg, text: '#9b2114' },
  cuidado: { label: 'Autocuidado', color: C.cuid, bg: C.cuidBg, text: '#136a43' },
};

export const CAT = {
  descanso: { label: 'Descanso', em: '🌙' },
  alimentacion: { label: 'Alimentación', em: '🍽️' },
  pausas: { label: 'Pausas', em: '🧘' },
  actividad: { label: 'Actividad física', em: '🏃' },
};

// Igual que Mi UDD, la semana va de lunes a sábado (sin domingo)
export const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAYS_L = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Semana real del calendario según la fecha del teléfono
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const hoy = new Date();
const dow = (hoy.getDay() + 6) % 7; // getDay(): 0 = domingo → 0 = lunes … 6 = domingo
// El domingo no está en Mi UDD: se muestra la semana que empieza mañana y ningún día cuenta como pasado (TODAY = -1)
export const TODAY = dow === 6 ? -1 : dow;
const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow + (dow === 6 ? 7 : 0));
const WEEK = DAYS.map((_, i) => new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i));
export const DATES = WEEK.map((d) => d.getDate());
const [ini, fin] = [WEEK[0], WEEK[WEEK.length - 1]];
export const WEEK_LABEL = ini.getMonth() === fin.getMonth()
  ? `Lun ${ini.getDate()} – Sáb ${fin.getDate()} ${MESES[fin.getMonth()]}`
  : `Lun ${ini.getDate()} ${MESES[ini.getMonth()]} – Sáb ${fin.getDate()} ${MESES[fin.getMonth()]}`;
export const LEVEL_COLOR = { ok: '#3BB273', mid: '#F2A93B', high: '#E5483A' };

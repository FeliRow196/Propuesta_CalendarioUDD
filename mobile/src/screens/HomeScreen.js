/**
 * Inicio: recreación de la pantalla principal actual de Mi UDD (prototipo académico)
 * con el acceso al nuevo módulo "Mi Semana" en Servicios.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { C, TODAY } from '../theme';
import { Icon } from '../components/ui';
import { fmt, dayBlocks } from '../engine';

function FakeQR() {
  // QR decorativo y determinista (no codifica datos reales)
  const cells = useMemo(() => {
    const n = 21; let seed = 7; const out = [];
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const finder = (x, y) => (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    const finderOn = (x, y) => {
      const fx = x > 13 ? x - 14 : x, fy = y > 13 ? y - 14 : y;
      return fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
    };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = finder(x, y) ? finderOn(x, y) : rnd() > 0.52;
      out.push(v);
    }
    return out;
  }, []);
  return (
    <View style={{ width: 168, height: 168, flexDirection: 'row', flexWrap: 'wrap' }}>
      {cells.map((on, i) => <View key={i} style={{ width: 8, height: 8, backgroundColor: on ? '#111' : '#fff' }} />)}
    </View>
  );
}

const TILES = [
  ['account-outline', '#1E7B4E', 'Credencial'], ['school-outline', '#1F6FB5', 'Mi UDD'],
  ['calendar-minus', '#1F6FB5', 'Horario'], ['alpha-c-circle-outline', '#2A6FB0', 'Canvas'],
  ['briefcase-outline', '#1E7B4E', 'Mercado\nLaboral'], ['qrcode-scan', '#8B1E2B', 'Lector QR'],
  ['calendar-plus', '#E8722E', 'Reservas'],
];

export default function HomeScreen({ week, onOpen, onMenu }) {
  const [qr, setQr] = useState(false);
  // "Hoy": clases UDD del día de la semana actual + propuestas de Mi Semana que el estudiante aceptó
  const today = dayBlocks(week?.blocks || [], TODAY).filter((b) => b.type === 'clase' || b.source === 'ia');
  const soon = (l) => Alert.alert(l.replace('\n', ' '), 'Este servicio no forma parte del prototipo.');

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      {/* Barra fija fuera del ScrollView: como encabezado "sticky" perdía su diseño en fila en Android */}
      <View style={s.appbar}>
        <Pressable onPress={onMenu} hitSlop={10}><Icon name="menu" size={30} color="#7FA6D3" /></Pressable>
        <Text style={s.appT} numberOfLines={1}>Mi UDD - Concepción</Text>
        <View style={s.av}>
          <Icon name="account-circle" size={36} color={C.white} />
          <View style={s.badge}><Text style={s.badgeT}>1</Text></View>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }}>

      <View style={s.hero}>
        <View style={s.greet}>
          <View style={s.pic}><Icon name="account" size={40} color="#c3c6cc" /></View>
          <View><Text style={s.greetB}>Hola, FELIPE</Text><Text style={s.greetS}>Alumno Vigente</Text></View>
        </View>
        <View style={s.qrCard}>
          <Pressable style={s.qrHead} onPress={() => setQr(!qr)}>
            <Text style={s.qrT}>Código QR</Text>
            <Icon name={qr ? 'chevron-up' : 'chevron-down'} size={28} color={C.ink} />
          </Pressable>
          {qr && <View style={{ alignItems: 'center', paddingBottom: 18, gap: 6 }}><FakeQR /><Text style={{ color: C.muted, fontSize: 12 }}>QR de ejemplo · prototipo</Text></View>}
        </View>
      </View>

      <View style={s.rate}>
        <Text style={s.rateT}>¿Te gusta la nueva App?</Text>
        <Text style={s.rateS}>¡Califícanos en App Store o Google Play!</Text>
        <Pressable style={s.rateB} onPress={() => soon('Calificar la App')}>
          <Text style={s.rateBT}>Calificar la App</Text>
        </Pressable>
      </View>

      <View style={s.secH}>
        <Text style={s.secT}>Servicios</Text>
        <View style={s.allRow}><Text style={s.all}>Ver todo</Text><Icon name="chevron-right" size={24} color={C.ink} /></View>
      </View>
      <View style={s.grid}>
        {TILES.map(([i, c, l]) => (
          <Pressable key={l} style={s.tile} onPress={() => soon(l)}>
            <Icon name={i} size={36} color={c} /><Text style={s.tileT}>{l}</Text>
          </Pressable>
        ))}
        <Pressable style={[s.tile, s.tileNew]} onPress={onOpen}>
          <View style={s.tag}><Text style={s.tagT}>NUEVO</Text></View>
          <Icon name="calendar-heart" size={36} color={C.udd} /><Text style={s.tileT}>Mi Semana</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => soon('Editar accesos directos')}>
        <Text style={s.edit}>Editar accesos directos</Text>
      </Pressable>

      <View style={s.secH}>
        <Text style={[s.secT, { color: C.uddTitle }]}>Hoy</Text>
        <Pressable style={s.allRow} onPress={onOpen}><Text style={s.all}>Ver todo</Text><Icon name="chevron-right" size={24} color={C.ink} /></Pressable>
      </View>
      {today.length === 0 && <Text style={s.empty}>No se encontraron resultados</Text>}
      {today.map((b) => (b.source === 'ia' ? (
        <Pressable key={b.id} style={[s.today, s.todayCare]} onPress={onOpen}>
          <Text style={[s.todayB, { color: C.cuid }]} numberOfLines={1}>MI SEMANA · {b.title.toUpperCase()}</Text>
          <Text style={s.todayTime}>{fmt(b.start)} - {fmt(b.end)}</Text>
          {b.place ? <Text style={[s.todayLoc, { color: C.cuid }]}>{b.place.toUpperCase()}</Text> : null}
        </Pressable>
      ) : (
        <View key={b.id} style={s.today}>
          <Text style={s.todayB} numberOfLines={1}>{b.title.toUpperCase()}</Text>
          <Text style={s.todayTime}>{fmt(b.start)} - {fmt(b.end)}</Text>
          <Text style={s.todayLoc}>CÁTEDRA{b.place ? ` · ${b.place.toUpperCase()}` : ''}</Text>
        </View>
      )))}

      <View style={s.bottom}><Icon name="map-marker-account-outline" size={24} color={C.white} /><Text style={s.bottomT}>Información de ubicación de Android</Text></View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  appbar: { backgroundColor: C.udd, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 64, gap: 8 },
  appT: { flex: 1, textAlign: 'center', color: C.white, fontSize: 22, fontWeight: '500' },
  av: { width: 36, height: 36 },
  badge: { position: 'absolute', top: -6, right: -8, backgroundColor: '#B0102A', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeT: { color: C.white, fontSize: 11, fontWeight: '700' },
  hero: { backgroundColor: C.uddHero, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 26 },
  greet: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pic: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eceef1', borderWidth: 2, borderColor: C.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  greetB: { color: C.white, fontWeight: '700', fontSize: 16 },
  greetS: { color: C.white, fontSize: 17, marginTop: 2 },
  qrCard: { marginTop: 18, backgroundColor: C.white, borderRadius: 10 },
  qrHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 24, paddingHorizontal: 18 },
  qrT: { color: C.uddTitle, fontWeight: '800', fontSize: 21 },
  rate: { paddingHorizontal: 32, paddingTop: 26 },
  rateT: { color: C.uddTitle, fontWeight: '800', fontSize: 21 },
  rateS: { color: C.ink, fontSize: 16, marginTop: 12 },
  rateB: { alignSelf: 'flex-start', marginTop: 16, backgroundColor: C.udd, borderWidth: 1.5, borderColor: C.uddBorder, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 12 },
  rateBT: { color: C.white, fontSize: 17, fontWeight: '500' },
  secH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 30, paddingBottom: 14 },
  secT: { fontSize: 23, fontWeight: '800', color: '#2b2b2b' },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  all: { fontSize: 15, color: C.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  tile: { width: '30%', minHeight: 92, margin: '1.66%', backgroundColor: C.white, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 3, shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  tileNew: { borderWidth: 2, borderColor: C.udd },
  tileT: { fontWeight: '700', fontSize: 13, color: '#333', textAlign: 'center' },
  tag: { position: 'absolute', top: -9, right: -4, backgroundColor: C.udd, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  tagT: { color: C.white, fontSize: 9.5, fontWeight: '800' },
  edit: { color: C.uddLink, fontSize: 17, paddingHorizontal: 40, paddingTop: 20 },
  empty: { fontSize: 15, fontWeight: '700', color: C.ink, paddingHorizontal: 14, paddingBottom: 30 },
  today: { paddingHorizontal: 14, paddingVertical: 10 },
  todayCare: { backgroundColor: C.cuidBg, marginHorizontal: 8, borderRadius: 12, marginVertical: 2 },
  todayB: { fontSize: 15, fontWeight: '800', color: C.ink },
  todayTime: { fontSize: 16, marginVertical: 2, color: C.ink },
  todayLoc: { fontSize: 12, color: '#2a7bbf' },
  bottom: { backgroundColor: C.uddHero, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 18 },
  bottomT: { color: C.white, fontSize: 16 },
});

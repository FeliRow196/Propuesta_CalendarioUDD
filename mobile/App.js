import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator, BackHandler, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import WeekModule from './src/screens/WeekModule';
import { Icon } from './src/components/ui';
import { connect } from './src/api';
import { C } from './src/theme';

export default function App() {
  const [conn, setConn] = useState(null); // { api, mode, store }
  const [week, setWeek] = useState(null);
  const [screen, setScreen] = useState('home');
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    // Siempre en vertical, como Mi UDD (app.json lo fija en el APK; esto lo aplica también en Expo Go)
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    (async () => {
      const c = await connect();
      setConn(c);
      setWeek(await c.api.week());
    })();
  }, []);

  // Botón "atrás" de Android: desde el módulo vuelve al Inicio
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'module') { setScreen('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  // Cada acción devuelve la semana actualizada y refresca la UI
  const api = useMemo(() => {
    if (!conn) return null;
    return Object.fromEntries(Object.entries(conn.api).map(([k, fn]) => [k, async (...a) => {
      const w = await fn(...a); setWeek(w); return w;
    }]));
  }, [conn]);

  const go = (sc) => { setDrawer(false); setScreen(sc); };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.udd }} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {!week ? (
          <View style={s.load}><ActivityIndicator size="large" color={C.white} /><Text style={s.loadT}>Cargando Mi UDD…</Text></View>
        ) : screen === 'home' ? (
          <HomeScreen week={week} onOpen={() => go('module')} onMenu={() => setDrawer(true)} />
        ) : (
          <WeekModule week={week} api={api} mode={conn.mode} store={conn.store} onBack={() => go('home')} />
        )}

        <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={s.drawer}>
              <View style={s.dHead}>
                <Text style={{ color: C.white, fontSize: 18, fontWeight: '800' }}>Mi UDD</Text>
                <Text style={{ color: C.white, opacity: 0.9, fontSize: 13, marginTop: 4 }}>Prototipo · módulo Mi Semana</Text>
              </View>
              <Pressable style={s.it} onPress={() => go('home')}><Icon name="home-outline" size={22} color={C.ink} /><Text style={s.itT}>Inicio</Text></Pressable>
              <Pressable style={s.it} onPress={() => go('module')}><Icon name="calendar-heart" size={22} color={C.udd} /><Text style={s.itT}>Mi Semana</Text></Pressable>
              <Pressable style={s.it} onPress={() => {
                setDrawer(false);
                Alert.alert('Reiniciar demo', conn?.direct
                  ? 'Empieza un participante nuevo con la semana de ejemplo. Lo anterior queda guardado en Firestore.'
                  : 'Se borrarán tus cambios y volverá la semana de ejemplo.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Reiniciar', style: 'destructive', onPress: () => api.reset()
                    // El nuevo participante vuelve a ver la guía "Así funciona Mi Semana"
                    .then(() => AsyncStorage.removeItem('mi-semana:guia-vista').catch(() => {}))
                    .then(() => setScreen('home'))
                    .catch((e) => Alert.alert('No se pudo reiniciar', `Revisa tu conexión a internet e inténtalo de nuevo. (${e.message})`)) },
                ]);
              }}><Icon name="refresh" size={22} color={C.ink} /><Text style={s.itT}>Nuevo participante (reiniciar)</Text></Pressable>
              <Text style={s.foot}>
                Datos: {conn?.store === 'firestore' ? 'Firestore (nube)' : conn?.mode === 'nube' ? `API Node.js · ${conn.store}` : 'modo local en el teléfono (sin conexión)'}
              </Text>
            </View>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.4)' }} onPress={() => setDrawer(false)} />
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  load: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadT: { color: C.white, fontSize: 16, fontWeight: '700' },
  drawer: { width: '78%', backgroundColor: C.white },
  dHead: { backgroundColor: C.udd, padding: 22, paddingTop: 40 },
  it: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  itT: { fontSize: 15, color: C.ink },
  foot: { padding: 18, color: C.muted, fontSize: 12.5 },
});

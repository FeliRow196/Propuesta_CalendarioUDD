/**
 * Hoja inferior para crear, editar o mover una actividad.
 * modos: 'new' | 'edit' | 'move' (propuesta de la IA) | 'fixed' (horario UDD, solo lectura)
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, CAT, DAYS, DATES, TODAY, TYPE } from '../theme';
import { Btn, Chip, Stepper, Field, Icon } from './ui';
import { fmt, dur, gapsFrom } from '../engine';

export default function EditSheet({ ed, blocks, onClose, onSave, onDelete }) {
  const [e, setE] = useState(ed);
  useEffect(() => setE(ed), [ed]);
  const insets = useSafeAreaInsets(); // Android dibuja bajo la barra de navegación (edge-to-edge)
  if (!e) return null;
  const set = (patch) => setE((x) => ({ ...x, ...patch }));
  const length = e.end - e.start;
  const setStart = (start) => set({ start, end: start + length });

  // Huecos libres sugeridos del día elegido (para el modo "mover")
  const others = blocks.filter((b) => b.day === e.day && b.id !== e.blockId);
  const clash = others.find((b) => e.start < b.end && b.start < e.end);
  const slots = e.mode === 'move'
    ? gapsFrom(others, e.day >= 5 ? 540 : 420, 1290).filter((g) => g.end - g.start >= length).slice(0, 6) : [];

  const title = { new: 'Nueva actividad', edit: 'Editar actividad', move: 'Mover sugerencia', fixed: e.title }[e.mode];
  const valid = e.title.trim() && e.end <= 1440;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.bg} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.sheet, { paddingBottom: insets.bottom }]}>
        <View style={s.grab} />
        <View style={s.head}>
          <Text style={s.h}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Icon name="close" size={24} color={C.ink} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {e.mode === 'fixed' ? (
            <>
              <View style={[s.note, { backgroundColor: C.claseBg }]}>
                <Icon name="lock-outline" size={18} color="#0f4a80" />
                <Text style={{ flex: 1, color: '#0f4a80', fontSize: 13 }}>
                  {TYPE[e.type].label} del horario oficial UDD. No se puede mover ni borrar desde Mi Semana.
                </Text>
              </View>
              <Text style={s.info}>{DAYS[e.day]} {DATES[e.day]} · {fmt(e.start)}–{fmt(e.end)} ({dur(length)})</Text>
              {e.place ? <Text style={s.info}>📍 {e.place}</Text> : null}
              <Btn title="Entendido" onPress={onClose} style={{ marginTop: 14 }} />
            </>
          ) : (
            <>
              {e.mode === 'move' && (
                <View style={[s.note, { backgroundColor: '#EEF4FB' }]}>
                  <Icon name="creation" size={18} color="#0D3F73" />
                  <Text style={{ flex: 1, color: '#0D3F73', fontSize: 13 }}>Elige otro día u hora. Se agregará a tu semana al confirmar.</Text>
                </View>
              )}
              {e.mode !== 'move' && (
                <>
                  <Field label="Nombre">
                    <TextInput style={s.input} value={e.title} onChangeText={(v) => set({ title: v })} placeholder="Ej: Caminar al aire libre" />
                  </Field>
                  <Field label="Lugar (opcional)">
                    <TextInput style={s.input} value={e.place} onChangeText={(v) => set({ place: v })} placeholder="Ej: Biblioteca" />
                  </Field>
                  {/* Solo actividades de autocuidado: no se guardan actividades personales (privacidad) */}
                  {e.type === 'cuidado' && (
                    <Field label="Categoría">
                      <View style={s.chips}>
                        {Object.keys(CAT).map((c) => <Chip key={c} label={`${CAT[c].em} ${CAT[c].label}`} on={e.cat === c} onPress={() => set({ cat: c })} />)}
                      </View>
                    </Field>
                  )}
                </>
              )}
              <Field label="Día">
                <View style={s.chips}>
                  {/* Al agregar o mover no se ofrecen días que ya pasaron */}
                  {DAYS.map((n, i) => (e.mode === 'edit' || i >= TODAY) && <Chip key={n} label={`${n} ${DATES[i]}`} on={e.day === i} onPress={() => set({ day: i })} />)}
                </View>
              </Field>
              <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                <Field label="Inicio">
                  <Stepper value={e.start} min={360} max={1440 - length} step={10} format={fmt} onChange={setStart} />
                </Field>
                {e.mode !== 'move' && (
                  <Field label="Duración">
                    <Stepper value={length} min={10} max={600} step={e.type === 'cuidado' ? 5 : 10} format={dur}
                      onChange={(L) => set({ end: Math.min(1440, e.start + L) })} />
                  </Field>
                )}
              </View>
              <Text style={s.dur}>Termina a las {fmt(e.end)}</Text>
              {slots.length > 0 && (
                <Field label="Huecos libres ese día">
                  <View style={s.chips}>
                    {slots.map((g) => <Chip key={g.start} label={`${fmt(g.start)}–${fmt(g.start + length)}`} on={g.start === e.start} onPress={() => setStart(g.start)} />)}
                  </View>
                </Field>
              )}
              {clash && (
                <View style={[s.note, { backgroundColor: C.certBg }]}>
                  <Icon name="alert-outline" size={18} color="#8a2017" />
                  <Text style={{ flex: 1, color: '#8a2017', fontSize: 13 }}>Se cruza con «{clash.title}» ({fmt(clash.start)}–{fmt(clash.end)}). Puedes guardarlo igual, pero te avisaremos.</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                {e.mode === 'edit' && <Btn kind="danger" title="Eliminar" onPress={() => onDelete(e)} />}
                <Btn style={{ flex: 1 }} title={e.mode === 'new' ? 'Agregar a mi semana' : e.mode === 'move' ? 'Mover y agregar' : 'Guardar cambios'}
                  disabled={!valid} onPress={() => onSave(e)} />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '90%', backgroundColor: C.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8 },
  grab: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#d4d6da', alignSelf: 'center', marginVertical: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  h: { fontSize: 19, fontWeight: '800', color: C.ink, flex: 1 },
  note: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 10, marginBottom: 12, alignItems: 'flex-start' },
  info: { fontSize: 15, color: C.ink, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink },
  seg: { flexDirection: 'row', backgroundColor: C.soft, borderRadius: 12, padding: 4 },
  segB: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segOn: { backgroundColor: C.white, elevation: 2 },
  segT: { fontWeight: '800', fontSize: 14, color: C.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dur: { fontSize: 13, color: C.muted, marginTop: -6, marginBottom: 12 },
});

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from '../theme';

export const Icon = (props) => <MaterialCommunityIcons {...props} />;

export function Btn({ title, onPress, kind = 'primary', icon, small, style, disabled }) {
  const k = S[kind];
  const color = kind === 'primary' ? C.white : kind === 'sec' ? C.udd : kind === 'danger' ? C.cert : C.muted;
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [S.btn, small && S.sm, k, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }, style]}>
      {icon ? <Icon name={icon} size={small ? 16 : 19} color={color} /> : null}
      <Text style={[S.btnT, small && { fontSize: 13.5 }, { color }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }) {
  return (
    <Pressable onPress={onPress} style={[S.chip, on && S.chipOn]}>
      <Text style={[S.chipT, on && { color: C.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, format = (v) => String(v) }) {
  const set = (d) => onChange(Math.max(min, Math.min(max, value + d)));
  return (
    <View style={S.stepper}>
      <Pressable style={S.stepB} onPress={() => set(-step)} accessibilityLabel="Menos"><Text style={S.stepT}>−</Text></Pressable>
      <Text style={S.stepV}>{format(value)}</Text>
      <Pressable style={S.stepB} onPress={() => set(step)} accessibilityLabel="Más"><Text style={S.stepT}>+</Text></Pressable>
    </View>
  );
}

export function Pill({ level, children }) {
  const m = { ok: [C.cuidBg, C.cuid], mid: [C.warnBg, C.warn], high: [C.certBg, C.cert] }[level];
  return <View style={[S.pill, { backgroundColor: m[0] }]}><Text style={[S.pillT, { color: m[1] }]}>{children}</Text></View>;
}

export const Field = ({ label, right, children }) => (
  <View style={{ marginBottom: 14 }}>
    <View style={S.fieldH}><Text style={S.fieldL}>{label}</Text>{right ? <Text style={S.fieldL}>{right}</Text> : null}</View>
    {children}
  </View>
);

const S = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sm: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  primary: { backgroundColor: C.udd },
  sec: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.udd },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: C.certBg },
  btnT: { fontWeight: '800', fontSize: 15 },
  chip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: C.white, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  chipOn: { backgroundColor: C.udd, borderColor: C.udd },
  chipT: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepB: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  stepT: { fontSize: 20, fontWeight: '800', color: C.ink },
  stepV: { minWidth: 56, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.ink },
  pill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  pillT: { fontSize: 12, fontWeight: '700' },
  fieldH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  fieldL: { fontSize: 13, fontWeight: '700', color: '#4b5563' },
});

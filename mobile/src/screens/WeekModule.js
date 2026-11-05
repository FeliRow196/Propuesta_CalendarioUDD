/**
 * Módulo nuevo "Mi Semana": horario UDD (solo clases), con propuestas
 * de autocuidado (descanso, comidas, pausas y actividad física).
 * Pestañas: Mi semana · Preferencias · Mi propuesta
 */
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { C, CAT, DAYS, DAYS_L, DATES, TODAY, WEEK_LABEL, TYPE, LEVEL_COLOR } from '../theme';
import { Btn, Chip, Stepper, Pill, Field, Icon } from '../components/ui';
import EditSheet from '../components/EditSheet';
import { fmt, dur, parseT, dayBlocks, gapsFrom, loadOf, hasCert, loadLevel, overlapsOf } from '../engine';

const GUIA_KEY = 'mi-semana:guia-vista';
const LEVEL_TXT = { ok: 'Día liviano', mid: 'Día exigente', high: 'Día sobrecargado' };

export default function WeekModule({ week, api, mode, store, onBack }) {
  const [tab, setTab] = useState('week');
  const [sel, setSel] = useState(Math.max(TODAY, 0)); // abre en el día de hoy (el domingo, en el lunes que viene)
  // La guía "Así funciona Mi Semana" se muestra hasta que el usuario la cierra (se recuerda en el teléfono)
  const [onboard, setOnboard] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(GUIA_KEY).then((v) => setOnboard(v !== '1')).catch(() => setOnboard(true));
  }, []);
  const cerrarGuia = () => { setOnboard(false); AsyncStorage.setItem(GUIA_KEY, '1').catch(() => {}); };
  const [ed, setEd] = useState(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(week.prefs);
  // Cada acción devuelve una copia nueva de week: solo resincronizamos si las preferencias cambiaron de verdad,
  // para no borrar ajustes sin guardar al aceptar o editar algo en otra pestaña
  const savedPrefs = JSON.stringify(week.prefs);
  useEffect(() => setPrefs(week.prefs), [savedPrefs]);

  // busyText: mensaje bajo el indicador de carga (la propuesta con IA puede tardar varios segundos)
  const run = async (fn, okMsg, busyText = true) => {
    setBusy(busyText);
    try { await fn(); if (okMsg) Alert.alert('Listo', okMsg); }
    catch (err) { Alert.alert('No se pudo completar', err.message); }
    finally { setBusy(false); }
  };

  const blocks = week.blocks;
  // Sugerencias por revisar (las de días que ya pasaron no cuentan)
  const pending = week.proposals.filter((p) => p.status === 'pending' && p.day >= TODAY).length;

  /* ---------- acciones de la hoja de edición ---------- */
  const openBlock = (b) => setEd({
    ...b, blockId: b.id, mode: b.fixed ? 'fixed' : 'edit', place: b.place || '',
  });
  const openNew = (day, start, end) => setEd({
    mode: 'new', day, start, end: Math.min(end, start + 60), title: '', place: '', type: 'cuidado', cat: 'pausas', source: 'user',
  });
  const openMove = (p) => setEd({ ...p, mode: 'move', proposalId: p.id, type: 'cuidado' });

  const saveEd = (e) => run(async () => {
    const data = { day: e.day, start: e.start, end: e.end, title: e.title.trim(), place: e.place, type: e.type, cat: e.cat };
    if (e.mode === 'new') await api.addBlock(data);
    else if (e.mode === 'edit') await api.updateBlock(e.blockId, data);
    else if (e.mode === 'move') await api.accept(e.proposalId, { day: e.day, start: e.start, end: e.end });
    setEd(null);
  });
  const deleteEd = (e) => Alert.alert('Eliminar actividad', `¿Quitar «${e.title}» de tu semana?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: () => run(async () => { await api.deleteBlock(e.blockId); setEd(null); }) },
  ]);

  /* ---------- Propuesta por día ---------- */
  const elDia = (d) => `el ${DAYS_L[d].toLowerCase()}`;
  // Estado de la propuesta de un día; las semanas sin "days" (API Node.js) cuentan como generadas completas
  const dayInfo = (d) => (week.days ? week.days[d] : week.generated ? { by: week.generatedBy || 'reglas', resumen: week.aiResumen, aiError: week.aiError } : null) || null;
  const isDirty = (d) => (week.dirtyDays ? week.dirtyDays.includes(d) : !!week.dirty);
  // No tiene sentido proponer ni agendar en un día que ya pasó
  const isPast = (d) => d < TODAY;
  const genDay = (d) => run(async () => { await api.generate(d); setTab('prop'); }, null,
    store === 'firestore' ? `La IA está preparando la propuesta para ${elDia(d)}…` : 'Preparando tu propuesta…');

  /* ---------- Selector de días (compartido por Mi semana y Mi propuesta) ---------- */
  function DaySelector() {
    return (
      <View style={s.days}>
        {DAYS.map((n, i) => (
          <Pressable key={n} style={[s.day, i === sel && s.daySel]} onPress={() => setSel(i)} accessibilityLabel={`${DAYS_L[i]} ${DATES[i]}`}>
            {hasCert(blocks, i) && <View style={[s.cd, i === sel && { backgroundColor: C.white }]} />}
            <Text style={[s.dayD, i === sel && { color: C.white }]}>{i === TODAY ? 'Hoy' : n}</Text>
            <Text style={[s.dayN, i === sel && { color: C.white }]}>{DATES[i]}</Text>
            {/* Barra según el día: rojo = ya pasó, amarillo = hoy, verde = falta */}
            <View style={[s.bar, { backgroundColor: LEVEL_COLOR[i < TODAY ? 'high' : i === TODAY ? 'mid' : 'ok'] }]} />
          </Pressable>
        ))}
      </View>
    );
  }

  /* ---------- Pestaña: Mi semana ---------- */
  function WeekTab() {
    const items = dayBlocks(blocks, sel);
    const L = loadOf(blocks, sel);
    const lv = loadLevel(L);
    const ov = new Set(overlapsOf(blocks, sel).flat().map((b) => b.id));
    const alerts = dayInfo(sel) ? week.conflicts.filter((c) => c.day === sel) : [];
    const care = items.filter((b) => b.type === 'cuidado').length;
    // Cifras del resumen: módulos de clase y tiempo libre entre la primera y la última clase
    const clases = items.filter((b) => b.type === 'clase');
    const libre = clases.length
      ? gapsFrom(items, clases[0].start, Math.max(...clases.map((b) => b.end))).reduce((a, g) => a + g.end - g.start, 0)
      : 0;
    const porRevisar = week.proposals.filter((p) => p.day === sel && p.status === 'pending').length;

    const rows = [];
    let cursor = sel >= 5 ? 540 : 420;
    let prevEnd = null;
    items.forEach((b) => {
      if (b.start - cursor >= 30) rows.push({ gap: true, start: cursor, end: b.start });
      // Huecos cortos entre bloques (los recreos de 10 min entre módulos) se muestran como una franja delgada
      else if (prevEnd !== null && b.start > prevEnd) rows.push({ recreo: true, start: prevEnd, end: b.start });
      rows.push(b);
      cursor = Math.max(cursor, b.end);
      prevEnd = cursor;
    });
    if (1320 - cursor >= 30) rows.push({ gap: true, start: cursor, end: 1320 });

    return (
      <>
        <DaySelector />
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          {onboard && (
            <View style={s.onb}>
              <Pressable style={{ position: 'absolute', top: 8, right: 8 }} onPress={cerrarGuia} hitSlop={10}><Icon name="close" size={18} color={C.muted} /></Pressable>
              <Text style={s.onbH}>Así funciona Mi Semana</Text>
              <Text style={s.onbL}>1. Tus clases UDD ya están cargadas (en azul).</Text>
              <Text style={s.onbL}>2. Agrega tus propios momentos de autocuidado con el botón +.</Text>
              <Text style={s.onbL}>3. Pide tu propuesta y acepta solo lo que te sirva.</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                <Icon name="lock-outline" size={15} color={C.muted} />
                <Text style={{ flex: 1, fontSize: 12, color: C.muted }}>Mi Semana no guarda actividades personales: solo tus clases y tu autocuidado.</Text>
              </View>
            </View>
          )}
          {/* Resumen del día: cifras clave y la acción principal, sin tener que bajar */}
          <View style={s.sumCard}>
            <View style={s.sumHead}>
              <Text style={s.daysumH}>{DAYS_L[sel]} {DATES[sel]}</Text>
              {sel === TODAY && <View style={s.hoy}><Text style={s.hoyT}>Hoy</Text></View>}
              <View style={{ flex: 1 }} />
              <Pill level={lv}>{LEVEL_TXT[lv]}</Pill>
            </View>
            <View style={s.stats}>
              <View style={s.stat}><Text style={s.statN}>{clases.length}</Text><Text style={s.statL}>{clases.length === 1 ? 'clase' : 'clases'}</Text></View>
              <View style={s.stat}><Text style={s.statN}>{L ? dur(L) : '—'}</Text><Text style={s.statL}>en clases</Text></View>
              <View style={s.stat}><Text style={s.statN}>{clases.length ? dur(libre) : '—'}</Text><Text style={s.statL}>libre entre clases</Text></View>
              <View style={s.stat}><Text style={[s.statN, { color: C.cuid }]}>{care}</Text><Text style={s.statL}>autocuidado</Text></View>
            </View>
            {isPast(sel) ? (
              <Text style={s.past}>Este día ya pasó. Las propuestas son para hoy y los próximos días.</Text>
            ) : dayInfo(sel) && isDirty(sel) ? (
              <View style={s.dirtyIn}>
                <Text style={{ flex: 1, color: '#6b4500', fontSize: 13 }}>Cambiaste {elDia(sel)}. ¿Actualizo su propuesta?</Text>
                <Btn small title="Actualizar" onPress={() => genDay(sel)} />
              </View>
            ) : dayInfo(sel) ? (
              <Btn icon="creation" title={porRevisar ? `Ver propuesta (${porRevisar} por revisar)` : 'Ver propuesta del día'} onPress={() => setTab('prop')} />
            ) : (
              <Btn icon="creation" title={`Proponer autocuidado para ${sel === TODAY ? 'hoy' : elDia(sel)}`} onPress={() => genDay(sel)} />
            )}
          </View>
          {alerts.map((a, i) => (
            <View key={i} style={[s.alert, a.level === 'alta' && { backgroundColor: C.certBg }]}>
              <Icon name="alert-outline" size={16} color={a.level === 'alta' ? '#8a2017' : '#6b4500'} />
              <Text style={{ flex: 1, fontSize: 13, color: a.level === 'alta' ? '#8a2017' : '#6b4500' }}>{a.text}</Text>
            </View>
          ))}
          <View style={s.legend}>
            {Object.entries(TYPE).filter(([k]) => k !== 'certamen').map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: v.color }} />
                <Text style={{ fontSize: 11.5, color: C.muted }}>{v.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ paddingHorizontal: 12, paddingTop: 6 }}>
            {rows.length === 0 && <Text style={s.empty}>Día libre. Toca + para agregar algo.</Text>}
            {rows.map((r) => r.gap ? (
              <View key={`g${r.start}`} style={s.row}>
                <View style={{ width: 48 }} />
                <Pressable style={s.gap} disabled={isPast(sel)} onPress={() => openNew(sel, r.start, r.end)}>
                  {!isPast(sel) && <Icon name="plus" size={15} color={C.muted} />}
                  <Text style={s.gapT}>{dur(r.end - r.start)} libres · {fmt(r.start)}–{fmt(r.end)}</Text>
                </Pressable>
              </View>
            ) : r.recreo ? (
              <View key={`r${r.start}`} style={s.row}>
                <View style={{ width: 48 }} />
                <View style={s.recreo}>
                  <View style={s.recreoL} />
                  <Text style={s.recreoT}>Recreo · {fmt(r.start)}–{fmt(r.end)}</Text>
                  <View style={s.recreoL} />
                </View>
              </View>
            ) : (
              <View key={r.id} style={s.row}>
                <View style={{ width: 48, paddingTop: 12 }}>
                  <Text style={s.tlB}>{fmt(r.start)}</Text>
                  <Text style={s.tlS}>{fmt(r.end)}</Text>
                </View>
                <Pressable onPress={() => openBlock(r)}
                  style={[s.blk, { backgroundColor: TYPE[r.type].bg, borderLeftColor: TYPE[r.type].color }, ov.has(r.id) && s.overlap]}>
                  <Text style={[s.blkT, { color: TYPE[r.type].text }]}>
                    {r.type === 'cuidado' && r.cat ? `${CAT[r.cat].em} ` : ''}{r.title}
                  </Text>
                  <Text style={s.blkS}>{TYPE[r.type].label}{r.place ? ` · ${r.place}` : ''}{r.source === 'ia' ? ' · Sugerida' : ''}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
        {!isPast(sel) && (
          <Pressable style={s.fab} onPress={() => openNew(sel, 600, 660)} accessibilityLabel="Agregar actividad">
            <Icon name="plus" size={30} color={C.white} />
          </Pressable>
        )}
      </>
    );
  }

  /* ---------- Pestaña: Preferencias ---------- */
  function PrefsTab() {
    const P = prefs;
    const up = (patch) => setPrefs({ ...P, ...patch });
    const move = (i, d) => {
      const pr = [...P.priorities]; [pr[i], pr[i + d]] = [pr[i + d], pr[i]]; up({ priorities: pr });
    };
    return (
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <Text style={s.lead}>Cuéntanos cómo quieres cuidarte. Usaremos esto para proponer, nunca para imponer.</Text>
        <View style={s.card}>
          <Text style={s.cardH}>🌙 Descanso</Text>
          <Field label="Me levanto a las"><Stepper value={parseT(P.wake)} min={300} max={600} step={15} format={fmt} onChange={(v) => up({ wake: fmt(v) })} /></Field>
          <Field label="Horas de sueño"><Stepper value={P.sleepHours} min={5} max={10} step={0.5} format={(v) => `${v} h`} onChange={(v) => up({ sleepHours: v })} /></Field>
        </View>
        <View style={s.card}>
          <Text style={s.cardH}>🍽️ Alimentación</Text>
          <Field label="Hora ideal de almuerzo"><Stepper value={parseT(P.lunchTime)} min={690} max={870} step={15} format={fmt} onChange={(v) => up({ lunchTime: fmt(v) })} /></Field>
          <Field label="Tiempo para almorzar">
            <View style={s.chips}>{[30, 45, 60].map((m) => <Chip key={m} label={`${m} min`} on={P.lunchMin === m} onPress={() => up({ lunchMin: m })} />)}</View>
          </Field>
        </View>
        <View style={s.card}>
          <Text style={s.cardH}>🧘 Pausas</Text>
          <Field label="Duración de cada pausa">
            <View style={s.chips}>{[10, 15, 20].map((m) => <Chip key={m} label={`${m} min`} on={P.pauseMin === m} onPress={() => up({ pauseMin: m })} />)}</View>
          </Field>
          <Field label="Pausas por día de clases"><Stepper value={P.pausesPerDay} min={0} max={4} onChange={(v) => up({ pausesPerDay: v })} /></Field>
        </View>
        <View style={s.card}>
          <Text style={s.cardH}>🏃 Actividad física</Text>
          <Field label="¿Qué te gusta hacer?">
            <View style={s.chips}>{['Caminar', 'Trotar', 'Gimnasio', 'Bicicleta', 'Yoga'].map((x) => <Chip key={x} label={x} on={P.exerciseType === x} onPress={() => up({ exerciseType: x })} />)}</View>
          </Field>
          <Field label="Duración">
            <View style={s.chips}>{[20, 30, 45, 60].map((m) => <Chip key={m} label={`${m} min`} on={P.exerciseMin === m} onPress={() => up({ exerciseMin: m })} />)}</View>
          </Field>
          <Field label="Días por semana"><Stepper value={P.exerciseDays} min={0} max={7} onChange={(v) => up({ exerciseDays: v })} /></Field>
        </View>
        <View style={s.card}>
          <Text style={s.cardH}>Mis prioridades</Text>
          <Text style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Si el tiempo no alcanza, se agenda primero lo de arriba.</Text>
          {P.priorities.map((k, i) => (
            <View key={k} style={s.prio}>
              <View style={s.prioN}><Text style={{ color: C.white, fontWeight: '800' }}>{i + 1}</Text></View>
              <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{CAT[k].em} {CAT[k].label}</Text>
              <Pressable disabled={i === 0} onPress={() => move(i, -1)} style={[s.prioB, i === 0 && { opacity: 0.3 }]}><Icon name="chevron-up" size={20} color={C.ink} /></Pressable>
              <Pressable disabled={i === P.priorities.length - 1} onPress={() => move(i, 1)} style={[s.prioB, i === P.priorities.length - 1 && { opacity: 0.3 }]}><Icon name="chevron-down" size={20} color={C.ink} /></Pressable>
            </View>
          ))}
        </View>
        <Btn icon="creation" title={`Guardar y ver la propuesta para ${elDia(sel)}`}
          onPress={() => run(async () => { await api.savePrefs(prefs); await api.generate(sel); setTab('prop'); }, null,
            store === 'firestore' ? `La IA está preparando la propuesta para ${elDia(sel)}…` : 'Preparando tu propuesta…')} />
      </ScrollView>
    );
  }

  /* ---------- Pestaña: Mi propuesta (por día) ---------- */
  function PropTab() {
    const info = dayInfo(sel);
    if (isPast(sel)) {
      return (
        <>
          <DaySelector />
          <ScrollView>
            <View style={[s.heroIa, { backgroundColor: C.soft, borderColor: C.line }]}>
              <Icon name="calendar-check-outline" size={30} color={C.muted} />
              <Text style={s.heroH}>{DAYS_L[sel]} {DATES[sel]} ya pasó</Text>
              <Text style={s.heroP}>Las propuestas son para hoy y los próximos días. Elige otro día para planificar tu autocuidado.</Text>
              <Btn title="Ir a hoy" onPress={() => setSel(TODAY)} />
            </View>
          </ScrollView>
        </>
      );
    }
    if (!info) {
      return (
        <>
          <DaySelector />
          <ScrollView>
            <View style={s.heroIa}>
              <Icon name="creation" size={30} color={C.udd} />
              <Text style={s.heroH}>{DAYS_L[sel]} {DATES[sel]}, con espacio para ti</Text>
              <Text style={s.heroP}>Analizamos tus clases de {elDia(sel)} para encontrar huecos reales para descansar, comer, hacer pausas y moverte. Tú decides qué aceptar.</Text>
              <Btn title={`Generar propuesta para ${elDia(sel)}`} onPress={() => genDay(sel)} />
              <Btn kind="sec" small title="Ajustar preferencias" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => setTab('prefs')} />
            </View>
          </ScrollView>
        </>
      );
    }
    const list = week.proposals.filter((p) => p.day === sel);
    const alerts = week.conflicts.filter((c) => c.day === sel);
    const accepted = list.filter((p) => p.status === 'accepted').length;
    const pendingDay = list.filter((p) => p.status === 'pending').length;
    return (
      <>
        <DaySelector />
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={s.sum}>
            <View style={s.sumK}><Text style={s.sumN}>{list.length}</Text><Text style={s.sumL}>sugerencias</Text></View>
            <View style={s.sumK}><Text style={[s.sumN, { color: C.cuid }]}>{accepted}</Text><Text style={s.sumL}>aceptadas</Text></View>
            <View style={s.sumK}><Text style={[s.sumN, { color: C.cert }]}>{alerts.length}</Text><Text style={s.sumL}>alertas</Text></View>
          </View>
          {info.by === 'ia' ? (
            <View style={s.ai}>
              <Text style={s.aiH}>✨ Propuesta escrita con IA (Gemini)</Text>
              {info.resumen ? <Text style={s.aiT}>{info.resumen}</Text> : null}
            </View>
          ) : info.aiError ? (
            <View style={[s.ai, { backgroundColor: C.soft, borderColor: C.line }]}>
              <Text style={[s.aiT, { color: C.muted }]}>La IA no estuvo disponible ({info.aiError}). Esta propuesta se armó con reglas; toca "Regenerar" para intentarlo de nuevo.</Text>
            </View>
          ) : null}
          {isDirty(sel) && (
            <View style={s.dirty}>
              <Text style={{ flex: 1, color: '#6b4500', fontSize: 13 }}>{DAYS_L[sel]} o tus preferencias cambiaron.</Text>
              <Btn small title="Actualizar" onPress={() => genDay(sel)} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10 }}>
            <Btn style={{ flex: 1 }} icon="check" title={`Aceptar todas (${pendingDay})`} disabled={!pendingDay} onPress={() => run(() => api.acceptAll(sel))} />
            <Btn style={{ flex: 1 }} kind="sec" icon="refresh" title="Regenerar" onPress={() => genDay(sel)} />
          </View>
          {alerts.length > 0 && (
            <View style={s.grp}>
              <Text style={s.grpH}>Alertas de {elDia(sel)}</Text>
              {alerts.map((c, i) => (
                <Pressable key={i} onPress={() => setTab('week')} style={[s.alert, { marginHorizontal: 0 }, c.level === 'alta' && { backgroundColor: C.certBg }]}>
                  <Icon name="alert-outline" size={16} color={c.level === 'alta' ? '#8a2017' : '#6b4500'} />
                  <Text style={{ flex: 1, fontSize: 13, color: c.level === 'alta' ? '#8a2017' : '#6b4500' }}>{c.text}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={s.grp}>
            <Text style={s.grpH}>{DAYS_L[sel]} {DATES[sel]}</Text>
            {list.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>No hay sugerencias para este día: ya tienes tu autocuidado cubierto o no quedan huecos libres.</Text>}
            {list.map((p) => (
              <View key={p.id} style={[s.sg, p.status === 'accepted' && { backgroundColor: '#f7fcf9' }, p.status === 'rejected' && { opacity: 0.6, borderLeftColor: '#cfd3d8' }]}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ fontSize: 22 }}>{CAT[p.cat].em}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{p.title}</Text>
                    <Text style={{ fontSize: 12.5, color: C.muted }}>{fmt(p.start)}–{fmt(p.end)} · {p.place}</Text>
                  </View>
                </View>
                {p.status === 'pending' ? (
                  <>
                    <Text style={s.why}>{p.reason}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Btn small style={{ flex: 1 }} title="Aceptar" onPress={() => run(() => api.accept(p.id))} />
                      <Btn small style={{ flex: 1 }} kind="sec" title="Mover" onPress={() => openMove(p)} />
                      <Btn small style={{ flex: 1 }} kind="ghost" title="Rechazar" onPress={() => run(() => api.reject(p.id))} />
                    </View>
                  </>
                ) : (
                  <View style={s.st}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: p.status === 'accepted' ? C.cuid : C.muted }}>
                      {p.status === 'accepted' ? (p.moved ? '✓ Movida y agregada' : '✓ Agregada a tu semana') : 'Rechazada'}
                    </Text>
                    <Btn small kind="ghost" title="Deshacer" onPress={() => run(() => api.undo(p.id))} />
                  </View>
                )}
              </View>
            ))}
          </View>
          <Text style={s.sim}>
            {info.by === 'ia'
              ? 'Sugerencias escritas por IA a partir de tus clases y preferencias, revisadas para que calcen en tus huecos libres. Las alertas se calculan con reglas.'
              : 'Propuestas generadas por reglas a partir de tu horario y preferencias.'}
          </Text>
        </ScrollView>
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.soft }}>
      <View style={s.bar0}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Volver"><Icon name="chevron-left" size={32} color={C.white} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.white, fontSize: 20, fontWeight: '800' }}>Mi Semana</Text>
          <Text style={{ color: C.white, opacity: 0.9, fontSize: 12.5 }}>{WEEK_LABEL} · Nivel 2</Text>
        </View>
        <View style={s.mode}><Text style={s.modeT}>{mode !== 'nube' ? '📱 Local' : store === 'firestore' ? '☁ Firestore' : '☁ Servidor'}</Text></View>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'week' ? WeekTab() : tab === 'prefs' ? PrefsTab() : PropTab()}
        {busy && (
          <View style={s.busy}>
            <ActivityIndicator size="large" color={C.udd} />
            {typeof busy === 'string' && <Text style={s.busyT}>{busy}</Text>}
          </View>
        )}
      </View>
      <View style={s.nav}>
        {[['week', 'calendar-month-outline', 'Mi semana'], ['prefs', 'tune-variant', 'Preferencias'], ['prop', 'creation', 'Mi propuesta']].map(([k, i, l]) => (
          <Pressable key={k} style={s.navB} onPress={() => setTab(k)}>
            <Icon name={i} size={24} color={tab === k ? C.udd : C.muted} />
            <Text style={[s.navT, tab === k && { color: C.udd }]}>{l}</Text>
            {k === 'prop' && pending > 0 && <View style={s.cnt}><Text style={s.cntT}>{pending}</Text></View>}
          </Pressable>
        ))}
      </View>
      <EditSheet ed={ed} blocks={blocks} onClose={() => setEd(null)} onSave={saveEd} onDelete={deleteEd} />
    </View>
  );
}

const s = StyleSheet.create({
  bar0: { backgroundColor: C.udd, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, minHeight: 64 },
  mode: { backgroundColor: 'rgba(255,255,255,.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 },
  modeT: { color: C.white, fontSize: 11, fontWeight: '700' },
  days: { flexDirection: 'row', gap: 6, padding: 10, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  day: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingTop: 6, paddingBottom: 7, alignItems: 'center', backgroundColor: C.white },
  daySel: { backgroundColor: C.udd, borderColor: C.udd },
  dayD: { fontSize: 11.5, fontWeight: '700', color: C.muted },
  dayN: { fontSize: 17, fontWeight: '800', color: C.ink },
  bar: { height: 4, borderRadius: 2, alignSelf: 'stretch', marginHorizontal: 8, marginTop: 4 },
  cd: { position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: C.cert },
  onb: { backgroundColor: C.white, borderRadius: 16, padding: 14, margin: 14, marginBottom: 0, borderWidth: 1, borderColor: '#C9DAEE' },
  onbH: { fontSize: 15.5, fontWeight: '800', marginBottom: 6, color: C.ink },
  onbL: { fontSize: 13.5, lineHeight: 21, color: C.ink },
  dirty: { margin: 14, marginBottom: 0, backgroundColor: C.warnBg, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Tarjeta de resumen del día
  sumCard: { backgroundColor: C.white, borderRadius: 18, padding: 14, marginHorizontal: 14, marginTop: 14, gap: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoy: { backgroundColor: '#FFF4DB', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  hoyT: { color: '#9A6200', fontSize: 12, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: C.soft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  statN: { fontSize: 15.5, fontWeight: '800', color: C.ink, textAlign: 'center' },
  statL: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 2 },
  dirtyIn: { backgroundColor: C.warnBg, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  daysumH: { fontSize: 20, fontWeight: '800', color: C.ink },
  alert: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 6, borderRadius: 12, padding: 10, backgroundColor: C.warnBg, alignItems: 'flex-start' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  row: { flexDirection: 'row', gap: 8 },
  tlB: { fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'right' },
  tlS: { fontSize: 12, color: C.muted, textAlign: 'right' },
  blk: { flex: 1, borderLeftWidth: 4, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginVertical: 4 },
  blkT: { fontWeight: '800', fontSize: 14.5 },
  blkS: { fontSize: 12.5, color: C.muted, marginTop: 2 },
  overlap: { borderWidth: 2, borderColor: '#E5483A' },
  gap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#cfd3d8', borderRadius: 10 },
  gapT: { color: C.muted, fontSize: 12.5, fontWeight: '700' },
  empty: { textAlign: 'center', color: C.muted, padding: 30 },
  fab: { position: 'absolute', right: 16, bottom: 16, width: 58, height: 58, borderRadius: 29, backgroundColor: C.udd, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  lead: { color: C.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, marginBottom: 12, elevation: 1 },
  cardH: { fontSize: 16, fontWeight: '800', marginBottom: 10, color: C.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prio: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: C.line, borderRadius: 12, marginTop: 8 },
  prioN: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.udd, alignItems: 'center', justifyContent: 'center' },
  prioB: { width: 34, height: 34, borderWidth: 1, borderColor: C.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  heroIa: { margin: 14, padding: 18, borderRadius: 18, backgroundColor: '#EEF4FB', borderWidth: 1, borderColor: '#C9DAEE' },
  heroH: { fontSize: 20, fontWeight: '800', marginVertical: 8, color: C.ink },
  heroP: { color: '#5b5f66', fontSize: 14, lineHeight: 20, marginBottom: 14 },
  sum: { flexDirection: 'row', gap: 10, margin: 14, marginBottom: 4 },
  sumK: { flex: 1, backgroundColor: C.white, borderRadius: 14, padding: 12, elevation: 1 },
  sumN: { fontSize: 24, fontWeight: '800', color: C.ink },
  sumL: { color: C.muted, fontSize: 12 },
  grp: { paddingHorizontal: 14, paddingTop: 18 },
  grpH: { fontSize: 13, color: C.muted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sg: { backgroundColor: C.white, borderRadius: 16, padding: 13, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: C.cuid, elevation: 1 },
  why: { fontSize: 13, color: '#4b5563', marginVertical: 10, lineHeight: 18, backgroundColor: C.soft, borderRadius: 10, padding: 9 },
  st: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sim: { fontSize: 11.5, color: C.muted, textAlign: 'center', marginTop: 16, paddingHorizontal: 20 },
  recreo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 1 },
  recreoL: { flex: 1, height: 1, backgroundColor: C.line },
  recreoT: { fontSize: 11.5, color: C.muted, fontWeight: '700' },
  past: { fontSize: 13, color: C.muted, textAlign: 'center', backgroundColor: C.soft, borderRadius: 12, padding: 12 },
  ai: { marginHorizontal: 14, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: '#EEF4FB', borderWidth: 1, borderColor: '#C9DAEE' },
  aiH: { fontSize: 13.5, fontWeight: '800', color: C.udd },
  aiT: { fontSize: 13, color: C.ink, marginTop: 4, lineHeight: 18 },
  busyT: { marginTop: 12, fontSize: 14, fontWeight: '700', color: C.udd, textAlign: 'center', paddingHorizontal: 30 },
  busy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,.55)', alignItems: 'center', justifyContent: 'center' },
  nav: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line },
  navB: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 10, gap: 2 },
  navT: { fontSize: 11.5, fontWeight: '700', color: C.muted },
  cnt: { position: 'absolute', top: 4, left: '58%', backgroundColor: C.udd, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cntT: { color: C.white, fontSize: 10, fontWeight: '800' },
});

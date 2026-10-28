/**
 * Barra de leitura: um só componente para Conferência, Venda e Consulta.
 * - Câmera: o botão abre a câmera contínua.
 * - Leitor USB/Bluetooth (age como teclado): no navegador do computador escuta o teclado inteiro (só leitura rápida
 *   terminada em Enter vira código); no celular, toque no campo e bipe.
 * - Digitar o código e dar Enter também vale.
 * Mostra o resultado da última leitura (verde, âmbar ou vermelho) e tem o botão de silenciar.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { createScanGate, createWedgeBuffer, normalizeScan } from '@/utils/scanLogic';
import { isScanMuted, onScanMutedChange, setScanMuted } from '@/utils/scanFeedback';
import CameraScanSheet, { type CameraStatus } from './CameraScanSheet';

export type ScanStatus = CameraStatus;

interface Props {
  /** Chamado a cada leitura aceita. */
  onCode: (code: string) => void;
  /** Resultado da última leitura (quem usa decide o texto e a cor). */
  status?: ScanStatus | null;
  placeholder?: string;
  /** Desliga a escuta do teclado (ex.: enquanto outra janela está aberta). */
  paused?: boolean;
  /** Ações extras ao lado do campo. */
  right?: React.ReactNode;
}

const COLORS = { ok: '#16A34A', warn: '#B45309', error: '#DC2626' } as const;
const BG = { ok: '#DCFCE7', warn: '#FEF3C7', error: '#FEE2E2' } as const;

export default function ScanBar({ onCode, status, placeholder, paused, right }: Props) {
  const brand = useBrandingColors();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [muted, setMuted] = useState(isScanMuted());
  const [typed, setTyped] = useState('');
  const gate = useRef(createScanGate(1500)).current;
  const wedge = useRef(createWedgeBuffer()).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => onScanMutedChange(setMuted), []);

  const emit = useCallback(
    (raw: string) => {
      const code = normalizeScan(raw);
      if (code && gate.accept(code, Date.now())) onCode(code);
    },
    [gate, onCode],
  );

  // Leitor tipo teclado no navegador: escuta a página toda, menos quando a pessoa digita em outro campo
  useEffect(() => {
    if (Platform.OS !== 'web' || paused || cameraOpen) return;
    const w = globalThis as any;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const isField = tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable;
      if (isField && el !== (inputRef.current as any)) return; // outro campo: não interferir
      const code = wedge.feed(e.key, Date.now());
      if (code && el !== (inputRef.current as any)) emit(code);
    };
    w.addEventListener?.('keydown', handler, true);
    return () => w.removeEventListener?.('keydown', handler, true);
  }, [paused, cameraOpen, wedge, emit]);

  const submitTyped = () => {
    emit(typed);
    setTyped('');
    inputRef.current?.focus?.();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.camBtn, { backgroundColor: brand.primary }]}
          onPress={() => setCameraOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Abrir câmera para bipar"
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code-outline" size={20} color="#fff" />
          <Text style={styles.camText}>Bipar</Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={submitTyped}
          placeholder={placeholder || 'Bipe com o leitor ou digite o código e Enter'}
          placeholderTextColor={Colors.light.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
        />
        {right}
        <TouchableOpacity
          onPress={() => setScanMuted(!muted)}
          style={styles.muteBtn}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Ligar som da leitura' : 'Silenciar som da leitura'}
        >
          <Ionicons name={muted ? 'volume-mute-outline' : 'volume-high-outline'} size={20} color={Colors.light.textSecondary} />
        </TouchableOpacity>
      </View>
      {!!status && (
        <View style={[styles.status, { backgroundColor: BG[status.kind] }]} accessibilityLiveRegion="polite">
          <Ionicons
            name={status.kind === 'ok' ? 'checkmark-circle' : status.kind === 'warn' ? 'alert-circle' : 'close-circle'}
            size={18}
            color={COLORS[status.kind]}
          />
          <Text style={[styles.statusText, { color: COLORS[status.kind] }]} numberOfLines={2}>{status.text}</Text>
        </View>
      )}
      <CameraScanSheet visible={cameraOpen} onClose={() => setCameraOpen(false)} onCode={emit} status={status} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  camBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 42, borderRadius: 12 },
  camText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 42,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
  },
  muteBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  statusText: { flex: 1, fontSize: 13, fontWeight: '700' },
});

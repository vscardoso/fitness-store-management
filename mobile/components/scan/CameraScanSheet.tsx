/**
 * Câmera contínua: lê um QR depois do outro sem fechar. O mesmo código seguido é ignorado por 1,5 s.
 * Quem abre decide o que fazer com cada leitura (`onCode`) e mostra o resultado em `status`.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { createPresenceGate } from '@/utils/scanLogic';

export interface CameraStatus {
  kind: 'ok' | 'warn' | 'error';
  text: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
  status?: CameraStatus | null;
  hint?: string;
  /** Fecha a câmera assim que uma leitura é aceita (venda e consulta: uma peça por vez). */
  closeOnScan?: boolean;
}

const COLORS = { ok: '#16A34A', warn: '#D97706', error: '#DC2626' } as const;

export default function CameraScanSheet({ visible, onClose, onCode, status, hint, closeOnScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const gate = useRef(createPresenceGate(800)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) gate.reset();
  }, [visible, gate]);

  const handle = (result: BarcodeScanningResult) => {
    if (gate.accept(result.data, Date.now())) {
      onCode(result.data);
      if (closeOnScan) onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.container}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.perm}>
            <Ionicons name="camera-outline" size={56} color="#fff" />
            <Text style={styles.permTitle}>Precisamos da câmera para ler as etiquetas</Text>
            <TouchableOpacity
              style={styles.permBtn}
              onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
            >
              <Text style={styles.permBtnText}>{permission.canAskAgain ? 'Permitir câmera' : 'Abrir configurações'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={handle}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
          />
        )}

        <View style={[styles.top, { paddingTop: Math.max(insets.top, 24) + 14 }]} pointerEvents="box-none">
          <Text style={styles.hintTitle}>Bipar etiqueta</Text>
          <Text style={styles.hint}>{hint || (closeOnScan ? 'Aponte para o QR da etiqueta. A câmera fecha sozinha ao ler.' : 'Aponte para o QR da etiqueta. A câmera continua aberta para a próxima peça.')}</Text>
        </View>
        <View style={styles.frame} pointerEvents="none" />
        {!!status && (
          <View style={[styles.banner, { backgroundColor: COLORS[status.kind] }]}>
            <Text style={styles.bannerText} numberOfLines={3}>{status.text}</Text>
          </View>
        )}
        {closeOnScan ? (
          <TouchableOpacity
            style={[styles.closeX, { top: Math.max(insets.top, 24) + 10 }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancelar leitura"
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.done, { bottom: Math.max(insets.bottom, 16) + 20 }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar câmera">
            <Ionicons name="checkmark" size={22} color="#fff" />
            <Text style={styles.doneText}>Pronto</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.72)', paddingBottom: 16, gap: 4 },
  hintTitle: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.92)', fontSize: 14, lineHeight: 19, textAlign: 'center' },
  frame: {
    position: 'absolute', top: '28%', alignSelf: 'center', width: 240, height: 240,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 24,
  },
  banner: { position: 'absolute', left: 16, right: 16, bottom: 130, borderRadius: 16, padding: 14 },
  bannerText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  done: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.light.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999,
  },
  closeX: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  perm: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  permTitle: { color: '#fff', fontSize: 16, textAlign: 'center' },
  permBtn: { backgroundColor: '#fff', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { fontWeight: '800', color: '#111' },
});

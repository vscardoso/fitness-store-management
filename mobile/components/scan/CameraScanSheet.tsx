/**
 * Câmera contínua: lê um QR depois do outro sem fechar. O mesmo código seguido é ignorado por 1,5 s.
 * Quem abre decide o que fazer com cada leitura (`onCode`) e mostra o resultado em `status`.
 *
 * Cabeçalho do app (cor da marca, título e voltar) e a câmera só no resto da tela.
 * No app web a câmera abre direto: o próprio navegador pede a permissão só quando precisa. A tela nossa de
 * "Permitir câmera" aparecia toda vez no iPhone instalado, porque lá a consulta de permissão nunca confirma
 * que a câmera já foi liberada. Ela fica só para o app nativo e para quando a câmera falha ao abrir.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { createPresenceGate } from '@/utils/scanLogic';
import { useScreenWakeLock } from '@/hooks/usePwaExtras';
import WebQrCamera from './WebQrCamera';

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
const WEB = Platform.OS === 'web';

export default function CameraScanSheet({ visible, onClose, onCode, status, hint, closeOnScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [webFailed, setWebFailed] = useState(false);
  // depois de cada leitura, 2 s sem ler nada; a mesma etiqueta só conta de novo depois de 2,5 s e fora da vista
  const gate = useRef(createPresenceGate(1200, 2500, 2000)).current;
  const insets = useSafeAreaInsets();
  useScreenWakeLock(visible);   // tela acesa enquanto a câmera de bipar está aberta

  useEffect(() => {
    if (visible) {
      gate.reset();
      setWebFailed(false);
    }
  }, [visible, gate]);

  const onWebError = React.useCallback(() => setWebFailed(true), []);

  const handle = (result: BarcodeScanningResult) => {
    if (gate.accept(result.data, Date.now())) {
      onCode(result.data);
      if (closeOnScan) onClose();
    }
  };

  const showCamera = WEB ? !webFailed : !!permission?.granted;
  const askAgain = () => {
    if (WEB) {
      setWebFailed(false);   // monta a câmera de novo: o navegador pede a permissão
      return;
    }
    if (permission?.canAskAgain) requestPermission();
    else Linking.openSettings();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.container}>
        <View style={styles.header}>
        <PageHeader
          title="Bipar etiqueta"
          subtitle={hint || (closeOnScan ? 'Aponte para o QR. A câmera fecha sozinha ao ler.' : 'Aponte para o QR. A câmera segue aberta para a próxima peça.')}
          showBackButton
          onBack={onClose}
          showHelp={false}
        />
        </View>
        <View style={styles.cameraArea}>
          {showCamera && WEB ? (
            <WebQrCamera onCode={(text) => handle({ data: text } as BarcodeScanningResult)} onError={onWebError} />
          ) : showCamera ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              onBarcodeScanned={handle}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
              onMountError={() => setWebFailed(true)}
            />
          ) : (!WEB && !permission) ? null : (
            <View style={styles.perm}>
              <Ionicons name="camera-outline" size={48} color={Colors.light.white} />
              <Text style={styles.permTitle}>
                {WEB ? 'A câmera não abriu. Confira se o navegador tem permissão de usar a câmera.' : 'Precisamos da câmera para ler as etiquetas'}
              </Text>
              <TouchableOpacity style={styles.permBtn} onPress={askAgain}>
                <Text style={styles.permBtnText}>{WEB || permission?.canAskAgain ? 'Permitir câmera' : 'Abrir configurações'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {showCamera && <View style={styles.frame} pointerEvents="none" />}
          {!!status && (
            <View style={[styles.banner, { bottom: Math.max(insets.bottom, 16) + (closeOnScan ? 20 : 90) }]}>
              <View style={[styles.bannerInner, { backgroundColor: COLORS[status.kind] }]}>
                <Text style={styles.bannerText} numberOfLines={3}>{status.text}</Text>
              </View>
            </View>
          )}
          {!closeOnScan && (
            <TouchableOpacity style={[styles.done, { bottom: Math.max(insets.bottom, 16) + 20 }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar câmera">
              <Ionicons name="checkmark" size={22} color={Colors.light.white} />
              <Text style={styles.doneText}>Pronto</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  // o cabeçalho tem a borda de baixo arredondada: a câmera começa um pouco por baixo dele
  header: { zIndex: 2 },
  cameraArea: { flex: 1, backgroundColor: Colors.light.black, overflow: 'hidden', marginTop: -24 },
  frame: {
    // no meio da câmera: é o quadrado que o leitor do app web analisa (WebQrCamera lê o centro)
    position: 'absolute', top: '50%', alignSelf: 'center', width: 240, height: 240, marginTop: -120,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 24,
  },
  banner: { position: 'absolute', left: 16, right: 16 },
  bannerInner: { borderRadius: 16, padding: 14 },
  bannerText: { color: Colors.light.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  done: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.light.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999,
  },
  doneText: { color: Colors.light.white, fontSize: 16, fontWeight: '800' },
  perm: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  permTitle: { color: Colors.light.white, fontSize: 16, textAlign: 'center' },
  permBtn: { backgroundColor: Colors.light.white, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { fontWeight: '800', color: '#111' },
});

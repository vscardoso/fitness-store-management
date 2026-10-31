/**
 * Visualizador de arquivo dentro do app (como o do WhatsApp): foto em tela cheia, PDF e vídeo numa janela
 * que fecha no X, tocando fora ou na tecla Esc. Nada abre em outra aba do navegador.
 */
import { createElement, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  kind: 'image' | 'document' | 'video';
  /** Foto já carregada (miniatura) para mostrar enquanto a inteira baixa */
  previewUri?: string | null;
  /** Arquivo inteiro; nulo enquanto baixa */
  uri: string | null;
  mime?: string | null;
  title?: string;
  error?: string | null;
}

export default function MediaViewer({ visible, onClose, kind, previewUri, uri, title, error }: Props) {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { if (visible) setLoaded(false); }, [visible, uri]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [visible, onClose]);

  const shown = uri ?? previewUri ?? null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
        <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
          <Text style={styles.title} numberOfLines={1}>{title ?? ''}</Text>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityLabel="Fechar" accessibilityRole="button">
            <Ionicons name="close" size={26} color={Colors.dark.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.body} pointerEvents="box-none">
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : kind === 'image' && shown ? (
            <>
              <View style={styles.image} pointerEvents="none">
                <Image source={{ uri: shown }} style={styles.image} resizeMode="contain" onLoad={() => setLoaded(true)} />
              </View>
              {!uri && <ActivityIndicator color={Colors.dark.text} style={styles.spinner} />}
            </>
          ) : kind === 'document' && uri && Platform.OS === 'web' ? (
            createElement('iframe', { src: uri, title: title ?? 'Documento', style: { width: '92%', height: '84%', border: 0, background: Colors.light.background, borderRadius: 8 } })
          ) : kind === 'video' && uri && Platform.OS === 'web' ? (
            createElement('video', { src: uri, controls: true, autoPlay: true, style: { maxWidth: '92%', maxHeight: '84%' } })
          ) : (
            <ActivityIndicator color={Colors.dark.text} size="large" />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.dark.background },
  top: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { color: Colors.dark.text, fontSize: 14, flex: 1, marginRight: 12 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.dark.border },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  image: { width: '100%', height: '100%' },
  spinner: { position: 'absolute', bottom: 40 },
  error: { color: Colors.dark.text, fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
});

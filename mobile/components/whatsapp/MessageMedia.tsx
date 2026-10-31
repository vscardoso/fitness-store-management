/**
 * Arquivo de uma mensagem do WhatsApp: a foto aparece na bolha; áudio, vídeo e PDF abrem ao tocar.
 * O arquivo é buscado no servidor (que o pega na Meta na hora), sempre com a sessão da loja.
 */
import { createElement, useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '@/services/api';
import { parseApiError } from '@/utils/apiError';
import type { WaMessage } from '@/services/whatsappService';
import MediaViewer from './MediaViewer';
import { useChatColors } from '@/hooks/useThemeColors';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

/** Baixa o arquivo da mensagem. Web: endereço blob:; celular: data URI. */
async function loadMedia(messageId: number, thumb = false): Promise<{ uri: string; mime: string }> {
  const web = Platform.OS === 'web';
  const res = await api.get(`/whatsapp/messages/${messageId}/media`, {
    params: thumb ? { thumb: true } : undefined,
    responseType: web ? 'blob' : 'arraybuffer',
    headers: { 'X-Skip-Loading': 'true' },
  });
  const mime = String(res.headers?.['content-type'] ?? 'application/octet-stream').split(';')[0];
  if (web) return { uri: URL.createObjectURL(res.data as Blob), mime };
  return { uri: `data:${mime};base64,${toBase64(new Uint8Array(res.data as ArrayBuffer))}`, mime };
}

async function openFile(uri: string, mime: string, name: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.open(uri, '_blank');
    return;
  }
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]?.split('+')[0] || 'bin';
  const path = `${FileSystem.cacheDirectory}whatsapp-${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(path, uri.split(',')[1], { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: name });
}

const LABEL: Record<string, string> = { audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', image: 'Foto' };

export default function MessageMedia({ message, mine }: { message: WaMessage; mine: boolean }) {
  const c = useChatColors();
  const media = message.media!;
  const isImage = media.kind === 'image' || media.kind === 'sticker';
  const [file, setFile] = useState<{ uri: string; mime: string } | null>(null);
  const [full, setFull] = useState<{ uri: string; mime: string } | null>(null);
  const [viewer, setViewer] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isImage);
  const [error, setError] = useState<string | null>(null);

  // foto: miniatura leve na bolha; a inteira só baixa quando a pessoa toca
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setFile(await loadMedia(message.id, isImage));
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isImage) load();
    return () => { if (Platform.OS === 'web' && file?.uri) URL.revokeObjectURL(file.uri); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  const color = mine ? c.bubbleOutText : c.bubbleInText;
  const name = media.filename || LABEL[media.kind];

  if (isImage) {
    if (file) {
      const openPhoto = async () => {
        setViewer(true);
        setViewerError(null);
        if (!full) {
          try {
            setFull(await loadMedia(message.id, false));
          } catch (e) {
            setViewerError(parseApiError(e));
          }
        }
      };
      return (
        <>
          <TouchableOpacity onPress={openPhoto} accessibilityLabel="Abrir foto">
            <Image source={{ uri: file.uri }} style={styles.photo} resizeMode="cover" />
          </TouchableOpacity>
          <MediaViewer visible={viewer} onClose={() => setViewer(false)} kind="image" previewUri={file.uri} uri={full?.uri ?? null} title={name} error={viewerError} />
        </>
      );
    }
    return (
      <View style={[styles.photo, styles.photoEmpty, { backgroundColor: c.inputBg }]}>
        {loading ? <ActivityIndicator color={c.accent} /> : (
          <TouchableOpacity onPress={load}><Text style={[styles.small, { color: c.textMuted }]}>{error ?? 'Foto'} Toque para tentar de novo.</Text></TouchableOpacity>
        )}
      </View>
    );
  }

  if (media.kind === 'audio' && file && Platform.OS === 'web') {
    return createElement('audio', { controls: true, src: file.uri, style: { maxWidth: 240 } });
  }

  return (
    <View style={{ gap: 4 }}>
      <TouchableOpacity
        style={[styles.fileBtn, { borderColor: mine ? c.bubbleOutMuted : c.border }]}
        disabled={loading}
        onPress={async () => {
          try {
            const f = file ?? (await loadMedia(message.id));
            setFile(f);
            if (media.kind === 'audio' && Platform.OS === 'web') return; // o player aparece no lugar do botão
            if (Platform.OS === 'web') { setViewer(true); return; }       // no navegador abre aqui dentro, não em outra aba
            await openFile(f.uri, f.mime, name);
          } catch (e) {
            setError(parseApiError(e));
          }
        }}
        accessibilityRole="button"
      >
        <Ionicons name={media.kind === 'audio' ? 'musical-notes-outline' : media.kind === 'video' ? 'videocam-outline' : 'document-text-outline'} size={20} color={color} />
        <Text style={{ color, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{loading ? 'Abrindo…' : `${name} · toque para abrir`}</Text>
      </TouchableOpacity>
      {error && <Text style={[styles.err, { color: c.danger }]}>{error}</Text>}
      {file && Platform.OS === 'web' && media.kind !== 'audio' && (
        <MediaViewer visible={viewer} onClose={() => setViewer(false)} kind={media.kind === 'video' ? 'video' : 'document'} uri={file.uri} title={name} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 220, height: 220, borderRadius: 12 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', padding: 12 },
  small: { fontSize: 12, textAlign: 'center' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 240 },
  err: { fontSize: 11 },
});

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
async function loadMedia(messageId: number): Promise<{ uri: string; mime: string }> {
  const web = Platform.OS === 'web';
  const res = await api.get(`/whatsapp/messages/${messageId}/media`, {
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
  const media = message.media!;
  const isImage = media.kind === 'image' || media.kind === 'sticker';
  const [file, setFile] = useState<{ uri: string; mime: string } | null>(null);
  const [loading, setLoading] = useState(isImage);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setFile(await loadMedia(message.id));
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

  const color = mine ? '#FFFFFF' : '#160F28';
  const name = media.filename || LABEL[media.kind];

  if (isImage) {
    if (file) {
      return (
        <TouchableOpacity onPress={() => openFile(file.uri, file.mime, name)} accessibilityLabel="Abrir foto">
          <Image source={{ uri: file.uri }} style={styles.photo} resizeMode="cover" />
        </TouchableOpacity>
      );
    }
    return (
      <View style={[styles.photo, styles.photoEmpty]}>
        {loading ? <ActivityIndicator color="#7C3AED" /> : (
          <TouchableOpacity onPress={load}><Text style={styles.small}>{error ?? 'Foto'} Toque para tentar de novo.</Text></TouchableOpacity>
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
        style={[styles.fileBtn, { borderColor: mine ? '#FFFFFF88' : '#E6E3EE' }]}
        disabled={loading}
        onPress={async () => {
          try {
            const f = file ?? (await loadMedia(message.id));
            setFile(f);
            if (media.kind === 'audio' && Platform.OS === 'web') return; // o player aparece no lugar do botão
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
      {error && <Text style={styles.err}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 220, height: 220, borderRadius: 10, backgroundColor: '#EEE' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', padding: 12 },
  small: { fontSize: 12, color: '#5B5670', textAlign: 'center' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 240 },
  err: { fontSize: 11, color: '#B91C1C' },
});

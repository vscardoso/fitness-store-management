import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { listConversations, WaConversation } from '@/services/whatsappService';
import { useBrandingColors } from '@/store/brandingStore';
import { parseApiError } from '@/utils/apiError';
import InviteSheet from '@/components/whatsapp/InviteSheet';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function WhatsappInboxScreen() {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const brand = useBrandingColors();
  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['whatsapp-conversations'],
    queryFn: listConversations,
    refetchInterval: 20000,
  });

  const renderItem = ({ item }: { item: WaConversation }) => (
    <TouchableOpacity style={styles.row} onPress={() => router.push(`/whatsapp/${item.id}` as any)} accessibilityRole="button">
      <View style={[styles.avatar, { backgroundColor: brand.primary + '20' }]}>
        <Ionicons name="logo-whatsapp" size={22} color={brand.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.line}>
          <Text style={[styles.name, item.unread_count > 0 && styles.bold]} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.time}>{when(item.last_message_at)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={[styles.preview, item.unread_count > 0 && styles.bold]} numberOfLines={1}>
            {item.last_direction === 'out' ? 'Você: ' : ''}{item.last_text ?? '(sem texto)'}
          </Text>
          {item.unread_count > 0 && (
            <View style={[styles.badge, { backgroundColor: brand.primary }]}><Text style={styles.badgeText}>{item.unread_count}</Text></View>
          )}
        </View>
        {!item.window_open && <Text style={styles.closed}>Janela de 24 h fechada</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <PageHeader
        title="Conversas do WhatsApp"
        subtitle="Número oficial da loja"
        rightActions={[{ icon: 'person-add-outline', onPress: () => setShowInvite(true) }]}
      />
      <InviteSheet visible={showInvite} onDismiss={() => setShowInvite(false)} />
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={brand.primary} /></View>
      ) : isError ? (
        <EmptyState icon="alert-circle-outline" title="Não consegui carregar" description={parseApiError(error)} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
          ListEmptyComponent={
            <EmptyState icon="chatbubbles-outline" title="Nenhuma conversa ainda" description="Quando uma cliente escrever para o número da loja, a conversa aparece aqui." />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E6E3EE' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, color: '#160F28', flex: 1 },
  bold: { fontWeight: '700' },
  time: { fontSize: 12, color: '#5B5670' },
  preview: { fontSize: 13, color: '#5B5670', flex: 1, marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  closed: { fontSize: 11, color: '#B45309', marginTop: 4 },
});

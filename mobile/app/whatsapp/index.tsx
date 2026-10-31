import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import InviteSheet from '@/components/whatsapp/InviteSheet';
import LabelChip from '@/components/whatsapp/LabelChip';
import { listConversations, listWhatsappLabels, WaConversation } from '@/services/whatsappService';
import { useChatColors } from '@/hooks/useThemeColors';
import { parseApiError } from '@/utils/apiError';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function WhatsappInboxScreen() {
  const router = useRouter();
  const c = useChatColors();
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const [labelId, setLabelId] = useState<number | null>(null);

  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['whatsapp-conversations', search.trim(), labelId],
    queryFn: () => listConversations(search, labelId),
    refetchInterval: 20000,
  });
  const { data: labels = [] } = useQuery({ queryKey: ['whatsapp-labels'], queryFn: listWhatsappLabels });

  const renderItem = ({ item }: { item: WaConversation }) => {
    const unread = item.unread_count > 0;
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={() => router.push(`/whatsapp/${item.id}` as any)}
        accessibilityRole="button"
      >
        <View style={[styles.avatar, { backgroundColor: c.label.primary.bg }]}>
          <Text style={[styles.avatarText, { color: c.accent }]}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.line}>
            <Text style={[styles.name, { color: c.text }, unread && styles.bold]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.time, { color: unread ? c.accent : c.textMuted }]}>{when(item.last_message_at)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={[styles.preview, { color: c.textMuted }, unread && { color: c.text, fontWeight: '600' }]} numberOfLines={1}>
              {item.last_direction === 'out' ? 'Você: ' : ''}{item.last_text ?? '(sem texto)'}
            </Text>
            {unread && (
              <View style={[styles.badge, { backgroundColor: c.accent }]}>
                <Text style={[styles.badgeText, { color: c.bubbleOutText }]}>{item.unread_count}</Text>
              </View>
            )}
          </View>
          {(item.labels.length > 0 || !item.window_open) && (
            <View style={styles.tags}>
              {item.labels.map((l) => <LabelChip key={l.id} name={l.name} colorKey={l.color_key} small />)}
              {!item.window_open && (
                <View style={[styles.closed, { backgroundColor: c.warningSoft }]}>
                  <Ionicons name="time-outline" size={11} color={c.warning} />
                  <Text style={[styles.closedText, { color: c.warning }]}>Janela fechada</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <PageHeader
        title="Conversas do WhatsApp"
        subtitle="Número oficial da loja"
        rightActions={[{ icon: 'person-add-outline', onPress: () => setShowInvite(true) }]}
      />
      <InviteSheet visible={showInvite} onDismiss={() => setShowInvite(false)} />
      <View style={[styles.searchBox, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={18} color={c.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nome ou telefone"
          placeholderTextColor={c.textMuted}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Limpar busca">
            <Ionicons name="close-circle" size={18} color={c.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {labels.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
          <TouchableOpacity
            onPress={() => setLabelId(null)}
            style={[styles.filterAll, { borderColor: labelId === null ? c.accent : c.border, backgroundColor: labelId === null ? c.label.primary.bg : c.surface }]}
            accessibilityRole="button"
          >
            <Text style={{ color: labelId === null ? c.accent : c.textMuted, fontWeight: '600', fontSize: 13 }}>Todas</Text>
          </TouchableOpacity>
          {labels.map((l) => (
            <LabelChip key={l.id} name={l.name} colorKey={l.color_key} selected={labelId === l.id} onPress={() => setLabelId(labelId === l.id ? null : l.id)} />
          ))}
        </ScrollView>
      )}
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={c.accent} /></View>
      ) : isError ? (
        <EmptyState icon="alert-circle-outline" title="Não consegui carregar" description={parseApiError(error)} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(x) => String(x.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title={search.trim() || labelId ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              description={search.trim() || labelId ? 'Confira o nome, o telefone ou a etiqueta.' : 'Quando uma cliente escrever para o número da loja, a conversa aparece aqui. Para chamar uma cliente, abra o cadastro dela.'}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, borderRadius: 16, padding: 14, borderWidth: 1 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, flex: 1 },
  bold: { fontWeight: '700' },
  time: { fontSize: 12 },
  preview: { fontSize: 13, flex: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  closedText: { fontSize: 11, fontWeight: '600' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  filters: { flexGrow: 0, marginTop: 10 },
  filtersContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterAll: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1.5 },
});

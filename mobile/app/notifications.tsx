/**
 * Central de Notificações: alertas de estoque baixo e produto zerado.
 * Não lidas aparecem primeiro; tocar abre o produto e marca como lida.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useInbox, useMarkAllRead, useMarkRead } from '@/hooks/useNotificationInbox';
import { formatDateTime } from '@/utils/format';
import type { InboxNotification } from '@/services/notificationInboxService';

const KIND: Record<InboxNotification['kind'], { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  low_stock: { icon: 'alert-circle-outline', color: Colors.light.warning, bg: Colors.light.warning + '22' },
  out_of_stock: { icon: 'close-circle-outline', color: Colors.light.error, bg: Colors.light.error + '22' },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const { data, isLoading, isRefetching, refetch } = useInbox();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const items = data ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  const open = (n: InboxNotification) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.product_id) router.push({ pathname: '/products/[id]', params: { id: String(n.product_id) } } as any);
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Notificações"
        subtitle={unread > 0 ? `${unread} ${unread === 1 ? 'não lida' : 'não lidas'}` : 'Tudo em dia'}
        showBackButton
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {unread > 0 && (
          <TouchableOpacity style={styles.markAll} onPress={() => markAll.mutate()} disabled={markAll.isPending}>
            <Ionicons name="checkmark-done-outline" size={18} color={brandingColors.primary} />
            <Text style={[styles.markAllText, { color: brandingColors.primary }]}>Marcar todas como lidas</Text>
          </TouchableOpacity>
        )}

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={brandingColors.primary} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="Nenhum alerta por enquanto"
            description="Você será avisado quando um produto estiver com estoque baixo ou acabar."
          />
        ) : (
          items.map((n) => {
            const k = KIND[n.kind] ?? KIND.low_stock;
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.card, !n.is_read && { borderColor: k.color }]}
                onPress={() => open(n)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: k.bg }]}>
                  <Ionicons name={k.icon} size={22} color={k.color} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={[styles.title, !n.is_read && styles.titleUnread]}>{n.title}</Text>
                  <Text style={styles.body}>{n.body}</Text>
                  <Text style={styles.date}>{formatDateTime(n.created_at)}</Text>
                </View>
                {!n.is_read && <View style={[styles.dot, { backgroundColor: k.color }]} />}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: 40 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingVertical: 4 },
  markAllText: { fontSize: 13, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, color: Colors.light.text, fontWeight: '600' },
  titleUnread: { fontWeight: '800' },
  body: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2, lineHeight: 17 },
  date: { fontSize: 11, color: Colors.light.textTertiary, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

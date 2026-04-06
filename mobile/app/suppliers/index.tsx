/**
 * Lista de Fornecedores
 * Acessada via more.tsx → /suppliers
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '@/components/layout/PageHeader';
import SupplierPickerSheet from '@/components/suppliers/SupplierPickerSheet';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useSuppliers } from '@/hooks/useSuppliers';
import type { Supplier } from '@/types';

export default function SuppliersIndexScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [search, setSearch] = useState('');
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  const { data: suppliers = [], isLoading, isRefetching, refetch, error } = useSuppliers();

  // Animação de entrada
  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(24);

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = 0;
      headerScale.value = 0.94;
      contentOpacity.value = 0;
      contentTranslateY.value = 24;

      headerOpacity.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) });
      headerScale.value = withSpring(1, { damping: 16, stiffness: 210 });

      const t = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 320 });
        contentTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);

      return () => clearTimeout(t);
    }, [contentOpacity, contentTranslateY, headerOpacity, headerScale])
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.cnpj && s.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
      (s.phone && s.phone.includes(q))
    );
  });

  const renderItem = ({ item }: { item: Supplier }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/suppliers/${item.id}` as any)}
      activeOpacity={0.75}
    >
      <View style={[styles.cardIcon, { backgroundColor: Colors.light.primaryLight }]}>
        <Ionicons name="business" size={22} color={brandingColors.primary} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {item.cnpj ? (
          <Text style={styles.cardMeta}>CNPJ: {item.cnpj}</Text>
        ) : item.phone ? (
          <Text style={styles.cardMeta}>{item.phone}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    if (search) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={Colors.light.textTertiary} />
          <Text style={styles.emptyTitle}>Nenhum resultado para "{search}"</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.light.error} />
          <Text style={styles.emptyTitle}>Erro ao carregar fornecedores</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.75}>
            <Text style={[styles.retryText, { color: brandingColors.primary }]}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="business-outline" size={64} color={Colors.light.textTertiary} />
        <Text style={styles.emptyTitle}>Nenhum fornecedor cadastrado</Text>
        <Text style={styles.emptySubtitle}>
          Adicione fornecedores ao registrar entradas de estoque
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Fornecedores"
          subtitle={
            suppliers.length === 0
              ? 'Nenhum fornecedor cadastrado'
              : `${suppliers.length} fornecedor${suppliers.length !== 1 ? 'es' : ''} cadastrado${suppliers.length !== 1 ? 's' : ''}`
          }
          showBackButton
          onBack={() => router.push('/(tabs)/more')}
        />
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        {/* Search bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar fornecedor..."
            placeholderTextColor={Colors.light.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[brandingColors.primary]}
              />
            }
          />
        )}

        {/* FAB — cadastrar novo */}
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: brandingColors.primary }]}
          onPress={() => setShowCreateSheet(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={brandingColors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Sheet de cadastro rápido */}
      <SupplierPickerSheet
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        onSelect={(s) => {
          setShowCreateSheet(false);
          if (s) router.push(`/suppliers/${s.id}` as any);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl + 60,
    paddingTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  cardMeta: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 4,
    gap: theme.spacing.sm,
  },
  skeletonCard: {
    height: 80,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  fab: {
    position: 'absolute',
    right: theme.spacing.md,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

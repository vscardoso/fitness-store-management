import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Text,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatPhone, formatCurrency } from '@/utils/format';
import { getCustomers } from '@/services/customerService';
import EmptyState from '@/components/ui/EmptyState';
import BottomSheet from '@/components/ui/BottomSheet';
import type { Customer } from '@/types';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

interface CustomerSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectCustomer: (customer: Customer) => void;
  title?: string;
  subtitle?: string;
  /** Texto do botão de baixo (padrão: continuar sem cliente) */
  dismissLabel?: string;
}

export default function CustomerSelectionModal({
  visible,
  onDismiss,
  onSelectCustomer,
  title = 'Selecionar cliente',
  subtitle = 'Opcional: você pode vender sem cliente',
  dismissLabel = 'Continuar sem cliente',
}: CustomerSelectionModalProps) {
  const brandingColors = useBrandingColors();
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: customers,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers(),
    enabled: visible,
  });

  useEffect(() => {
    if (visible) setSearchQuery('');
  }, [visible]);

  const filteredCustomers = (customers ?? []).filter((customer: Customer) => {
    const search = searchQuery.toLowerCase();
    return (
      customer.full_name.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search) ||
      customer.document_number?.includes(search)
    );
  });

  const handleSelectCustomer = (customer: Customer) => {
    onSelectCustomer(customer);
    onDismiss();
  };

  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity
      onPress={() => handleSelectCustomer(item)}
      activeOpacity={0.7}
      style={styles.customerRow}
    >
      {/* Avatar */}
      <View style={[styles.avatarContainer, { backgroundColor: brandingColors.primary + '15' }]}>
        <Ionicons name="person" size={18} color={brandingColors.primary} />
      </View>

      {/* Info */}
      <View style={styles.customerInfo}>
        <Text style={styles.customerName} numberOfLines={1}>
          {item.full_name}
        </Text>
        <Text style={styles.customerDetail} numberOfLines={1}>
          {item.phone ? formatPhone(item.phone) : item.email ?? '—'}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.customerStats}>
        {item.total_purchases > 0 && (
          <View style={[styles.purchaseBadge, { backgroundColor: brandingColors.primary + '12' }]}>
            <Text style={[styles.purchaseBadgeText, { color: brandingColors.primary }]}>
              {item.total_purchases}×
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      subtitle={subtitle}
      icon="people-outline"
      actions={[{ label: dismissLabel, variant: 'secondary', onPress: onDismiss }]}
    >
      {/* Search Bar nativo */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por nome, telefone, email..."
          placeholderTextColor={Colors.light.textTertiary}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Lista */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
          <Text style={styles.loadingText}>Carregando clientes...</Text>
        </View>
      ) : isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar clientes"
          description="Verifique sua conexão e tente novamente"
        />
      ) : (
        <View style={styles.listContent}>
          {filteredCustomers.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={searchQuery ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              description={
                searchQuery
                  ? 'Tente outro termo de busca'
                  : 'Cadastre clientes para vinculá-los às vendas'
              }
            />
          ) : (
            filteredCustomers.slice(0, 60).map((item) => (
              <React.Fragment key={item.id}>{renderCustomer({ item } as any)}</React.Fragment>
            ))
          )}
          {filteredCustomers.length > 60 && (
            <Text style={styles.loadingText}>Mostrando 60 de {(filteredCustomers ?? []).length}. Digite o nome para achar os outros.</Text>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({

  // Header

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.sm + 4,
    height: 44,
    gap: theme.spacing.sm,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    paddingVertical: 0,
  },

  // Loading
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },

  // List
  listContent: {
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },

  // Customer Row
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm + 4,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  avatarContainer: {
    width: 36, height: 36,
    borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  customerInfo: {
    flex: 1,
    minWidth: 0,
  },
  customerName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  customerDetail: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  customerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexShrink: 0,
  },
  purchaseBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  purchaseBadgeText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
  },

  // Footer
});


import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatPhone, formatCurrency } from '@/utils/format';
import { getCustomers } from '@/services/customerService';
import EmptyState from '@/components/ui/EmptyState';
import type { Customer } from '@/types';

interface CustomerSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

export default function CustomerSelectionModal({
  visible,
  onDismiss,
  onSelectCustomer,
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

  const filteredCustomers = customers?.filter((customer: Customer) => {
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.modalOverlay} onPress={onDismiss}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="people" size={18} color={brandingColors.primary} />
              </View>
              <Text style={styles.title}>Selecionar Cliente</Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={Colors.light.textSecondary} />
            </TouchableOpacity>
          </View>

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
            <FlatList
              data={filteredCustomers}
              renderItem={renderCustomer}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <EmptyState
                  icon="people-outline"
                  title={searchQuery ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                  description={
                    searchQuery
                      ? 'Tente outro termo de busca'
                      : 'Cadastre clientes para vinculá-los às vendas'
                  }
                />
              }
            />
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.continueButton} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={styles.continueButtonText}>Continuar sem cliente</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    maxHeight: '82%',
    paddingBottom: theme.spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: theme.borderRadius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
  },
  closeButton: {
    width: 36, height: 36,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center', alignItems: 'center',
  },

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
    paddingHorizontal: theme.spacing.lg,
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
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  continueButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
});


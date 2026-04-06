/**
 * SupplierPickerSheet — Bottom sheet para selecionar ou cadastrar fornecedor por item de entrada
 *
 * Funcionalidades:
 * - Busca por nome/CNPJ
 * - Seção de sugestões (fornecedores já vinculados ao produto)
 * - Opção "Sem fornecedor"
 * - Mini-form inline para cadastrar novo fornecedor sem sair da tela
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet from '@/components/ui/BottomSheet';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useSuppliers, useProductSuppliers, useCreateSupplier } from '@/hooks/useSuppliers';
import { cnpjMask, phoneMask } from '@/utils/masks';
import type { Supplier } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (supplier: Supplier | null) => void;
  productId?: number;
  productName?: string;
  selectedSupplierId?: number | null;
}

export default function SupplierPickerSheet({
  visible,
  onClose,
  onSelect,
  productId,
  productName,
  selectedSupplierId,
}: Props) {
  const brandingColors = useBrandingColors();
  const [search, setSearch] = useState('');
  const [showMiniForm, setShowMiniForm] = useState(false);
  const [miniName, setMiniName] = useState('');
  const [miniCnpj, setMiniCnpj] = useState('');
  const [miniPhone, setMiniPhone] = useState('');
  const [miniNameError, setMiniNameError] = useState('');

  const { data: allSuppliers = [], isLoading, error, refetch } = useSuppliers();
  const { data: productSuppliers = [] } = useProductSuppliers(productId ?? 0);
  const createMutation = useCreateSupplier();

  const suggestedIds = useMemo(
    () => new Set(productSuppliers.map((ps) => ps.supplier_id)),
    [productSuppliers]
  );

  const suggested = useMemo(
    () => allSuppliers.filter((s) => suggestedIds.has(s.id)),
    [allSuppliers, suggestedIds]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allSuppliers;
    return allSuppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.cnpj && s.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    );
  }, [allSuppliers, search]);

  const handleSelect = (supplier: Supplier | null) => {
    onSelect(supplier);
    onClose();
    setSearch('');
    setShowMiniForm(false);
    setMiniName('');
    setMiniCnpj('');
    setMiniPhone('');
  };

  const handleSaveMini = async () => {
    if (!miniName.trim()) {
      setMiniNameError('Nome do fornecedor é obrigatório');
      return;
    }
    setMiniNameError('');
    try {
      const created = await createMutation.mutateAsync({
        name: miniName.trim(),
        cnpj: miniCnpj.trim() || null,
        phone: miniPhone.trim() || null,
      });
      handleSelect(created);
    } catch {
      // erro tratado pelo hook
    }
  };

  const renderSupplierRow = (supplier: Supplier, isSelected: boolean) => {
    const ps = productSuppliers.find((p) => p.supplier_id === supplier.id);
    return (
      <TouchableOpacity
        key={supplier.id}
        style={[
          styles.supplierRow,
          isSelected && { backgroundColor: Colors.light.primaryLight },
        ]}
        onPress={() => handleSelect(supplier)}
        activeOpacity={0.75}
      >
        <View style={[styles.supplierIcon, { backgroundColor: Colors.light.primaryLight }]}>
          <Ionicons name="business" size={18} color={brandingColors.primary} />
        </View>
        <View style={styles.supplierInfo}>
          <Text style={styles.supplierName} numberOfLines={1}>{supplier.name}</Text>
          {ps ? (
            <Text style={styles.supplierMeta}>
              Último: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ps.last_unit_cost)}
            </Text>
          ) : supplier.cnpj ? (
            <Text style={styles.supplierMeta}>{supplier.cnpj}</Text>
          ) : null}
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={20} color={brandingColors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onClose}
      title="Selecionar Fornecedor"
      subtitle={productName ? `Produto: ${productName}` : undefined}
      icon="business-outline"
    >
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome ou CNPJ"
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
        <ActivityIndicator
          size="small"
          color={brandingColors.primary}
          style={{ marginVertical: 24 }}
        />
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="wifi-outline" size={40} color={Colors.light.textTertiary} />
          <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.75}>
            <Text style={[styles.retryText, { color: brandingColors.primary }]}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Sugeridos */}
          {suggested.length > 0 && !search && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SUGERIDOS PARA ESTE PRODUTO</Text>
              {suggested.map((s) => renderSupplierRow(s, s.id === selectedSupplierId))}
            </View>
          )}

          {/* Todos os fornecedores */}
          {filtered.length > 0 ? (
            <View style={styles.section}>
              {!search && <Text style={styles.sectionLabel}>TODOS OS FORNECEDORES</Text>}
              {filtered
                .filter((s) => search || !suggestedIds.has(s.id))
                .map((s) => renderSupplierRow(s, s.id === selectedSupplierId))}
            </View>
          ) : search ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={40} color={Colors.light.textTertiary} />
              <Text style={styles.emptyTitle}>Nenhum resultado para "{search}"</Text>
            </View>
          ) : allSuppliers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={48} color={Colors.light.textTertiary} />
              <Text style={styles.emptyTitle}>Nenhum fornecedor cadastrado</Text>
              <Text style={styles.emptySubtitle}>Cadastre o primeiro abaixo</Text>
            </View>
          ) : null}

          {/* Sem fornecedor */}
          <TouchableOpacity
            style={[
              styles.supplierRow,
              selectedSupplierId === null && { backgroundColor: Colors.light.primaryLight },
            ]}
            onPress={() => handleSelect(null)}
            activeOpacity={0.75}
          >
            <View style={[styles.supplierIcon, { backgroundColor: Colors.light.backgroundSecondary }]}>
              <Ionicons name="remove-circle-outline" size={18} color={Colors.light.textSecondary} />
            </View>
            <Text style={[styles.supplierName, { color: Colors.light.textSecondary, fontWeight: '400' }]}>
              Sem fornecedor
            </Text>
          </TouchableOpacity>

          {/* Botão cadastrar novo */}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowMiniForm(!showMiniForm)}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={16} color={brandingColors.primary} />
            <Text style={[styles.addBtnText, { color: brandingColors.primary }]}>
              {showMiniForm ? 'Cancelar' : '+ Cadastrar novo fornecedor'}
            </Text>
          </TouchableOpacity>

          {/* Mini-form inline */}
          {showMiniForm && (
            <View style={styles.miniForm}>
              <Text style={styles.miniFormLabel}>Nome *</Text>
              <TextInput
                style={[styles.miniInput, miniNameError ? styles.miniInputError : null]}
                placeholder="Nome do fornecedor"
                placeholderTextColor={Colors.light.textTertiary}
                value={miniName}
                onChangeText={(t) => {
                  setMiniName(t);
                  if (t.trim()) setMiniNameError('');
                }}
              />
              {miniNameError ? (
                <Text style={styles.miniErrorText}>{miniNameError}</Text>
              ) : null}

              <View style={styles.miniRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniFormLabel}>CNPJ (opcional)</Text>
                  <TextInput
                    style={styles.miniInput}
                    placeholder="00.000.000/0000-00"
                    placeholderTextColor={Colors.light.textTertiary}
                    value={miniCnpj}
                    onChangeText={(t) => setMiniCnpj(cnpjMask(t))}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ width: theme.spacing.sm }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniFormLabel}>Telefone (opcional)</Text>
                  <TextInput
                    style={styles.miniInput}
                    placeholder="(00) 00000-0000"
                    placeholderTextColor={Colors.light.textTertiary}
                    value={miniPhone}
                    onChangeText={(t) => setMiniPhone(phoneMask(t))}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.miniActions}>
                <TouchableOpacity
                  style={styles.miniCancelBtn}
                  onPress={() => {
                    setShowMiniForm(false);
                    setMiniName('');
                    setMiniCnpj('');
                    setMiniPhone('');
                    setMiniNameError('');
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.miniCancelText, { color: brandingColors.primary }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.miniSaveBtn, { overflow: 'hidden', borderRadius: theme.borderRadius.xl }]}
                  onPress={handleSaveMini}
                  disabled={createMutation.isPending}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={brandingColors.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.miniSaveGradient}
                  >
                    {createMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.miniSaveText}>Salvar fornecedor</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
  },
  section: {
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    color: Colors.light.textTertiary,
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
    minHeight: 56,
    marginBottom: 4,
  },
  supplierIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierInfo: {
    flex: 1,
    minWidth: 0,
  },
  supplierName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  supplierMeta: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
  },
  addBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  miniForm: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.xl,
    gap: theme.spacing.xs,
  },
  miniFormLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  miniInput: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.sm,
    height: 44,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
  },
  miniInputError: {
    borderColor: Colors.light.error,
  },
  miniErrorText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.error,
  },
  miniRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.xs,
  },
  miniActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  miniCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
    height: 44,
  },
  miniCancelText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  miniSaveBtn: {
    flex: 2,
    height: 44,
  },
  miniSaveGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.xl,
  },
  miniSaveText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
});

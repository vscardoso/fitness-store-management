/**
 * Folha do fornecedor da compra: buscar, trocar e cadastrar um novo na hora. Só o nome é obrigatório (muito fornecedor de
 * feira não tem documento). O fornecedor novo NÃO é gravado aqui: vai junto com a compra, em "Lançar no estoque", então
 * quem desiste da compra não deixa cadastro solto.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';

import BottomSheet from '@/components/ui/BottomSheet';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { documentMask, phoneMask } from '@/utils/masks';
import { norm, supplierKey, type SupplierRef } from '@/utils/receivePurchase';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  suppliers: SupplierRef[];
  /** fornecedor em uso (aparece marcado) */
  current?: SupplierRef | null;
  onPick: (s: SupplierRef) => void;
  title?: string;
}

export default function SupplierSheet({ visible, onDismiss, suppliers, current, onPick, title = 'De quem você está comprando?' }: Props) {
  const brand = useBrandingColors();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', doc: '' });

  useEffect(() => {
    if (visible) {
      setMode('list');
      setQ('');
      setForm({ name: '', phone: '', doc: '' });
    }
  }, [visible]);

  const shown = useMemo(() => suppliers.filter((s) => !q.trim() || norm(s.name).includes(norm(q))), [suppliers, q]);
  const exact = suppliers.find((s) => norm(s.name) === norm(q));
  const dup = mode === 'create' ? suppliers.find((s) => norm(s.name) === norm(form.name)) : undefined;
  const problem = mode === 'create' ? (norm(form.name).length < 2 ? 'Falta o nome do fornecedor' : dup ? 'Já existe um fornecedor com esse nome' : '') : '';
  const currentKey = current ? supplierKey(current) : '';

  const startCreate = (name: string) => {
    setForm({ name, phone: '', doc: '' });
    setMode('create');
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={mode === 'create' ? 'Fornecedor novo' : title}
      icon={mode === 'create' ? 'person-add-outline' : 'storefront-outline'}
      tall
      actions={mode === 'create'
        ? [{
          label: 'Cadastrar e usar', variant: 'primary', disabled: !!problem,
          onPress: () => onPick({ name: form.name.trim().replace(/\s+/g, ' '), phone: form.phone.trim() || undefined, doc: form.doc.trim() || undefined }),
        }]
        : undefined}
    >
      {mode === 'list' ? (
        <View style={{ gap: 10 }}>
          <View style={styles.search}>
            <Ionicons name="search-outline" size={18} color={Colors.light.textTertiary} />
            <RNTextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="Digite o nome do fornecedor"
              placeholderTextColor={Colors.light.textTertiary}
              autoCorrect={false}
              accessibilityLabel="Buscar fornecedor"
            />
          </View>
          {shown.map((s) => (
            <TouchableOpacity key={supplierKey(s)} style={styles.row} onPress={() => onPick(s)} accessibilityRole="button" accessibilityLabel={`Usar ${s.name}`}>
              <View style={[styles.thumb, { backgroundColor: brand.primary + '14' }]}>
                <Text style={[styles.thumbText, { color: brand.primary }]}>{s.name.trim()[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
                {!!s.phone && <Text style={styles.sub} numberOfLines={1}>{s.phone}</Text>}
              </View>
              {supplierKey(s) === currentKey && <Text style={[styles.badge, { color: brand.primary }]}>em uso</Text>}
            </TouchableOpacity>
          ))}
          {!shown.length && !!q.trim() && <Text style={styles.sub}>Nenhum fornecedor com esse nome.</Text>}
          {!exact && (
            <TouchableOpacity style={[styles.row, styles.rowNew, { borderColor: brand.primary }]} onPress={() => startCreate(q.trim())}
              accessibilityRole="button" accessibilityLabel="Cadastrar fornecedor novo">
              <View style={[styles.thumb, { backgroundColor: brand.primary + '14' }]}>
                <Ionicons name="add" size={20} color={brand.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={2}>{q.trim() ? `Cadastrar “${q.trim()}” como fornecedor novo` : 'Novo fornecedor'}</Text>
                <Text style={styles.sub}>Só o nome é obrigatório. O resto pode ficar para depois.</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <TextInput mode="outlined" label="Nome" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })}
            placeholder="Ex.: Barraca da Maria, Brás" activeOutlineColor={brand.primary} autoFocus />
          <TextInput mode="outlined" label="Telefone ou WhatsApp (opcional)" value={form.phone} keyboardType="phone-pad"
            onChangeText={(t) => setForm({ ...form, phone: phoneMask(t) })} activeOutlineColor={brand.primary} />
          <TextInput mode="outlined" label="CPF ou CNPJ (opcional)" value={form.doc} keyboardType="number-pad"
            onChangeText={(t) => setForm({ ...form, doc: documentMask(t) })} activeOutlineColor={brand.primary} />
          <Text style={styles.sub}>Muitos fornecedores de feira não têm documento. Pode ficar em branco e completar depois.</Text>
          {!!problem && <Text style={styles.error}>{problem}</Text>}
          {!!dup && (
            <TouchableOpacity style={styles.row} onPress={() => onPick(dup)} accessibilityRole="button" accessibilityLabel={`Usar o existente ${dup.name}`}>
              <Text style={[styles.name, { color: brand.primary }]}>Usar o existente: {dup.name}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setMode('list')} accessibilityRole="button" style={styles.back}>
            <Text style={[styles.name, { color: brand.primary }]}>Voltar à lista</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 12, paddingHorizontal: 12, height: 48, backgroundColor: Colors.light.surfaceSoft },
  searchInput: { flex: 1, fontSize: 16, color: Colors.light.text, height: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 14, backgroundColor: Colors.light.card },
  rowNew: { borderStyle: 'dashed' },
  thumb: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontSize: 16, fontWeight: theme.fontWeight.bold },
  name: { fontSize: 15, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary },
  badge: { fontSize: 12, fontWeight: theme.fontWeight.bold },
  error: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.error },
  back: { minHeight: 44, justifyContent: 'center' },
});

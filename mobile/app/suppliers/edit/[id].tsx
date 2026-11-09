/**
 * Editar fornecedor: nome, CPF ou CNPJ, telefone, e-mail e observações (PUT /suppliers/{id}).
 * O botão "Editar" e o lápis da ficha do fornecedor levavam a esta rota, que não existia.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { parseApiError } from '@/utils/apiError';
import { documentMask, phoneMask } from '@/utils/masks';
import { getSupplierById, updateSupplier } from '@/services/supplierService';
import ScreenLoader from '@/components/ui/ScreenLoader';

export default function EditSupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const supplierId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const { data: supplier, isLoading, error } = useQuery({
    queryKey: ['supplier', supplierId], queryFn: () => getSupplierById(supplierId), enabled: supplierId > 0,
  });
  const [form, setForm] = useState({ name: '', cnpj: '', phone: '', email: '', notes: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name ?? '', cnpj: documentMask(supplier.cnpj ?? ''), phone: phoneMask(supplier.phone ?? ''),
        email: supplier.email ?? '', notes: supplier.notes ?? '',
      });
    }
  }, [supplier]);

  const save = useMutation({
    mutationFn: () => updateSupplier(supplierId, {
      name: form.name.trim(),
      cnpj: form.cnpj.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.replace(`/suppliers/${supplierId}` as any);
    },
    onError: (e) => setFormError(parseApiError(e) || 'Não foi possível salvar.'),
  });

  const submit = () => {
    setFormError('');
    if (form.name.trim().length < 2) {
      setFormError('Informe o nome do fornecedor (mínimo 2 letras).');
      return;
    }
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError('E-mail inválido.');
      return;
    }
    save.mutate();
  };

  const header = <PageHeader title="Editar fornecedor" subtitle={supplier?.name} showBackButton backFallback={`/suppliers/${supplierId}`} />;

  if (isLoading) {
    return <View style={styles.container}>{header}<ScreenLoader /></View>;
  }
  if (error || !supplier) {
    return (
      <View style={styles.container}>
        {header}
        <Text style={styles.empty}>{error ? parseApiError(error) : 'Fornecedor não encontrado.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, desktop]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {!!formError && <Text style={styles.error}>{formError}</Text>}
          <TextInput mode="outlined" label="Nome *" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })}
            activeOutlineColor={brand.primary} />
          <TextInput mode="outlined" label="CPF ou CNPJ (opcional)" value={form.cnpj} keyboardType="number-pad"
            onChangeText={(t) => setForm({ ...form, cnpj: documentMask(t) })} activeOutlineColor={brand.primary} />
          <TextInput mode="outlined" label="Telefone (opcional)" value={form.phone} keyboardType="phone-pad"
            onChangeText={(t) => setForm({ ...form, phone: phoneMask(t) })} activeOutlineColor={brand.primary} />
          <TextInput mode="outlined" label="E-mail (opcional)" value={form.email} keyboardType="email-address" autoCapitalize="none"
            onChangeText={(t) => setForm({ ...form, email: t })} activeOutlineColor={brand.primary} />
          <TextInput mode="outlined" label="Observações (opcional)" value={form.notes} multiline
            onChangeText={(t) => setForm({ ...form, notes: t })} activeOutlineColor={brand.primary} />
          <View style={styles.actions}>
            <Button mode="outlined" onPress={() => router.back()}>Cancelar</Button>
            <Button mode="contained" buttonColor={brand.primary} loading={save.isPending} disabled={save.isPending} onPress={submit}>
              Salvar
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  error: { color: Colors.light.error, fontWeight: '600' },
  empty: { textAlign: 'center', color: Colors.light.textSecondary, marginTop: 32 },
});

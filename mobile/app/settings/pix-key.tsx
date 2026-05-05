import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getStorePIX, updateStorePIX } from '@/services/storeService';
import type { StorePIXKey } from '@/services/storeService';

const PIX_TYPES = [
  { value: 'cpf',    label: 'CPF',            mask: '000.000.000-00',  placeholder: '000.000.000-00' },
  { value: 'cnpj',   label: 'CNPJ',           mask: '00.000.000/0000-00', placeholder: '00.000.000/0000-00' },
  { value: 'email',  label: 'E-mail',         mask: '',               placeholder: 'exemplo@email.com' },
  { value: 'phone',  label: 'Telefone',       mask: '+55 00 00000-0000', placeholder: '+55 11 99999-9999' },
  { value: 'random', label: 'Chave aleatória', mask: '',              placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
] as const;

type PIXKeyType = typeof PIX_TYPES[number]['value'];

export default function PIXKeyScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<StorePIXKey | null>(null);
  const [selectedType, setSelectedType] = useState<PIXKeyType>('cpf');
  const [keyValue, setKeyValue] = useState('');

  useEffect(() => {
    getStorePIX()
      .then((data) => {
        setCurrent(data);
        if (data.pix_key_type) setSelectedType(data.pix_key_type as PIXKeyType);
        if (data.pix_key) setKeyValue(data.pix_key);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedTypeInfo = PIX_TYPES.find(t => t.value === selectedType)!;

  const handleSave = async () => {
    if (!keyValue.trim()) {
      Alert.alert('Campo obrigatório', 'Informe a chave PIX.');
      return;
    }
    setSaving(true);
    try {
      await updateStorePIX({ pix_key: keyValue.trim(), pix_key_type: selectedType });
      Alert.alert('Salvo!', 'Chave PIX configurada. Agora o sistema gerará QR Codes automaticamente ao receber pagamentos via PIX.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.detail || 'Não foi possível salvar a chave PIX.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert('Remover chave PIX', 'Tem certeza? O sistema voltará a usar o modo padrão.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await updateStorePIX({ pix_key: null });
            setKeyValue('');
            setCurrent({ pix_key: null, pix_key_type: null, has_pix_key: false });
          } catch (e: any) {
            Alert.alert('Erro', e?.response?.data?.detail || 'Erro ao remover chave.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Chave PIX" showBackButton onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader title="Chave PIX" showBackButton onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: brandingColors.primary + '12', borderColor: brandingColors.primary + '30' }]}>
          <Ionicons name="qr-code-outline" size={22} color={brandingColors.primary} />
          <View style={styles.infoText}>
            <Text style={[styles.infoTitle, { color: brandingColors.primary }]}>QR Code PIX sem API externa</Text>
            <Text style={styles.infoSubtitle}>
              Configure sua chave PIX e o sistema gerará o QR Code automaticamente no checkout — sem precisar de Mercado Pago ou outra integração.
            </Text>
          </View>
        </View>

        {/* Status atual */}
        {current?.has_pix_key && (
          <View style={styles.currentCard}>
            <View style={styles.currentRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.light.success} />
              <Text style={styles.currentLabel}>Chave PIX ativa</Text>
            </View>
            <Text style={styles.currentKey} numberOfLines={1}>{current.pix_key}</Text>
            <Text style={styles.currentType}>{PIX_TYPES.find(t => t.value === current.pix_key_type)?.label || current.pix_key_type}</Text>
          </View>
        )}

        {/* Tipo de chave */}
        <Text style={styles.sectionLabel}>TIPO DA CHAVE</Text>
        <View style={styles.typeGrid}>
          {PIX_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, selectedType === t.value && { backgroundColor: brandingColors.primary + '15', borderColor: brandingColors.primary }]}
              onPress={() => { setSelectedType(t.value); setKeyValue(''); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.typeChipText, selectedType === t.value && { color: brandingColors.primary, fontWeight: '700' }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input da chave */}
        <Text style={styles.sectionLabel}>CHAVE PIX</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={keyValue}
            onChangeText={setKeyValue}
            placeholder={selectedTypeInfo.placeholder}
            placeholderTextColor={Colors.light.textTertiary}
            autoCapitalize="none"
            keyboardType={selectedType === 'email' ? 'email-address' : selectedType === 'phone' ? 'phone-pad' : 'default'}
            editable={!saving}
          />
        </View>
        <Text style={styles.hint}>
          {selectedType === 'phone' && 'Formato: +55 DDD Número (ex: +55 11 99999-9999)'}
          {selectedType === 'cpf' && 'Apenas o CPF cadastrado no banco como chave PIX'}
          {selectedType === 'cnpj' && 'CNPJ da empresa cadastrado como chave PIX'}
          {selectedType === 'email' && 'E-mail cadastrado no banco como chave PIX'}
          {selectedType === 'random' && 'Chave aleatória gerada pelo seu banco (UUID)'}
        </Text>

        {/* Botão salvar */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={brandingColors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtnGradient}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Salvar Chave PIX</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Remover */}
        {current?.has_pix_key && (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={handleRemove}
            disabled={saving}
            activeOpacity={0.75}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
            <Text style={styles.removeBtnText}>Remover chave PIX</Text>
          </TouchableOpacity>
        )}

        {/* Como funciona */}
        <View style={styles.howCard}>
          <Text style={styles.howTitle}>Como funciona</Text>
          <Text style={styles.howItem}>{'1. Configure sua chave PIX aqui'}</Text>
          <Text style={styles.howItem}>{'2. No checkout, selecione PIX como forma de pagamento'}</Text>
          <Text style={styles.howItem}>{'3. O sistema gera o QR Code automaticamente'}</Text>
          <Text style={styles.howItem}>{'4. O cliente escaneia e paga'}</Text>
          <Text style={styles.howItem}>{'5. Confirme o recebimento manualmente na tela de pagamento'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  infoBanner: {
    flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start',
    borderWidth: 1, borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: theme.fontSize.sm, fontWeight: '700', marginBottom: 4 },
  infoSubtitle: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, lineHeight: 18 },
  currentCard: {
    backgroundColor: Colors.light.successLight, borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: Colors.light.success + '40',
    padding: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  currentLabel: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.success },
  currentKey: { fontSize: theme.fontSize.sm, color: Colors.light.text, fontWeight: '500', marginBottom: 2 },
  currentType: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  sectionLabel: {
    fontSize: theme.fontSize.xxs, fontWeight: '700', color: Colors.light.textTertiary,
    letterSpacing: 0.5, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  typeChip: {
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full, borderWidth: 1,
    borderColor: Colors.light.border, backgroundColor: Colors.light.card,
  },
  typeChipText: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  inputWrapper: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md, height: 52,
    justifyContent: 'center', marginBottom: theme.spacing.xs,
  },
  input: { fontSize: theme.fontSize.base, color: Colors.light.text },
  hint: { fontSize: theme.fontSize.xs, color: Colors.light.textTertiary, marginBottom: theme.spacing.lg },
  saveBtn: { borderRadius: theme.borderRadius.xl, overflow: 'hidden', marginBottom: theme.spacing.sm },
  saveBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: theme.spacing.sm, paddingVertical: 16,
  },
  saveBtnText: { color: '#fff', fontSize: theme.fontSize.base, fontWeight: '700' },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: theme.spacing.md,
  },
  removeBtnText: { color: Colors.light.error, fontSize: theme.fontSize.sm, fontWeight: '600' },
  howCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, marginTop: theme.spacing.lg,
    gap: 6,
  },
  howTitle: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.text, marginBottom: 4 },
  howItem: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, lineHeight: 20 },
});

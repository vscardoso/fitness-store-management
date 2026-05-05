import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  TouchableOpacity, ActivityIndicator, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getStorePIX, updateStorePIX, registerCieloPIXWebhook } from '@/services/storeService';
import type { StorePIXKey } from '@/services/storeService';

const PIX_TYPES = [
  { value: 'cpf',    label: 'CPF',             placeholder: '000.000.000-00' },
  { value: 'cnpj',   label: 'CNPJ',            placeholder: '00.000.000/0000-00' },
  { value: 'email',  label: 'E-mail',          placeholder: 'exemplo@email.com' },
  { value: 'phone',  label: 'Telefone',        placeholder: '+55 11 99999-9999' },
  { value: 'random', label: 'Chave aleatória', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
] as const;

type PIXKeyType = typeof PIX_TYPES[number]['value'];

const PIX_PROVIDERS = [
  {
    value: 'generic',
    label: 'PIX Genérico',
    description: 'Gera QR Code localmente. Confirmação manual.',
    icon: 'qr-code-outline' as const,
  },
  {
    value: 'cielo_pix',
    label: 'Cielo PIX',
    description: 'QR Code via API Cielo. Confirmação automática via webhook.',
    icon: 'flash-outline' as const,
  },
] as const;

type PIXProvider = typeof PIX_PROVIDERS[number]['value'];

type DialogState = {
  visible: boolean;
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};

const DIALOG_HIDDEN: DialogState = { visible: false, type: 'info', title: '', message: '' };

export default function PIXKeyScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [current, setCurrent] = useState<StorePIXKey | null>(null);
  const [selectedType, setSelectedType] = useState<PIXKeyType>('cnpj');
  const [selectedProvider, setSelectedProvider] = useState<PIXProvider>('generic');
  const [keyValue, setKeyValue] = useState('');
  const [dialog, setDialog] = useState<DialogState>(DIALOG_HIDDEN);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      headerAnim.setValue(0);
      contentAnim.setValue(0);
      Animated.parallel([
        Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
        Animated.timing(contentAnim, { toValue: 1, duration: 380, delay: 140, useNativeDriver: true }),
      ]).start();

      getStorePIX()
        .then((data) => {
          setCurrent(data);
          if (data.pix_key_type) setSelectedType(data.pix_key_type as PIXKeyType);
          if (data.pix_key) setKeyValue(data.pix_key);
          if (data.pix_provider === 'cielo_pix') setSelectedProvider('cielo_pix');
          else setSelectedProvider('generic');
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, [])
  );

  const selectedTypeInfo = PIX_TYPES.find(t => t.value === selectedType)!;

  const handleSave = async () => {
    if (!keyValue.trim()) {
      setDialog({
        visible: true, type: 'warning',
        title: 'Campo obrigatório',
        message: 'Informe a chave PIX antes de salvar.',
        confirmText: 'Entendi',
        onConfirm: () => setDialog(DIALOG_HIDDEN),
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateStorePIX({
        pix_key: keyValue.trim(),
        pix_key_type: selectedType,
        pix_provider: selectedProvider,
      });
      setCurrent(updated);
      setDialog({
        visible: true, type: 'success',
        title: 'Salvo!',
        message: selectedProvider === 'cielo_pix'
          ? 'Chave PIX salva com provider Cielo. Agora registre o webhook para receber confirmações automáticas.'
          : 'Chave PIX configurada. O sistema gerará QR Codes automaticamente no checkout.',
        confirmText: 'OK',
        onConfirm: () => setDialog(DIALOG_HIDDEN),
      });
    } catch (e: any) {
      setDialog({
        visible: true, type: 'danger',
        title: 'Erro ao salvar',
        message: e?.response?.data?.detail || 'Não foi possível salvar a chave PIX.',
        confirmText: 'Fechar',
        onConfirm: () => setDialog(DIALOG_HIDDEN),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterWebhook = async () => {
    setRegistering(true);
    try {
      const result = await registerCieloPIXWebhook();
      setDialog({
        visible: true, type: 'success',
        title: 'Webhook registrado!',
        message: `Cielo notificará pagamentos em:\n${result.webhookUrl}`,
        confirmText: 'OK',
        onConfirm: () => setDialog(DIALOG_HIDDEN),
      });
    } catch (e: any) {
      setDialog({
        visible: true, type: 'danger',
        title: 'Erro ao registrar webhook',
        message: e?.response?.data?.detail || 'Verifique as credenciais Cielo PIX no servidor.',
        confirmText: 'Fechar',
        onConfirm: () => setDialog(DIALOG_HIDDEN),
      });
    } finally {
      setRegistering(false);
    }
  };

  const handleRemove = () => {
    setDialog({
      visible: true, type: 'danger',
      title: 'Remover chave PIX',
      message: 'Tem certeza? O sistema voltará ao modo padrão sem geração de QR Code.',
      confirmText: 'Remover',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setDialog(DIALOG_HIDDEN);
        setSaving(true);
        try {
          const updated = await updateStorePIX({ pix_key: null });
          setKeyValue('');
          setCurrent(updated);
          setSelectedProvider('generic');
          setDialog({
            visible: true, type: 'success',
            title: 'Chave removida',
            message: 'A chave PIX foi removida.',
            confirmText: 'OK',
            onConfirm: () => setDialog(DIALOG_HIDDEN),
          });
        } catch (e: any) {
          setDialog({
            visible: true, type: 'danger',
            title: 'Erro',
            message: e?.response?.data?.detail || 'Erro ao remover chave.',
            confirmText: 'Fechar',
            onConfirm: () => setDialog(DIALOG_HIDDEN),
          });
        } finally {
          setSaving(false);
        }
      },
      onCancel: () => setDialog(DIALOG_HIDDEN),
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Chave PIX" subtitle="Pagamentos" showBackButton onBack={() => router.back()} />
        <View style={styles.center}><ActivityIndicator size="large" color={brandingColors.primary} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={{
        opacity: headerAnim,
        transform: [{ scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
      }}>
        <PageHeader
          title="Chave PIX"
          subtitle="Configurar pagamento via QR Code"
          showBackButton
          onBack={() => router.back()}
        />
      </Animated.View>

      <ConfirmDialog
        visible={dialog.visible}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm ?? (() => setDialog(DIALOG_HIDDEN))}
        onCancel={dialog.onCancel ?? (() => setDialog(DIALOG_HIDDEN))}
      />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{
          opacity: contentAnim,
          transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        }}>

          {/* Status atual */}
          {current?.has_pix_key && (
            <View style={[styles.currentCard, {
              backgroundColor: current.pix_provider === 'cielo_pix'
                ? brandingColors.primary + '12'
                : Colors.light.successLight,
              borderColor: current.pix_provider === 'cielo_pix'
                ? brandingColors.primary + '40'
                : Colors.light.success + '40',
            }]}>
              <View style={styles.currentRow}>
                <Ionicons
                  name={current.pix_provider === 'cielo_pix' ? 'flash' : 'checkmark-circle'}
                  size={18}
                  color={current.pix_provider === 'cielo_pix' ? brandingColors.primary : Colors.light.success}
                />
                <Text style={[styles.currentLabel, {
                  color: current.pix_provider === 'cielo_pix' ? brandingColors.primary : Colors.light.success,
                }]}>
                  {current.pix_provider === 'cielo_pix' ? 'Cielo PIX ativo' : 'PIX Genérico ativo'}
                </Text>
              </View>
              <Text style={styles.currentKey} numberOfLines={1}>{current.pix_key}</Text>
              <Text style={styles.currentType}>
                {PIX_TYPES.find(t => t.value === current.pix_key_type)?.label || current.pix_key_type}
              </Text>
            </View>
          )}

          {/* Seletor de provider */}
          <Text style={styles.sectionLabel}>PROVEDOR PIX</Text>
          {PIX_PROVIDERS.map((p) => {
            const active = selectedProvider === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                style={[styles.providerCard, active && {
                  borderColor: brandingColors.primary,
                  backgroundColor: brandingColors.primary + '08',
                }]}
                onPress={() => setSelectedProvider(p.value)}
                activeOpacity={0.75}
              >
                <View style={[styles.providerIcon, active && { backgroundColor: brandingColors.primary + '18' }]}>
                  <Ionicons name={p.icon} size={20} color={active ? brandingColors.primary : Colors.light.textSecondary} />
                </View>
                <View style={styles.providerText}>
                  <Text style={[styles.providerLabel, active && { color: brandingColors.primary }]}>{p.label}</Text>
                  <Text style={styles.providerDesc}>{p.description}</Text>
                </View>
                <View style={[styles.radio, active && { borderColor: brandingColors.primary }]}>
                  {active && <View style={[styles.radioDot, { backgroundColor: brandingColors.primary }]} />}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Tipo de chave */}
          <Text style={styles.sectionLabel}>TIPO DA CHAVE</Text>
          <View style={styles.typeGrid}>
            {PIX_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeChip, selectedType === t.value && {
                  backgroundColor: brandingColors.primary + '15',
                  borderColor: brandingColors.primary,
                }]}
                onPress={() => { setSelectedType(t.value); setKeyValue(''); }}
                activeOpacity={0.75}
              >
                <Text style={[styles.typeChipText, selectedType === t.value && {
                  color: brandingColors.primary, fontWeight: '700',
                }]}>
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
            {selectedType === 'cpf' && 'CPF cadastrado no banco como chave PIX'}
            {selectedType === 'cnpj' && 'CNPJ da empresa cadastrado como chave PIX'}
            {selectedType === 'email' && 'E-mail cadastrado no banco como chave PIX'}
            {selectedType === 'random' && 'Chave aleatória gerada pelo seu banco (UUID)'}
          </Text>

          {/* Botão salvar */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Salvar Chave PIX</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Botão registrar webhook — só aparece quando Cielo PIX está salvo */}
          {current?.pix_provider === 'cielo_pix' && current.has_pix_key && (
            <TouchableOpacity
              style={[styles.webhookBtn, { borderColor: brandingColors.primary }]}
              onPress={handleRegisterWebhook}
              disabled={registering}
              activeOpacity={0.8}
            >
              {registering ? <ActivityIndicator size="small" color={brandingColors.primary} /> : (
                <>
                  <Ionicons name="flash-outline" size={16} color={brandingColors.primary} />
                  <Text style={[styles.webhookBtnText, { color: brandingColors.primary }]}>
                    Registrar Webhook Cielo
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Remover */}
          {current?.has_pix_key && (
            <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} disabled={saving} activeOpacity={0.75}>
              <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
              <Text style={styles.removeBtnText}>Remover chave PIX</Text>
            </TouchableOpacity>
          )}

          {/* Como funciona */}
          <View style={styles.howCard}>
            <Text style={styles.howTitle}>Como funciona</Text>
            {selectedProvider === 'cielo_pix' ? (
              <>
                <Text style={styles.howItem}>{'1. Configure a chave PIX e selecione Cielo PIX'}</Text>
                <Text style={styles.howItem}>{'2. Salve e clique em "Registrar Webhook Cielo"'}</Text>
                <Text style={styles.howItem}>{'3. No checkout, selecione PIX como pagamento'}</Text>
                <Text style={styles.howItem}>{'4. QR Code gerado via API Cielo automaticamente'}</Text>
                <Text style={styles.howItem}>{'5. Pagamento confirmado automaticamente via webhook'}</Text>
              </>
            ) : (
              <>
                <Text style={styles.howItem}>{'1. Configure sua chave PIX aqui'}</Text>
                <Text style={styles.howItem}>{'2. No checkout, selecione PIX como pagamento'}</Text>
                <Text style={styles.howItem}>{'3. QR Code gerado localmente (sem API externa)'}</Text>
                <Text style={styles.howItem}>{'4. Cliente escaneia e paga'}</Text>
                <Text style={styles.howItem}>{'5. Confirme o recebimento manualmente'}</Text>
              </>
            )}
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  currentCard: {
    borderRadius: theme.borderRadius.xl, borderWidth: 1,
    padding: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  currentLabel: { fontSize: theme.fontSize.sm, fontWeight: '700' },
  currentKey: { fontSize: theme.fontSize.sm, color: Colors.light.text, fontWeight: '500', marginBottom: 2 },
  currentType: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  sectionLabel: {
    fontSize: theme.fontSize.xxs, fontWeight: '700', color: Colors.light.textTertiary,
    letterSpacing: 0.5, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md,
  },
  providerCard: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, marginBottom: theme.spacing.sm,
  },
  providerIcon: {
    width: 40, height: 40, borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center', alignItems: 'center',
  },
  providerText: { flex: 1 },
  providerLabel: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.text, marginBottom: 2 },
  providerDesc: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, lineHeight: 16 },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: Colors.light.border, justifyContent: 'center', alignItems: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
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
  webhookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
    borderRadius: theme.borderRadius.xl, borderWidth: 1.5,
    marginBottom: theme.spacing.sm,
  },
  webhookBtnText: { fontSize: theme.fontSize.sm, fontWeight: '700' },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: theme.spacing.md,
  },
  removeBtnText: { color: Colors.light.error, fontSize: theme.fontSize.sm, fontWeight: '600' },
  howCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, marginTop: theme.spacing.lg, gap: 6,
  },
  howTitle: { fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.text, marginBottom: 4 },
  howItem: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, lineHeight: 20 },
});

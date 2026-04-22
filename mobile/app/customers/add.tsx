import { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Text,
  TextInput,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import useBackToList from '@/hooks/useBackToList';
import { useCreateCustomer } from '@/hooks';
import { searchCep } from '@/services/cepService';
import { phoneMask, cpfMask, cepMask, dateMask, isValidDate } from '@/utils/masks';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { CustomerCreate } from '@/types';

export default function AddCustomerScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/customers');
  const createMutation = useCreateCustomer();
  const brandingColors = useBrandingColors();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingCep, setLoadingCep] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCepDialog, setShowCepDialog] = useState(false);
  const headerAnim = useMemo(() => new Animated.Value(0), []);
  const contentAnim = useMemo(() => new Animated.Value(0), []);

  useFocusEffect(
    useMemo(
      () => () => {
        headerAnim.setValue(0);
        contentAnim.setValue(0);

        Animated.spring(headerAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 120,
          mass: 0.9,
        }).start();

        Animated.spring(contentAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 16,
          stiffness: 110,
          mass: 1,
          delay: 140,
        }).start();
      },
      [contentAnim, headerAnim]
    )
  );

  const handleCepChange = async (text: string) => {
    const masked = cepMask(text);
    setZipCode(masked);
    setErrors((prev) => ({ ...prev, zipCode: '' }));

    const cleanCep = masked.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      const cepData = await searchCep(cleanCep);
      setLoadingCep(false);

      if (cepData) {
        setAddress(cepData.logradouro || '');
        setNeighborhood(cepData.bairro || '');
        setCity(cepData.localidade || '');
        setState(cepData.uf || '');
      } else {
        setShowCepDialog(true);
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Nome completo e obrigatorio';
    }
    if (!phone.trim()) {
      newErrors.phone = 'Telefone e obrigatorio';
    } else if (phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Telefone invalido';
    }
    if (email && !email.includes('@')) {
      newErrors.email = 'Email invalido';
    }
    if (cpf && cpf.replace(/\D/g, '').length !== 11) {
      newErrors.cpf = 'CPF invalido';
    }
    if (birthDate && !isValidDate(birthDate)) {
      newErrors.birthDate = 'Data invalida (DD/MM/AAAA)';
    }
    if (zipCode && zipCode.replace(/\D/g, '').length !== 8) {
      newErrors.zipCode = 'CEP invalido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatDateToISO = (date: string): string => {
    const parts = date.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      setErrorMessage('Preencha todos os campos obrigatorios corretamente');
      setShowErrorDialog(true);
      return;
    }

    const customerData: CustomerCreate = {
      full_name: fullName.trim(),
      phone: phone.replace(/\D/g, ''),
      email: email.trim() || undefined,
      document_number: cpf ? cpf.replace(/\D/g, '') : undefined,
      birth_date: birthDate ? formatDateToISO(birthDate) : undefined,
      address: address.trim() || undefined,
      address_number: addressNumber.trim() || undefined,
      neighborhood: neighborhood.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      zip_code: zipCode ? zipCode.replace(/\D/g, '') : undefined,
    };

    createMutation.mutate(customerData, {
      onSuccess: () => setShowSuccessDialog(true),
      onError: (error: any) => {
        const message = error?.response?.data?.detail || error?.message || 'Erro ao cadastrar cliente';
        setErrorMessage(message);
        setShowErrorDialog(true);
      },
    });
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [{ scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }}
      >
        <PageHeader
          title="Novo Cliente"
          subtitle="Cadastre os dados de contato"
          showBackButton
          onBack={goBack}
        />
      </Animated.View>

      <Animated.View
        style={{
          flex: 1,
          opacity: contentAnim,
          transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        }}
      >
        <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.card}>
            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                  <Ionicons name="person-outline" size={20} color={brandingColors.primary} />
                </View>
                <Text style={styles.cardTitle}>Informacoes Basicas</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Nome Completo <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, !!errors.fullName && styles.inputError]}
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    setErrors((prev) => ({ ...prev, fullName: '' }));
                  }}
                  placeholder="Nome completo do cliente"
                  placeholderTextColor={Colors.light.textTertiary}
                  autoCapitalize="words"
                />
                {errors.fullName ? <Text style={styles.fieldError}>{errors.fullName}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Telefone <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, !!errors.phone && styles.inputError]}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(phoneMask(text));
                    setErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="phone-pad"
                />
                {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={[styles.input, !!errors.email && styles.inputError]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  placeholder="email@exemplo.com"
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                  <Ionicons name="card-outline" size={20} color={brandingColors.primary} />
                </View>
                <Text style={styles.cardTitle}>Documentos</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CPF</Text>
                <TextInput
                  style={[styles.input, !!errors.cpf && styles.inputError]}
                  value={cpf}
                  onChangeText={(text) => {
                    setCpf(cpfMask(text));
                    setErrors((prev) => ({ ...prev, cpf: '' }));
                  }}
                  placeholder="000.000.000-00"
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="numeric"
                />
                {errors.cpf ? <Text style={styles.fieldError}>{errors.cpf}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Data de Nascimento</Text>
                <TextInput
                  style={[styles.input, !!errors.birthDate && styles.inputError]}
                  value={birthDate}
                  onChangeText={(text) => {
                    setBirthDate(dateMask(text));
                    setErrors((prev) => ({ ...prev, birthDate: '' }));
                  }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="numeric"
                />
                {errors.birthDate ? <Text style={styles.fieldError}>{errors.birthDate}</Text> : null}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                  <Ionicons name="location-outline" size={20} color={brandingColors.primary} />
                </View>
                <Text style={styles.cardTitle}>Endereco (Opcional)</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CEP</Text>
                <View style={styles.inputWithAddon}>
                  <TextInput
                    style={[styles.input, styles.inputFlex, !!errors.zipCode && styles.inputError]}
                    value={zipCode}
                    onChangeText={handleCepChange}
                    placeholder="00000-000"
                    placeholderTextColor={Colors.light.textTertiary}
                    keyboardType="numeric"
                  />
                  {loadingCep && <ActivityIndicator size="small" color={brandingColors.primary} style={styles.cepSpinner} />}
                </View>
                {errors.zipCode ? <Text style={styles.fieldError}>{errors.zipCode}</Text> : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Endereco</Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Rua, Avenida..."
                  placeholderTextColor={Colors.light.textTertiary}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Numero</Text>
                <TextInput
                  style={styles.input}
                  value={addressNumber}
                  onChangeText={setAddressNumber}
                  placeholder="123"
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Bairro</Text>
                <TextInput
                  style={styles.input}
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  placeholder="Nome do bairro"
                  placeholderTextColor={Colors.light.textTertiary}
                />
              </View>

              <View style={styles.row}>
                <View style={styles.fieldGroupHalf}>
                  <Text style={styles.fieldLabel}>Cidade</Text>
                  <TextInput
                    style={styles.input}
                    value={city}
                    onChangeText={setCity}
                    placeholder="Cidade"
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                </View>

                <View style={styles.fieldGroupHalf}>
                  <Text style={styles.fieldLabel}>Estado</Text>
                  <TextInput
                    style={styles.input}
                    value={state}
                    onChangeText={(text) => setState(text.toUpperCase())}
                    placeholder="UF"
                    placeholderTextColor={Colors.light.textTertiary}
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btnSecondary, createMutation.isPending && { opacity: 0.5 }]}
              onPress={goBack}
              disabled={createMutation.isPending}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-outline" size={18} color={Colors.light.textSecondary} />
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnPrimary, createMutation.isPending && { opacity: 0.65 }]}
              onPress={handleSubmit}
              disabled={createMutation.isPending}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <LinearGradient colors={brandingColors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGradient}>
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Salvar Cliente</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <ConfirmDialog
        visible={showCepDialog}
        title="CEP nao encontrado"
        message="O CEP informado nao foi localizado. Preencha o endereco manualmente."
        confirmText="OK"
        onConfirm={() => setShowCepDialog(false)}
        onCancel={() => setShowCepDialog(false)}
        type="warning"
        icon="location-outline"
      />

      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Cliente cadastrado com sucesso!"
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessDialog(false);
          goBack();
        }}
        onCancel={() => {
          setShowSuccessDialog(false);
          goBack();
        }}
        type="success"
        icon="checkmark-circle"
      />

      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro"
        message={errorMessage}
        confirmText="OK"
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
        icon="alert-circle"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  card: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  cardInner: {
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  cardTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  fieldGroup: {
    marginBottom: theme.spacing.sm,
  },
  fieldGroupHalf: {
    flex: 1,
    marginBottom: theme.spacing.sm,
  },
  fieldLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  required: {
    color: VALUE_COLORS.negative,
    fontWeight: '700',
  },
  fieldError: {
    fontSize: theme.fontSize.xs,
    color: VALUE_COLORS.negative,
    marginTop: 4,
  },
  input: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
  },
  inputError: {
    borderColor: VALUE_COLORS.negative,
  },
  inputWithAddon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  inputFlex: {
    flex: 1,
  },
  cepSpinner: {
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  btnSecondary: {
    flex: 1,
    height: 52,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSecondaryText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  btnPrimary: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  btnGradient: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  btnPrimaryText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
});

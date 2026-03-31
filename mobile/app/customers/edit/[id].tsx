import { useState, useEffect } from 'react';
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
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DetailHeader from '@/components/layout/DetailHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRouter, useLocalSearchParams } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery } from '@tanstack/react-query';
import { useUpdateCustomer } from '@/hooks';
import { getCustomerById } from '@/services/customerService';
import { searchCep } from '@/services/cepService';
import { phoneMask, cpfMask, cepMask, dateMask, isValidDate } from '@/utils/masks';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { CustomerUpdate } from '@/types';

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/customers');
  const updateMutation = useUpdateCustomer();
  const brandingColors = useBrandingColors();

  const customerId = id ? parseInt(id as string) : NaN;
  const isValidId  = !isNaN(customerId) && customerId > 0;

  // ── Estados do formulário ──
  const [fullName,       setFullName]       = useState('');
  const [email,          setEmail]          = useState('');
  const [phone,          setPhone]          = useState('');
  const [cpf,            setCpf]            = useState('');
  const [birthDate,      setBirthDate]      = useState('');
  const [address,        setAddress]        = useState('');
  const [addressNumber,  setAddressNumber]  = useState('');
  const [neighborhood,   setNeighborhood]   = useState('');
  const [city,           setCity]           = useState('');
  const [state,          setState]          = useState('');
  const [zipCode,        setZipCode]        = useState('');

  const [errors,            setErrors]            = useState<Record<string, string>>({});
  const [loadingCep,        setLoadingCep]        = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog,   setShowErrorDialog]   = useState(false);
  const [errorMessage,      setErrorMessage]      = useState('');
  const [showCepDialog,     setShowCepDialog]     = useState(false);

  // ── Query: buscar cliente ──
  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomerById(customerId),
    enabled: isValidId,
  });

  // ── Preencher form com dados do cliente ──
  useEffect(() => {
    if (customer) {
      setFullName(customer.full_name || '');
      setEmail(customer.email || '');
      setPhone(customer.phone ? phoneMask(customer.phone) : '');
      setCpf(customer.document_number ? cpfMask(customer.document_number) : '');
      if (customer.birth_date) {
        const [year, month, day] = customer.birth_date.split('T')[0].split('-');
        setBirthDate(`${day}/${month}/${year}`);
      }
      setAddress(customer.address || '');
      setAddressNumber(customer.address_number || '');
      setNeighborhood(customer.neighborhood || '');
      setCity(customer.city || '');
      setState(customer.state || '');
      setZipCode(customer.zip_code ? cepMask(customer.zip_code) : '');
    }
  }, [customer]);

  // ── CEP auto-fill ──
  const handleCepChange = async (text: string) => {
    const masked = cepMask(text);
    setZipCode(masked);
    setErrors({ ...errors, zipCode: '' });
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

  // ── Validação ──
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim())                              newErrors.fullName  = 'Nome completo é obrigatório';
    if (!phone.trim())                                 newErrors.phone     = 'Telefone é obrigatório';
    else if (phone.replace(/\D/g, '').length < 10)    newErrors.phone     = 'Telefone inválido';
    if (email && !email.includes('@'))                 newErrors.email     = 'Email inválido';
    if (cpf && cpf.replace(/\D/g, '').length !== 11)  newErrors.cpf       = 'CPF inválido';
    if (birthDate && !isValidDate(birthDate))          newErrors.birthDate = 'Data inválida (DD/MM/AAAA)';
    if (zipCode && zipCode.replace(/\D/g, '').length !== 8) newErrors.zipCode = 'CEP inválido';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatDateToISO = (date: string): string => {
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}`;
  };

  // ── Submit ──
  const handleSubmit = () => {
    if (!validateForm()) {
      setErrorMessage('Preencha todos os campos obrigatórios corretamente');
      setShowErrorDialog(true);
      return;
    }
    const customerData: CustomerUpdate = {
      full_name:       fullName.trim(),
      phone:           phone.replace(/\D/g, ''),
      email:           email.trim() || undefined,
      document_number: cpf ? cpf.replace(/\D/g, '') : undefined,
      birth_date:      birthDate ? formatDateToISO(birthDate) : undefined,
      address:         address.trim() || undefined,
      address_number:  addressNumber.trim() || undefined,
      neighborhood:    neighborhood.trim() || undefined,
      city:            city.trim() || undefined,
      state:           state.trim() || undefined,
      zip_code:        zipCode ? zipCode.replace(/\D/g, '') : undefined,
    };
    updateMutation.mutate(
      { id: customerId, data: customerData },
      {
        onSuccess: () => setShowSuccessDialog(true),
        onError: (error: any) => {
          setErrorMessage(error?.response?.data?.detail || error.message || 'Erro ao atualizar cliente');
          setShowErrorDialog(true);
        },
      }
    );
  };

  // ── Estados iniciais ──
  if (!isValidId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={VALUE_COLORS.negative} />
        <Text style={styles.invalidIdTitle}>ID do cliente inválido</Text>
        <Text style={styles.invalidIdSub}>O ID fornecido não é válido</Text>
      </View>
    );
  }

  if (loadingCustomer || !customer) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={brandingColors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  // ── Render ──
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={brandingColors.primary} />

      <DetailHeader
        title=""
        entityName={customer.full_name}
        backRoute="/(tabs)/customers"
        editRoute=""
        onDelete={() => {}}
        badges={[]}
        metrics={[]}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Seção: Informações Básicas ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="person-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Informações Básicas</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nome Completo <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={[styles.input, !!errors.fullName && styles.inputError]}
                value={fullName}
                onChangeText={(text) => { setFullName(text); setErrors({ ...errors, fullName: '' }); }}
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
                onChangeText={(text) => { setPhone(phoneMask(text)); setErrors({ ...errors, phone: '' }); }}
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
                onChangeText={(text) => { setEmail(text); setErrors({ ...errors, email: '' }); }}
                placeholder="email@exemplo.com"
                placeholderTextColor={Colors.light.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
            </View>
          </View>

          {/* ── Seção: Documentos ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="card-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Documentos</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CPF</Text>
              <TextInput
                style={[styles.input, !!errors.cpf && styles.inputError]}
                value={cpf}
                onChangeText={(text) => { setCpf(cpfMask(text)); setErrors({ ...errors, cpf: '' }); }}
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
                onChangeText={(text) => { setBirthDate(dateMask(text)); setErrors({ ...errors, birthDate: '' }); }}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={Colors.light.textTertiary}
                keyboardType="numeric"
              />
              {errors.birthDate ? <Text style={styles.fieldError}>{errors.birthDate}</Text> : null}
            </View>
          </View>

          {/* ── Seção: Endereço ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="location-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Endereço <Text style={styles.optional}>(Opcional)</Text></Text>
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
                {loadingCep && (
                  <ActivityIndicator size="small" color={brandingColors.primary} style={styles.cepSpinner} />
                )}
              </View>
              {errors.zipCode ? <Text style={styles.fieldError}>{errors.zipCode}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Endereço</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Rua, Avenida..."
                placeholderTextColor={Colors.light.textTertiary}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Número</Text>
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

          {/* ── Botões ── */}
          <View style={styles.actions}>
            {/* Cancelar */}
            <TouchableOpacity
              style={[styles.btnSecondary, updateMutation.isPending && { opacity: 0.5 }]}
              onPress={goBack}
              disabled={updateMutation.isPending}
              activeOpacity={0.7}
            >
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>

            {/* Salvar */}
            <TouchableOpacity
              style={[styles.btnPrimary, updateMutation.isPending && { opacity: 0.65 }]}
              onPress={handleSubmit}
              disabled={updateMutation.isPending}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={brandingColors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Salvar</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Diálogo CEP não encontrado */}
      <ConfirmDialog
        visible={showCepDialog}
        title="CEP não encontrado"
        message="O CEP informado não foi localizado. Preencha o endereço manualmente."
        confirmText="OK"
        onConfirm={() => setShowCepDialog(false)}
        onCancel={() => setShowCepDialog(false)}
        type="warning"
        icon="location-outline"
      />

      {/* Diálogo de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Cliente atualizado com sucesso!"
        confirmText="OK"
        onConfirm={() => { setShowSuccessDialog(false); router.replace(`/customers/${customerId}` as any); }}
        onCancel={() => { setShowSuccessDialog(false); router.replace(`/customers/${customerId}` as any); }}
        type="success"
        icon="checkmark-circle"
      />

      {/* Diálogo de Erro */}
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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  invalidIdTitle: {
    marginTop: theme.spacing.md,
    color: VALUE_COLORS.negative,
    textAlign: 'center',
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  invalidIdSub: {
    marginTop: theme.spacing.xs,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    fontSize: theme.fontSize.sm,
  },

  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },

  // ── Seção ──
  section: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  optional: {
    fontSize: theme.fontSize.sm,
    fontWeight: '400',
    color: Colors.light.textTertiary,
  },

  // ── Campo ──
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

  // ── Input ──
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
  inputFlex: {
    flex: 1,
  },
  inputWithAddon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cepSpinner: {
    flexShrink: 0,
  },

  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },

  // ── Botões ──
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
    justifyContent: 'center',
    alignItems: 'center',
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

import { useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRouter } from 'expo-router';
import { useCreateCustomer } from '@/hooks';
import { searchCep } from '@/services/cepService';
import { phoneMask, cpfMask, cepMask, dateMask, isValidDate } from '@/utils/masks';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { CustomerCreate } from '@/types';

export default function AddCustomerScreen() {
  const router = useRouter();
  const createMutation = useCreateCustomer();
  const brandingColors = useBrandingColors();

  // Estados do formulário
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

  // Estados de validação e UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingCep, setLoadingCep] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCepDialog, setShowCepDialog] = useState(false);

  /**
   * Buscar CEP automaticamente
   */
  const handleCepChange = async (text: string) => {
    const masked = cepMask(text);
    setZipCode(masked);
    setErrors({ ...errors, zipCode: '' });

    // Busca automática quando CEP estiver completo
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

  /**
   * Validar formulário
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Nome completo é obrigatório';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Telefone é obrigatório';
    } else if (phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Telefone inválido';
    }

    if (email && !email.includes('@')) {
      newErrors.email = 'Email inválido';
    }

    if (cpf && cpf.replace(/\D/g, '').length !== 11) {
      newErrors.cpf = 'CPF inválido';
    }

    if (birthDate && !isValidDate(birthDate)) {
      newErrors.birthDate = 'Data inválida (DD/MM/AAAA)';
    }

    if (zipCode && zipCode.replace(/\D/g, '').length !== 8) {
      newErrors.zipCode = 'CEP inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };



  /**
   * Submeter formulário
   */
  const handleSubmit = () => {
    if (!validateForm()) {
      setErrorMessage('Preencha todos os campos obrigatórios corretamente');
      setShowErrorDialog(true);
      return;
    }

    const customerData: CustomerCreate = {
      full_name: fullName.trim(),
      phone: phone.replace(/\D/g, ''), // Remove máscara
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
      onSuccess: () => {
        setShowSuccessDialog(true);
      },
      onError: (error: any) => {
        const message = error?.response?.data?.detail || error.message || 'Erro ao cadastrar cliente';
        setErrorMessage(message);
        setShowErrorDialog(true);
      },
    });
  };

  /**
   * Converter DD/MM/AAAA para YYYY-MM-DD
   */
  const formatDateToISO = (date: string): string => {
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}`;
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Novo Cliente"
        subtitle="Cadastre os dados de contato"
        showBackButton
        onBack={() => router.push('/(tabs)/customers')}
      />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Informações básicas */}
        <View style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="person-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações Básicas</Text>
            </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Nome Completo <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[styles.nativeInput, !!errors.fullName && styles.inputError]}
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
              style={[styles.nativeInput, !!errors.phone && styles.inputError]}
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
              style={[styles.nativeInput, !!errors.email && styles.inputError]}
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
        </View>

        {/* Documentos */}
        <View style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="card-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Documentos</Text>
            </View>

          <TextInput
            label="CPF"
            value={cpf}
            onChangeText={(text) => {
              setCpf(cpfMask(text));
              setErrors({ ...errors, cpf: '' });
            }}
            mode="outlined"
            error={!!errors.cpf}
            style={styles.input}
            keyboardType="numeric"
            placeholder="000.000.000-00"
          />
          {errors.cpf ? (
            <HelperText type="error">{errors.cpf}</HelperText>
          ) : null}

          <TextInput
            label="Data de Nascimento"
            value={birthDate}
            onChangeText={(text) => {
              setBirthDate(dateMask(text));
              setErrors({ ...errors, birthDate: '' });
            }}
            mode="outlined"
            error={!!errors.birthDate}
            style={styles.input}
            keyboardType="numeric"
            placeholder="DD/MM/AAAA"
          />
          {errors.birthDate ? (
            <HelperText type="error">{errors.birthDate}</HelperText>
          ) : null}
          </View>
        </View>

        {/* Endereço */}
        <View style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="location-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Endereço (Opcional)</Text>
            </View>

          <TextInput
            label="CEP"
            value={zipCode}
            onChangeText={handleCepChange}
            mode="outlined"
            error={!!errors.zipCode}
            style={styles.input}
            keyboardType="numeric"
            placeholder="00000-000"
            right={loadingCep ? <TextInput.Icon icon={() => <ActivityIndicator size={20} />} /> : undefined}
          />
          {errors.zipCode ? (
            <HelperText type="error">{errors.zipCode}</HelperText>
          ) : null}

          <TextInput
            label="Endereço"
            value={address}
            onChangeText={setAddress}
            mode="outlined"
            style={styles.input}
            placeholder="Rua, Avenida"
          />

          <TextInput
            label="Número"
            value={addressNumber}
            onChangeText={setAddressNumber}
            mode="outlined"
            style={styles.input}
            keyboardType="numeric"
            placeholder="123"
          />

          <TextInput
            label="Bairro"
            value={neighborhood}
            onChangeText={setNeighborhood}
            mode="outlined"
            style={styles.input}
            placeholder="Nome do bairro"
          />

          <View style={styles.row}>
            <View style={styles.inputHalf}>
              <TextInput
                label="Cidade"
                value={city}
                onChangeText={setCity}
                mode="outlined"
                style={styles.input}
              />
            </View>
            <View style={styles.inputHalf}>
              <TextInput
                label="Estado"
                value={state}
                onChangeText={(text) => setState(text.toUpperCase())}
                mode="outlined"
                style={styles.input}
                maxLength={2}
                placeholder="UF"
                autoCapitalize="characters"
              />
            </View>
          </View>
          </View>
        </View>

        {/* Botões de ação */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btnSecondary, createMutation.isPending && { opacity: 0.5 }]}
            onPress={() => router.push('/(tabs)/customers')}
            disabled={createMutation.isPending}
            activeOpacity={0.7}
          >
            <Text style={styles.btnSecondaryText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, createMutation.isPending && { opacity: 0.65 }]}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
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

      {/* Dialog CEP não encontrado */}
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

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Cliente cadastrado com sucesso!"
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.push('/(tabs)/customers');
        }}
        onCancel={() => {
          setShowSuccessDialog(false);
          router.push('/(tabs)/customers');
        }}
        type="success"
        icon="checkmark-circle"
      />

      {/* Dialog de Erro */}
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
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    marginBottom: 16,
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
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
  },
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.background,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inputHalf: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
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

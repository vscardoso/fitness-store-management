import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  ActivityIndicator,
  Text,
  Card,
} from 'react-native-paper';
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
import { Colors, theme } from '@/constants/Colors';
import type { CustomerUpdate } from '@/types';

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/customers');
  const updateMutation = useUpdateCustomer();

  // Validar ID do cliente
  const customerId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(customerId) && customerId > 0;

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

  /**
   * Query: Buscar cliente
   */
  const { data: customer, isLoading: loadingCustomer, error: customerError } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomerById(customerId),
    enabled: isValidId,
  });

  /**
   * Preencher formulário com dados do cliente
   */
  useEffect(() => {
    if (customer) {
      setFullName(customer.full_name || '');
      setEmail(customer.email || '');
      setPhone(customer.phone ? phoneMask(customer.phone) : '');
      setCpf(customer.document_number ? cpfMask(customer.document_number) : '');
      // Formatar data de nascimento de YYYY-MM-DD para DD/MM/YYYY
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
        Alert.alert('Aviso', 'CEP não encontrado');
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

    const customerData: CustomerUpdate = {
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

    updateMutation.mutate(
      { id: customerId, data: customerData },
      {
        onSuccess: () => {
          setShowSuccessDialog(true);
        },
        onError: (error: any) => {
          const message = error?.response?.data?.detail || error.message || 'Erro ao atualizar cliente';
          setErrorMessage(message);
          setShowErrorDialog(true);
        },
      }
    );
  };

  /**
   * Converter DD/MM/AAAA para YYYY-MM-DD
   */
  const formatDateToISO = (date: string): string => {
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}`;
  };

  // Verificar se ID é válido
  if (!isValidId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={Colors.light.error} />
        <Text style={{ marginTop: 16, color: Colors.light.error, textAlign: 'center', fontSize: 16 }}>
          ID do cliente inválido
        </Text>
        <Text style={{ marginTop: 8, color: '#666', textAlign: 'center' }}>
          O ID fornecido não é válido
        </Text>
      </View>
    );
  }

  if (loadingCustomer || !customer) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      {customer && (
        <DetailHeader
          title="Editar Cliente"
          entityName={customer.full_name}
          backRoute="/(tabs)/customers"
          editRoute=""
          onDelete={() => {}}
          badges={[]}
          metrics={[]}
        />
      )}

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Informações básicas */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="person-outline" size={20} color={Colors.light.primary} />
                </View>
                <Text style={styles.cardTitle}>Informações Básicas</Text>
              </View>

            <TextInput
              label="Nome Completo *"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);
                setErrors({ ...errors, fullName: '' });
              }}
              mode="outlined"
              error={!!errors.fullName}
              style={styles.input}
              autoCapitalize="words"
            />
            {errors.fullName ? (
              <HelperText type="error">{errors.fullName}</HelperText>
            ) : null}

            <TextInput
              label="Telefone *"
              value={phone}
              onChangeText={(text) => {
                setPhone(phoneMask(text));
                setErrors({ ...errors, phone: '' });
              }}
              mode="outlined"
              error={!!errors.phone}
              style={styles.input}
              keyboardType="phone-pad"
              placeholder="(00) 00000-0000"
            />
            {errors.phone ? (
              <HelperText type="error">{errors.phone}</HelperText>
            ) : null}

            <TextInput
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setErrors({ ...errors, email: '' });
              }}
              mode="outlined"
              error={!!errors.email}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email ? (
              <HelperText type="error">{errors.email}</HelperText>
            ) : null}
            </Card.Content>
          </Card>

          {/* Documentos */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="card-outline" size={20} color={Colors.light.primary} />
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
            </Card.Content>
          </Card>

          {/* Endereço */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="location-outline" size={20} color={Colors.light.primary} />
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
            </Card.Content>
          </Card>

          {/* Botões */}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={goBack}
              style={styles.button}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={handleSubmit}
              style={[styles.button, styles.buttonPrimary]}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              Salvar
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message="Cliente atualizado com sucesso!"
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.replace(`/customers/${customerId}` as any);
        }}
        onCancel={() => {
          setShowSuccessDialog(false);
          router.replace(`/customers/${customerId}` as any);
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.light.icon,
  },
  headerGradient: {
    paddingTop: 0, // SafeArea já cuidou do espaço
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  headerContent: {
    marginTop: theme.spacing.sm, // Pequeno espaço após SafeArea
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: '#fff',
    marginHorizontal: theme.spacing.sm,
  },
  headerActions: {
    width: 40, // Placeholder para botões de ação
  },
  headerInfo: {
    alignItems: 'center',
  },
  headerEntityName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    maxWidth: '85%',
    lineHeight: 20,
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
    backgroundColor: Colors.light.primary + '15',
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
    color: Colors.light.primary,
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
  button: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: Colors.light.primary,
  },
});

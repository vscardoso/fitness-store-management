import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  ActivityIndicator,
  Text,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCustomer } from '@/services/customerService';
import { searchCep } from '@/services/cepService';
import { phoneMask, cpfMask, cepMask, dateMask } from '@/utils/masks';
import { Colors, theme } from '@/constants/Colors';
import type { CustomerCreate } from '@/types';

export default function AddCustomerScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/customers');
  const queryClient = useQueryClient();

  // Estados do formulário
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Estados de validação e UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingCep, setLoadingCep] = useState(false);

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

    if (birthDate && birthDate.replace(/\D/g, '').length !== 8) {
      newErrors.birthDate = 'Data inválida (DD/MM/AAAA)';
    }

    if (zipCode && zipCode.replace(/\D/g, '').length !== 8) {
      newErrors.zipCode = 'CEP inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Mutation: Criar cliente
   */
  const createMutation = useMutation({
    mutationFn: (customerData: CustomerCreate) => createCustomer(customerData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      Alert.alert('Sucesso!', 'Cliente cadastrado com sucesso', [
        {
          text: 'OK',
          onPress: () => goBack(),
        },
      ]);
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || error.message || 'Erro ao cadastrar cliente';
      Alert.alert('Erro', errorMessage);
    },
  });

  /**
   * Submeter formulário
   */
  const handleSubmit = () => {
    if (!validateForm()) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios corretamente');
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
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      zip_code: zipCode ? zipCode.replace(/\D/g, '') : undefined,
    };

    createMutation.mutate(customerData);
  };

  /**
   * Converter DD/MM/AAAA para YYYY-MM-DD
   */
  const formatDateToISO = (date: string): string => {
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header com gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, '#7c4dff']}
        style={styles.headerGradient}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/customers')}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <Text variant="headlineSmall" style={styles.headerTitle}>
            Novo Cliente
          </Text>

          <View style={styles.headerPlaceholder} />
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.headerSubtitle}>
            Preencha os dados abaixo para cadastrar um novo cliente
          </Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Informações básicas */}
        <View style={styles.section}>
          <HelperText type="info" style={styles.sectionTitle}>
            Informações Básicas
          </HelperText>

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
        </View>

        {/* Documentos */}
        <View style={styles.section}>
          <HelperText type="info" style={styles.sectionTitle}>
            Documentos
          </HelperText>

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

        {/* Endereço */}
        <View style={styles.section}>
          <HelperText type="info" style={styles.sectionTitle}>
            Endereço (Opcional)
          </HelperText>

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

        {/* Botões */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={goBack}
            style={styles.button}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            style={[styles.button, styles.buttonPrimary]}
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
          >
            Cadastrar
          </Button>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  // Header styles
  headerGradient: {
    paddingTop: 0,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  headerContent: {
    marginTop: theme.spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontWeight: theme.fontWeight.bold,
    textAlign: 'center',
    flex: 1,
    fontSize: theme.fontSize.xl,
  },
  headerPlaceholder: {
    width: 40,
  },
  headerInfo: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    maxWidth: '90%',
    alignSelf: 'center',
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: theme.fontSize.md,
    opacity: 0.95,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: theme.fontWeight.regular,
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
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

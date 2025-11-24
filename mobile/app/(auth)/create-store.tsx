import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  HelperText,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as authService from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { clearAuthData } from '@/services/storage';
// import * as Sentry from 'sentry-expo'; // TEMP: Desabilitado
import type { SignupData } from '@/types';
import { Colors } from '@/constants/Colors';

interface StoreForm {
  storeName: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface FormErrors {
  storeName?: string;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export default function CreateStoreScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();
  const { setUser } = useAuthStore();
  
  const [loading, setLoading] = useState(false);
  const [searchingCEP, setSearchingCEP] = useState(false);

  const [form, setForm] = useState<StoreForm>({
    storeName: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const searchCEP = async (rawCep?: string) => {
    const input = (rawCep ?? form.cep).replace(/\D/g, '');

    // Validação inicial
    if (input.length === 0) {
      setErrors(prev => ({ ...prev, cep: 'Informe o CEP' }));
      return;
    }
    if (input.length < 8) {
      setErrors(prev => ({ ...prev, cep: 'CEP deve ter 8 dígitos' }));
      return;
    }

    setSearchingCEP(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${input}/json/`);
      if (!response.ok) {
        setErrors(prev => ({ ...prev, cep: 'Falha na consulta do CEP' }));
        return;
      }
      const data: ViaCEPResponse = await response.json();

      if (data.erro) {
        setErrors(prev => ({ ...prev, cep: 'CEP não encontrado' }));
        return;
      }

      setForm(prev => ({
        ...prev,
        cep: input,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
        complement: data.complemento || prev.complement,
      }));

      // Limpar erros dos campos preenchidos
      setErrors(prev => ({
        ...prev,
        cep: undefined,
        street: undefined,
        neighborhood: undefined,
        city: undefined,
        state: undefined,
      }));
    } catch (error) {
      setErrors(prev => ({ ...prev, cep: 'Erro ao buscar CEP' }));
    } finally {
      setSearchingCEP(false);
    }
  };

  const formatCEP = (text: string) => {
    const clean = text.replace(/\D/g, '');
    if (clean.length <= 5) {
      return clean;
    }
    return `${clean.slice(0, 5)}-${clean.slice(5, 8)}`;
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Nome da loja
    if (!form.storeName.trim()) {
      newErrors.storeName = 'Nome da loja é obrigatório';
    } else if (form.storeName.trim().length < 3) {
      newErrors.storeName = 'Nome deve ter pelo menos 3 caracteres';
    }

    // CEP
    const cleanCEP = form.cep.replace(/\D/g, '');
    if (!cleanCEP) {
      newErrors.cep = 'CEP é obrigatório';
    } else if (cleanCEP.length !== 8) {
      newErrors.cep = 'CEP inválido';
    }

    // Endereço
    if (!form.street.trim()) {
      newErrors.street = 'Rua é obrigatória';
    }

    if (!form.number.trim()) {
      newErrors.number = 'Número é obrigatório';
    }

    if (!form.neighborhood.trim()) {
      newErrors.neighborhood = 'Bairro é obrigatório';
    }

    if (!form.city.trim()) {
      newErrors.city = 'Cidade é obrigatória';
    }

    if (!form.state.trim()) {
      newErrors.state = 'Estado é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateStore = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // Recuperar dados do usuário dos parâmetros
      const userDataString = params.userData as string;
      if (!userDataString) {
        throw new Error('Dados do usuário não encontrados');
      }
      
      const userData = JSON.parse(userDataString);
      
      // Combinar dados do usuário com dados da loja
      const signupData: SignupData = {
        // Dados do usuário
        full_name: userData.full_name,
        email: userData.email,
        password: userData.password,
        phone: userData.phone,
        
        // Dados da loja
        store_name: form.storeName.trim(),
        plan: 'trial', // Default trial plan
        
        // Dados de endereço
        zip_code: form.cep.replace(/\D/g, ''),
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim() || undefined,
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
      };
      
      // Realizar signup completo
      const user = await authService.signup(signupData);
      
      // Atualizar store com usuário
      setUser(user);
      
      // TEMP: Sentry desabilitado
      // Sentry.Native.setUser({
      //   id: user.id.toString(),
      //   email: user.email,
      //   username: user.full_name,
      // });
      // Sentry.Native.setTag('user_role', user.role);
      
      // Navegar para dashboard
      router.replace('/(tabs)');
      
    } catch (error) {
      console.error('Create store error:', error);
      
      // TEMP: Sentry desabilitado
      // Sentry.Native.captureException(error);
      
      // Extrair mensagem de erro
      let errorMessage = 'Não foi possível criar sua conta. Tente novamente.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erro no Cadastro', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Simple Header - no gradients */}
          <View style={styles.header}>
            <Text variant="headlineMedium" style={styles.headerTitle}>
              Fitness Store
            </Text>
            <Text variant="bodyMedium" style={styles.headerSubtitle}>
              Configure sua loja em minutos
            </Text>
          </View>

          {/* DEV: Botão cache (destaque) */}
          {__DEV__ && (
            <View style={styles.devContainer}>
              <Button
                mode="contained"
                icon="broom"
                buttonColor="#ff5722"
                textColor="#fff"
                onPress={async () => {
                  await clearAuthData();
                  Alert.alert('✅ Cache Limpo', 'AsyncStorage foi limpo. Tente fazer signup novamente.');
                }}
                style={styles.devButton}
              >
                🧹 Limpar Cache (DEV)
              </Button>
              <Text style={styles.devHint}>Use se estiver vendo erro "Já autenticado"</Text>
            </View>
          )}

          <View style={styles.formCard}>
            <Text variant="headlineMedium" style={styles.formTitle}>
              Dados da Loja
            </Text>

          <View style={styles.form}>
            {/* Nome da Loja */}
            <TextInput
              label="Nome da Loja *"
              value={form.storeName}
              onChangeText={(text) => {
                setForm({ ...form, storeName: text });
                if (errors.storeName) setErrors({ ...errors, storeName: undefined });
              }}
              mode="outlined"
              error={!!errors.storeName}
              autoCapitalize="words"
              style={styles.input}
            />
            {errors.storeName && (
              <HelperText type="error" visible={!!errors.storeName}>
                {errors.storeName}
              </HelperText>
            )}

            {/* CEP */}
            <View>
              <TextInput
                label="CEP *"
                value={formatCEP(form.cep)}
                onChangeText={(text) => {
                  const clean = text.replace(/\D/g, '');
                  setForm({ ...form, cep: clean });
                  if (errors.cep) setErrors({ ...errors, cep: undefined });
                  
                  // Buscar automaticamente quando CEP estiver completo
                  if (clean.length === 8) {
                    // Busca automática ao completar 8 dígitos
                    searchCEP(clean);
                  }
                }}
                mode="outlined"
                error={!!errors.cep}
                keyboardType="numeric"
                placeholder="12345-678"
                maxLength={9}
                right={
                  <TextInput.Icon
                    icon={searchingCEP ? 'progress-download' : 'magnify'}
                    onPress={() => !searchingCEP && searchCEP(form.cep)}
                  />
                }
                style={styles.input}
              />
              {errors.cep && (
                <HelperText type="error" visible={!!errors.cep}>
                  {errors.cep}
                </HelperText>
              )}
            </View>

            {/* Rua */}
            <TextInput
              label="Rua *"
              value={form.street}
              onChangeText={(text) => {
                setForm({ ...form, street: text });
                if (errors.street) setErrors({ ...errors, street: undefined });
              }}
              mode="outlined"
              error={!!errors.street}
              editable={!searchingCEP}
              style={styles.input}
            />
            {errors.street && (
              <HelperText type="error" visible={!!errors.street}>
                {errors.street}
              </HelperText>
            )}

            {/* Número e Complemento */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <TextInput
                  label="Número *"
                  value={form.number}
                  onChangeText={(text) => {
                    setForm({ ...form, number: text });
                    if (errors.number) setErrors({ ...errors, number: undefined });
                  }}
                  mode="outlined"
                  error={!!errors.number}
                  keyboardType="numeric"
                />
                {errors.number && (
                  <HelperText type="error" visible={!!errors.number}>
                    {errors.number}
                  </HelperText>
                )}
              </View>

              <View style={styles.halfInput}>
                <TextInput
                  label="Complemento"
                  value={form.complement}
                  onChangeText={(text) => setForm({ ...form, complement: text })}
                  mode="outlined"
                />
              </View>
            </View>

            {/* Bairro */}
            <TextInput
              label="Bairro *"
              value={form.neighborhood}
              onChangeText={(text) => {
                setForm({ ...form, neighborhood: text });
                if (errors.neighborhood) setErrors({ ...errors, neighborhood: undefined });
              }}
              mode="outlined"
              error={!!errors.neighborhood}
              editable={!searchingCEP}
              style={styles.input}
            />
            {errors.neighborhood && (
              <HelperText type="error" visible={!!errors.neighborhood}>
                {errors.neighborhood}
              </HelperText>
            )}

            {/* Cidade e Estado */}
            <View style={styles.row}>
              <View style={[styles.halfInput, { flex: 2 }]}>
                <TextInput
                  label="Cidade *"
                  value={form.city}
                  onChangeText={(text) => {
                    setForm({ ...form, city: text });
                    if (errors.city) setErrors({ ...errors, city: undefined });
                  }}
                  mode="outlined"
                  error={!!errors.city}
                  editable={!searchingCEP}
                />
                {errors.city && (
                  <HelperText type="error" visible={!!errors.city}>
                    {errors.city}
                  </HelperText>
                )}
              </View>

              <View style={[styles.halfInput, { flex: 1 }]}>
                <TextInput
                  label="UF *"
                  value={form.state}
                  onChangeText={(text) => {
                    setForm({ ...form, state: text.toUpperCase() });
                    if (errors.state) setErrors({ ...errors, state: undefined });
                  }}
                  mode="outlined"
                  error={!!errors.state}
                  maxLength={2}
                  autoCapitalize="characters"
                  editable={!searchingCEP}
                />
                {errors.state && (
                  <HelperText type="error" visible={!!errors.state}>
                    {errors.state}
                  </HelperText>
                )}
              </View>
            </View>

            {/* Botão Criar Loja */}
            <Button
              mode="contained"
              onPress={handleCreateStore}
              loading={loading}
              disabled={loading || searchingCEP}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Criar Minha Loja
            </Button>
          </View>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: Colors.light.primary,
    padding: 16,
    marginBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  devContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ff5722',
    alignItems: 'center',
  },
  devButton: {
    width: '100%',
    marginBottom: 8,
  },
  devHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  formTitle: {
    fontWeight: '600',
    color: Colors.light.primary,
    marginBottom: 16,
  },
  form: {
    gap: 4,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  halfInput: {
    flex: 1,
  },
  button: {
    marginTop: 16,
    backgroundColor: Colors.light.primary,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});

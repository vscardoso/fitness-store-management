import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TextInput, HelperText, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AppButton from '@/components/ui/AppButton';
import * as authService from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { useBrandingStore, useBrandingColors } from '@/store/brandingStore';
import type { SignupData } from '@/types';
import { Colors, PRESET_THEMES, theme } from '@/constants/Colors';

type BrandingPreset = (typeof PRESET_THEMES)[number];

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

const PREFERENCE_KEYS_TO_RESET = [
  'store-branding',
  'ui-storage',
  '@fitness_store:onboarding_completed',
];

export default function CreateStoreScreen() {
  const params = useLocalSearchParams();
  const { setUser } = useAuthStore();
  const brandingColors = useBrandingColors();

  const [loading, setLoading] = useState(false);
  const [searchingCEP, setSearchingCEP] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<BrandingPreset>(PRESET_THEMES[0]);
  const [logoUri, setLogoUri] = useState<string | null>(null);

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

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled) {
      setLogoUri(result.assets[0].uri);
    }
  };

  const searchCEP = async (rawCep?: string) => {
    const input = (rawCep ?? form.cep).replace(/\D/g, '');

    if (input.length === 0) {
      setErrors((prev) => ({ ...prev, cep: 'Informe o CEP' }));
      return;
    }
    if (input.length < 8) {
      setErrors((prev) => ({ ...prev, cep: 'CEP deve ter 8 dígitos' }));
      return;
    }

    setSearchingCEP(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${input}/json/`);
      if (!response.ok) {
        setErrors((prev) => ({ ...prev, cep: 'Falha na consulta do CEP' }));
        return;
      }

      const data: ViaCEPResponse = await response.json();
      if (data.erro) {
        setErrors((prev) => ({ ...prev, cep: 'CEP não encontrado' }));
        return;
      }

      setForm((prev) => ({
        ...prev,
        cep: input,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
        complement: data.complemento || prev.complement,
      }));

      setErrors((prev) => ({
        ...prev,
        cep: undefined,
        street: undefined,
        neighborhood: undefined,
        city: undefined,
        state: undefined,
      }));
    } catch {
      setErrors((prev) => ({ ...prev, cep: 'Erro ao buscar CEP' }));
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

    if (!form.storeName.trim()) {
      newErrors.storeName = 'Nome da loja é obrigatório';
    } else if (form.storeName.trim().length < 3) {
      newErrors.storeName = 'Nome deve ter pelo menos 3 caracteres';
    }

    const cleanCEP = form.cep.replace(/\D/g, '');
    if (!cleanCEP) {
      newErrors.cep = 'CEP é obrigatório';
    } else if (cleanCEP.length !== 8) {
      newErrors.cep = 'CEP inválido';
    }

    if (!form.street.trim()) newErrors.street = 'Rua é obrigatória';
    if (!form.number.trim()) newErrors.number = 'Número é obrigatório';
    if (!form.neighborhood.trim()) newErrors.neighborhood = 'Bairro é obrigatório';
    if (!form.city.trim()) newErrors.city = 'Cidade é obrigatória';
    if (!form.state.trim()) newErrors.state = 'Estado é obrigatório';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateStore = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await AsyncStorage.multiRemove(PREFERENCE_KEYS_TO_RESET);
      useBrandingStore.getState().resetToDefault();

      const userDataString = params.userData as string;
      if (!userDataString) {
        throw new Error('Dados do usuário não encontrados');
      }

      const userData = JSON.parse(userDataString);

      const signupData: SignupData = {
        full_name: userData.full_name,
        email: userData.email,
        password: userData.password,
        phone: userData.phone,
        store_name: form.storeName.trim(),
        primary_color: selectedPreset.primary,
        secondary_color: selectedPreset.secondary,
        accent_color: selectedPreset.accent,
        plan: 'trial',
        zip_code: form.cep.replace(/\D/g, ''),
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim() || undefined,
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
      };

      // Aplica branding local imediatamente para garantir persistencia visual.
      useBrandingStore.getState().setBranding({
        name: form.storeName.trim(),
        primaryColor: selectedPreset.primary,
        secondaryColor: selectedPreset.secondary,
        accentColor: selectedPreset.accent,
        ...(logoUri ? { logoUri } : {}),
      });

      const user = await authService.signup(signupData);
      setUser(user);

      try {
        const brandingStore = useBrandingStore.getState();

        await brandingStore.saveToServer({
          name: form.storeName.trim(),
          primary_color: selectedPreset.primary,
          secondary_color: selectedPreset.secondary,
          accent_color: selectedPreset.accent,
        });

        if (logoUri) {
          setUploadingLogo(true);
          await brandingStore.uploadLogoToServer(logoUri);
        }

        await brandingStore.fetchFromServer();
      } catch (brandingError) {
        // Branding é cosmético — falha silenciosa, usuário pode ajustar em Configurações
        console.warn('Branding apply warning:', brandingError);
      } finally {
        setUploadingLogo(false);
      }

      router.replace('/(tabs)');
    } catch (error) {
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
    <LinearGradient
      colors={[brandingColors.primary, brandingColors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="business-outline" size={24} color="#fff" />
              </View>
              <Text variant="headlineMedium" style={styles.headerTitle}>
                Configure Sua Loja
              </Text>
              <Text variant="bodyMedium" style={styles.headerSubtitle}>
                Endereço, identidade visual e preferências iniciais
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text variant="titleLarge" style={styles.formTitle}>
                Dados da Loja
              </Text>
              <Text style={styles.sectionHint}>Essas informações aparecem no perfil da sua loja.</Text>

              <View style={styles.form}>
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
                {errors.storeName ? <HelperText type="error">{errors.storeName}</HelperText> : null}

                <View style={styles.identitySection}>
                  <Text style={styles.identityTitle}>Identidade da Loja</Text>

                  <TouchableOpacity style={styles.logoPicker} onPress={pickLogo} activeOpacity={0.82}>
                    {uploadingLogo ? (
                      <View style={[styles.logoPlaceholder, { backgroundColor: selectedPreset.primary + '22' }]}>
                        <ActivityIndicator color={selectedPreset.primary} />
                      </View>
                    ) : logoUri ? (
                      <Image source={{ uri: logoUri }} style={styles.logoImage} />
                    ) : (
                      <View style={[styles.logoPlaceholder, { backgroundColor: selectedPreset.primary + '22' }]}>
                        <Ionicons name="camera-outline" size={24} color={selectedPreset.primary} />
                      </View>
                    )}
                    <Text style={styles.logoPickerText}>{logoUri ? 'Trocar logo' : 'Adicionar logo (opcional)'}</Text>
                  </TouchableOpacity>

                  <Text style={styles.paletteLabel}>Escolha a paleta inicial</Text>
                  <View style={styles.presetsWrap}>
                    {PRESET_THEMES.map((preset) => {
                      const active = selectedPreset.name === preset.name;
                      return (
                        <TouchableOpacity
                          key={preset.name}
                          style={[styles.presetChip, active && styles.presetChipActive]}
                          onPress={() => setSelectedPreset(preset)}
                          activeOpacity={0.82}
                        >
                          <View style={styles.presetDots}>
                            <View style={[styles.presetDot, { backgroundColor: preset.primary }]} />
                            <View style={[styles.presetDot, { backgroundColor: preset.secondary }]} />
                            <View style={[styles.presetDot, { backgroundColor: preset.accent }]} />
                          </View>
                          <Text style={[styles.presetName, active && { color: selectedPreset.primary }]}>{preset.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TextInput
                  label="CEP *"
                  value={formatCEP(form.cep)}
                  onChangeText={(text) => {
                    const clean = text.replace(/\D/g, '');
                    setForm({ ...form, cep: clean });
                    if (errors.cep) setErrors({ ...errors, cep: undefined });
                    if (clean.length === 8) {
                      void searchCEP(clean);
                    }
                  }}
                  mode="outlined"
                  error={!!errors.cep}
                  keyboardType="numeric"
                  placeholder="12345-678"
                  maxLength={9}
                  right={<TextInput.Icon icon={searchingCEP ? 'progress-download' : 'magnify'} onPress={() => !searchingCEP && searchCEP(form.cep)} />}
                  style={styles.input}
                />
                {errors.cep ? <HelperText type="error">{errors.cep}</HelperText> : null}

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
                {errors.street ? <HelperText type="error">{errors.street}</HelperText> : null}

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
                    {errors.number ? <HelperText type="error">{errors.number}</HelperText> : null}
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
                {errors.neighborhood ? <HelperText type="error">{errors.neighborhood}</HelperText> : null}

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
                    {errors.city ? <HelperText type="error">{errors.city}</HelperText> : null}
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
                    {errors.state ? <HelperText type="error">{errors.state}</HelperText> : null}
                  </View>
                </View>

                <AppButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  icon="checkmark-circle-outline"
                  label={loading ? 'Criando Loja...' : 'Criar Minha Loja'}
                  onPress={handleCreateStore}
                  loading={loading}
                  disabled={loading || searchingCEP || uploadingLogo}
                  style={styles.primaryButton}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  headerIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  formTitle: {
    fontWeight: '800',
    color: Colors.light.primary,
    marginBottom: 4,
  },
  sectionHint: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.md,
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
  identitySection: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  identityTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logoPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 4,
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.lg,
  },
  logoPickerText: {
    color: Colors.light.text,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  paletteLabel: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    marginTop: 4,
  },
  presetsWrap: {
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 10,
  },
  presetChipActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primaryLight,
  },
  presetDots: {
    flexDirection: 'row',
    gap: 4,
  },
  presetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  presetName: {
    flex: 1,
    color: Colors.light.text,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  primaryButton: {
    marginTop: theme.spacing.md,
  },
});

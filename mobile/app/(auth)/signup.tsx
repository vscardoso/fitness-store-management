import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  HelperText,
  ProgressBar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingStore, useBrandingColors } from '@/store/brandingStore';

interface SignupForm {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  phone?: string;
}

export default function SignupScreen() {
  const { fetchFromServer } = useBrandingStore();
  const brandingColors = useBrandingColors();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [form, setForm] = useState<SignupForm>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchFromServer().catch(() => {});
  }, []);

  // Calcular força da senha em tempo real
  const passwordStrength = useMemo(() => {
    if (!form.password) return { score: 0, label: '', color: '#ccc' };
    
    let score = 0;
    if (form.password.length >= 8) score++;
    if (form.password.length >= 12) score++;
    if (/[A-Z]/.test(form.password)) score++;
    if (/[a-z]/.test(form.password)) score++;
    if (/[0-9]/.test(form.password)) score++;
    if (/[^A-Za-z0-9]/.test(form.password)) score++;

    if (score <= 2) return { score: score / 6, label: 'Fraca', color: '#f44336' };
    if (score <= 4) return { score: score / 6, label: 'Média', color: '#ff9800' };
    return { score: score / 6, label: 'Forte', color: '#4caf50' };
  }, [form.password]);

  const validateField = (field: keyof SignupForm, value: string) => {
    const newErrors = { ...errors };
    
    switch (field) {
      case 'fullName':
        if (!value.trim()) newErrors.fullName = 'Nome é obrigatório';
        else if (value.trim().length < 3) newErrors.fullName = 'Mínimo 3 caracteres';
        else delete newErrors.fullName;
        break;
      
      case 'email':
        if (!value.trim()) newErrors.email = 'Email é obrigatório';
        else if (!/\S+@\S+\.\S+/.test(value)) newErrors.email = 'Email inválido';
        else delete newErrors.email;
        break;
      
      case 'password':
        if (!value) newErrors.password = 'Senha é obrigatória';
        else if (value.length < 8) newErrors.password = 'Mínimo 8 caracteres';
        else if (!/[A-Z]/.test(value)) newErrors.password = 'Precisa de maiúscula';
        else if (!/[a-z]/.test(value)) newErrors.password = 'Precisa de minúscula';
        else if (!/[0-9]/.test(value)) newErrors.password = 'Precisa de número';
        else delete newErrors.password;
        break;
      
      case 'confirmPassword':
        if (!value) newErrors.confirmPassword = 'Confirme a senha';
        else if (value !== form.password) newErrors.confirmPassword = 'Senhas não coincidem';
        else delete newErrors.confirmPassword;
        break;
      
      case 'phone':
        if (value && value.replace(/\D/g, '').length < 10) newErrors.phone = 'Telefone inválido';
        else delete newErrors.phone;
        break;
    }
    
    setErrors(newErrors);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Nome completo
    if (!form.fullName.trim()) {
      newErrors.fullName = 'Nome completo é obrigatório';
    } else if (form.fullName.trim().length < 3) {
      newErrors.fullName = 'Nome deve ter pelo menos 3 caracteres';
    }

    // Email
    if (!form.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = 'Email inválido';
    }

    // Senha
    if (!form.password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (form.password.length < 8) {
      newErrors.password = 'Senha deve ter pelo menos 8 caracteres';
    } else if (!/[A-Z]/.test(form.password)) {
      newErrors.password = 'Senha deve conter pelo menos uma letra maiúscula';
    } else if (!/[a-z]/.test(form.password)) {
      newErrors.password = 'Senha deve conter pelo menos uma letra minúscula';
    } else if (!/[0-9]/.test(form.password)) {
      newErrors.password = 'Senha deve conter pelo menos um número';
    }

    // Confirmar senha
    if (!form.confirmPassword) {
      newErrors.confirmPassword = 'Confirme sua senha';
    } else if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'As senhas não coincidem';
    }

    // Telefone (opcional, mas se preenchido deve ser válido)
    if (form.phone && form.phone.length < 10) {
      newErrors.phone = 'Telefone inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // Navegar para tela de criação da loja, passando dados do usuário
      router.push({
        pathname: '/(auth)/create-store',
        params: {
          userData: JSON.stringify({
            full_name: form.fullName.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            phone: form.phone.trim() || undefined,
          })
        }
      });
    } catch (error) {
      console.error('Signup error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao processar dados';
      setErrors({ ...errors, email: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleLoginRedirect = () => {
    router.replace('/(auth)/login');
  };

  return (
    <LinearGradient
      colors={[brandingColors.primary, brandingColors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="person-add" size={24} color="#fff" />
            </View>
            <Text variant="headlineMedium" style={styles.headerTitle}>
              Criar Conta
            </Text>
            <Text variant="bodyMedium" style={styles.headerSubtitle}>
              Preencha seus dados para configurar sua loja
            </Text>
          </View>

          <View style={styles.formContainer}>
            <Text variant="titleLarge" style={styles.formTitle}>
              Seus Dados
            </Text>

            <Text style={styles.formSubtitle}>
              Esses dados serão usados para acessar e administrar o sistema.
            </Text>

          <View style={styles.form}>
            {/* Nome Completo */}
            <TextInput
              label="Nome Completo"
              value={form.fullName}
              onChangeText={(text) => {
                setForm({ ...form, fullName: text });
                validateField('fullName', text);
              }}
              onBlur={() => setTouched({ ...touched, fullName: true })}
              mode="outlined"
              error={touched.fullName && !!errors.fullName}
              autoCapitalize="words"
              left={<TextInput.Icon icon="account" />}
              style={styles.input}
              outlineColor={Colors.light.border}
              activeOutlineColor={brandingColors.primary}
            />
            {touched.fullName && errors.fullName && (
              <HelperText type="error" visible={!!errors.fullName}>
                {errors.fullName}
              </HelperText>
            )}
            {touched.fullName && !errors.fullName && form.fullName && (
              <HelperText type="info" visible style={styles.successText}>
                ✓ Nome válido
              </HelperText>
            )}

            {/* Email */}
            <TextInput
              label="Email"
              value={form.email}
              onChangeText={(text) => {
                setForm({ ...form, email: text });
                validateField('email', text);
              }}
              onBlur={() => setTouched({ ...touched, email: true })}
              mode="outlined"
              error={touched.email && !!errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              left={<TextInput.Icon icon="email" />}
              style={styles.input}
              outlineColor={Colors.light.border}
              activeOutlineColor={brandingColors.primary}
            />
            {touched.email && errors.email && (
              <HelperText type="error" visible={!!errors.email}>
                {errors.email}
              </HelperText>
            )}
            {touched.email && !errors.email && form.email && (
              <HelperText type="info" visible style={styles.successText}>
                ✓ Email válido
              </HelperText>
            )}

            {/* Telefone */}
            <TextInput
              label="Telefone (opcional)"
              value={form.phone}
              onChangeText={(text) => {
                const cleaned = text.replace(/\D/g, '');
                let formatted = cleaned;
                if (cleaned.length > 0) {
                  if (cleaned.length <= 2) formatted = `(${cleaned}`;
                  else if (cleaned.length <= 7) formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
                  else formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
                }
                setForm({ ...form, phone: formatted });
                validateField('phone', formatted);
              }}
              onBlur={() => setTouched({ ...touched, phone: true })}
              mode="outlined"
              error={touched.phone && !!errors.phone}
              keyboardType="phone-pad"
              placeholder="(11) 98765-4321"
              maxLength={15}
              left={<TextInput.Icon icon="phone" />}
              style={styles.input}
              outlineColor={Colors.light.border}
              activeOutlineColor={brandingColors.primary}
            />
            {touched.phone && errors.phone && (
              <HelperText type="error" visible={!!errors.phone}>
                {errors.phone}
              </HelperText>
            )}

            {/* Senha */}
            <TextInput
              label="Senha"
              value={form.password}
              onChangeText={(text) => {
                setForm({ ...form, password: text });
                validateField('password', text);
                if (form.confirmPassword) validateField('confirmPassword', form.confirmPassword);
              }}
              onBlur={() => setTouched({ ...touched, password: true })}
              mode="outlined"
              error={touched.password && !!errors.password}
              secureTextEntry={!showPassword}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              autoCapitalize="none"
              style={styles.input}
              outlineColor={Colors.light.border}
              activeOutlineColor={brandingColors.primary}
            />
            {form.password && (
              <View style={styles.passwordStrength}>
                <ProgressBar 
                  progress={passwordStrength.score} 
                  color={passwordStrength.color}
                  style={styles.strengthBar}
                />
                <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                  Força: {passwordStrength.label}
                </Text>
              </View>
            )}
            {touched.password && errors.password && (
              <HelperText type="error" visible={!!errors.password}>
                {errors.password}
              </HelperText>
            )}

            {/* Confirmar Senha */}
            <TextInput
              label="Confirmar Senha"
              value={form.confirmPassword}
              onChangeText={(text) => {
                setForm({ ...form, confirmPassword: text });
                validateField('confirmPassword', text);
              }}
              onBlur={() => setTouched({ ...touched, confirmPassword: true })}
              mode="outlined"
              error={touched.confirmPassword && !!errors.confirmPassword}
              secureTextEntry={!showConfirmPassword}
              left={<TextInput.Icon icon="lock-check" />}
              right={
                <TextInput.Icon
                  icon={showConfirmPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              }
              autoCapitalize="none"
              style={styles.input}
              outlineColor={Colors.light.border}
              activeOutlineColor={brandingColors.primary}
            />
            {touched.confirmPassword && errors.confirmPassword && (
              <HelperText type="error" visible={!!errors.confirmPassword}>
                {errors.confirmPassword}
              </HelperText>
            )}
            {touched.confirmPassword && !errors.confirmPassword && form.confirmPassword && (
              <HelperText type="info" visible style={styles.successText}>
                ✓ Senhas coincidem
              </HelperText>
            )}

            {/* Botão Criar Conta */}
            <AppButton
              variant="primary"
              size="lg"
              fullWidth
              icon="arrow-forward-circle-outline"
              label={loading ? 'Continuando...' : 'Continuar Cadastro'}
              onPress={handleSignup}
              loading={loading}
              disabled={loading}
              style={styles.primaryButton}
            />
          </View>{/* Fim form */}

            {/* Link Login */}
            <View style={styles.loginLinkContainer}>
              <Text variant="bodyMedium" style={styles.loginLabel}>
                Já tem uma conta?{' '}
              </Text>
              <TouchableOpacity
                onPress={handleLoginRedirect}
                disabled={loading}
                style={styles.loginLink}
                activeOpacity={0.8}
              >
                <Text style={[styles.loginLinkText, { color: brandingColors.primary }]}>Entrar</Text>
              </TouchableOpacity>
            </View>
          </View>{/* Fim formContainer */}
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
    fontSize: 30,
    letterSpacing: -0.6,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    fontSize: theme.fontSize.base,
  },
  formContainer: {
    backgroundColor: '#fff',
    marginHorizontal: theme.spacing.md,
    marginTop: 0,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.xxl,
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
  formSubtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },
  form: {
    gap: 2,
  },
  input: {
    marginBottom: 4,
    backgroundColor: '#fff',
  },
  successText: {
    color: '#4caf50',
    marginBottom: 8,
  },
  passwordStrength: {
    marginBottom: 12,
    gap: 8,
  },
  strengthBar: {
    height: 6,
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: theme.spacing.sm,
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  loginLabel: {
    color: Colors.light.textSecondary,
  },
  loginLink: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  loginLinkText: {
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },
});

import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  HelperText,
  useTheme,
  ProgressBar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';

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
  const theme = useTheme();
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
              Crie sua conta e comece agora
            </Text>
          </View>

          <View style={styles.formContainer}>
            <Text variant="headlineMedium" style={styles.formTitle}>
              Seus Dados
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
            <Button
              mode="contained"
              onPress={handleSignup}
              loading={loading}
              disabled={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              {loading ? 'Criando...' : 'Criar Minha Conta'}
            </Button>
          </View>{/* Fim form */}

            {/* Link Login */}
            <View style={styles.loginLinkContainer}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Já tem uma conta?{' '}
              </Text>
              <Button
                mode="text"
                onPress={handleLoginRedirect}
                disabled={loading}
                compact
                style={styles.loginLink}
              >
                Entrar
              </Button>
            </View>
          </View>{/* Fim formContainer */}
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
  formContainer: {
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
  button: {
    marginTop: 16,
    backgroundColor: Colors.light.primary,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  loginLink: {
    marginLeft: -8,
  },
});

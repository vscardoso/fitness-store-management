/**
 * Tela de Login — branding fixo do app
 */

import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, Button, Text, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AppButton from '@/components/ui/AppButton';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useAuth } from '@/hooks/useAuth';
import { Colors, theme } from '@/constants/Colors';
import { FitFlowLogo } from '@/components/branding/FitFlowLogo';

const APP_NAME = 'Store Management';
const APP_TAGLINE = 'Gestao inteligente para lojas';
const APP_PRIMARY = '#667eea';
const APP_SECONDARY = '#764ba2';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Animações
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const formOpacity = useSharedValue(0);
  const formTranslateY = useSharedValue(24);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
    logoScale.value = withSpring(1, { damping: 14, stiffness: 180 });

    const t = setTimeout(() => {
      formOpacity.value = withTiming(1, { duration: 400 });
      formTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
    }, 200);
    return () => clearTimeout(t);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const formStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formTranslateY.value }],
  }));

  const validate = (): boolean => {
    let valid = true;
    setEmailError('');
    setPasswordError('');
    clearError();

    if (!email) {
      setEmailError('Email é obrigatório');
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Email inválido');
      valid = false;
    }
    if (!password) {
      setPasswordError('Senha é obrigatória');
      valid = false;
    } else if (password.length < 6) {
      setPasswordError('Mínimo 6 caracteres');
      valid = false;
    }
    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch {
      // erro exibido via HelperText
    }
  };

  const primary = APP_PRIMARY;
  const secondary = APP_SECONDARY;

  return (
    <LinearGradient
      colors={[primary, secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Branding */}
            <Animated.View style={[styles.brandingSection, logoStyle]}>
              <FitFlowLogo size={120} variant="icon" />
              <Text style={styles.storeName}>{APP_NAME}</Text>
              <Text style={styles.tagline}>{APP_TAGLINE}</Text>
            </Animated.View>

            {/* Formulário */}
            <Animated.View style={[styles.card, formStyle]}>
              <Text style={styles.cardTitle}>Entrar</Text>
              <Text style={styles.cardSubtitle}>Acesse sua conta para continuar</Text>

              <View style={styles.form}>
                <TextInput
                  label="Email"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setEmailError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  mode="outlined"
                  error={!!emailError}
                  style={styles.input}
                  disabled={isLoading}
                  outlineColor={Colors.light.border}
                  activeOutlineColor={primary}
                />
                {emailError ? <HelperText type="error">{emailError}</HelperText> : null}

                <TextInput
                  label="Senha"
                  value={password}
                  onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  mode="outlined"
                  error={!!passwordError}
                  style={styles.input}
                  disabled={isLoading}
                  outlineColor={Colors.light.border}
                  activeOutlineColor={primary}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword(v => !v)}
                    />
                  }
                />
                {passwordError ? <HelperText type="error">{passwordError}</HelperText> : null}
                {error ? <HelperText type="error">{error}</HelperText> : null}

                <Button
                  mode="text"
                  compact
                  onPress={() => router.push('/(auth)/forgot-password')}
                  style={styles.forgotBtn}
                  textColor={primary}
                >
                  Esqueci minha senha
                </Button>

                <AppButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  icon="arrow-forward-circle-outline"
                  label={isLoading ? 'Entrando...' : 'Entrar'}
                  onPress={handleLogin}
                  loading={isLoading}
                  disabled={isLoading}
                  style={styles.loginPrimaryButton}
                />

                <View style={styles.signupRow}>
                  <Text style={styles.signupText}>Novo por aqui?</Text>
                  <Button mode="text" compact onPress={() => router.push('/(auth)/signup')} textColor={primary}>
                    Criar Conta
                  </Button>
                </View>

                <Button
                  mode="text"
                  compact
                  onPress={() => router.push('/(auth)/onboarding')}
                  style={styles.onboardingBtn}
                  textColor={Colors.light.textSecondary}
                >
                  Ver apresentação novamente
                </Button>
              </View>
            </Animated.View>

            <Text style={styles.version}>Versao 1.0.0 · {APP_NAME}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  keyboardView: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: theme.spacing.md,
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },

  // Branding
  brandingSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  storeName: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: '#fff',
    textAlign: 'center',
  },
  tagline: {
    fontSize: theme.fontSize.md,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.lg,
    ...theme.shadows.lg,
  },
  cardTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: theme.fontSize.md,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.lg,
  },

  // Form
  form: { gap: 2 },
  input: { backgroundColor: '#fff', marginBottom: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 4 },
  loginPrimaryButton: { marginTop: theme.spacing.sm },
  signupRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', marginTop: theme.spacing.sm,
  },
  signupText: { color: Colors.light.textSecondary, fontSize: theme.fontSize.sm },
  onboardingBtn: {
    alignSelf: 'center',
    marginTop: 2,
  },

  // Footer
  version: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: theme.fontSize.xs,
    paddingBottom: theme.spacing.md,
  },
});

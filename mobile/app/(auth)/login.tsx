/**
 * Tela de Login
 * Autenticação com email e senha
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, Button, Text, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  /**
   * Validar campos
   */
  const validate = (): boolean => {
    let valid = true;

    // Limpar erros
    setEmailError('');
    setPasswordError('');
    clearError();

    // Validar email
    if (!email) {
      setEmailError('Email é obrigatório');
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Email inválido');
      valid = false;
    }

    // Validar senha
    if (!password) {
      setPasswordError('Senha é obrigatória');
      valid = false;
    } else if (password.length < 6) {
      setPasswordError('Senha deve ter no mínimo 6 caracteres');
      valid = false;
    }

    return valid;
  };

  /**
   * Fazer login
   */
  const handleLogin = async () => {
    if (!validate()) return;

    try {
      await login({ email: email.trim().toLowerCase(), password });
      // Navegação automática via index.tsx
    } catch (err) {
      Alert.alert(
        'Erro ao fazer login',
        error || 'Verifique suas credenciais e tente novamente'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
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
              Acesse sua loja
            </Text>
          </View>

          {/* Card de Login */}
          <View style={styles.formCard}>
            <Text variant="headlineMedium" style={styles.formTitle}>Entrar</Text>

            {/* Formulário */}
            <View style={styles.form}>
              {/* Email */}
              <TextInput
                label="Email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                mode="outlined"
                error={!!emailError}
                style={styles.input}
                disabled={isLoading}
              />
              {emailError ? (
                <HelperText type="error" visible={!!emailError}>
                  {emailError}
                </HelperText>
              ) : null}

              {/* Senha */}
              <TextInput
                label="Senha"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setPasswordError('');
                }}
                secureTextEntry={!showPassword}
                autoComplete="password"
                mode="outlined"
                error={!!passwordError}
                style={styles.input}
                disabled={isLoading}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
              />
              {passwordError ? (
                <HelperText type="error" visible={!!passwordError}>
                  {passwordError}
                </HelperText>
              ) : null}

              {/* Erro geral */}
              {error ? (
                <HelperText type="error" visible={!!error} style={styles.errorText}>
                  {error}
                </HelperText>
              ) : null}

              {/* Botão de Login */}
              <Button
                mode="contained"
                onPress={handleLogin}
                loading={isLoading}
                disabled={isLoading}
                style={styles.button}
                contentStyle={styles.buttonContent}
              >
                {isLoading ? 'Entrando...' : 'Entrar'}
              </Button>

              {/* Link para Signup */}
              <View style={styles.signupLinkContainer}>
                <Text style={styles.signupText}>Novo por aqui?</Text>
                <Button
                  mode="text"
                  compact
                  onPress={() => router.push('/(auth)/signup')}
                  style={styles.signupLink}
                >
                  Criar Conta
                </Button>
              </View>
            </View>
          </View>

          {/* Informações de desenvolvimento */}
          {__DEV__ && (
            <View style={styles.devInfo}>
              <Text variant="labelSmall" style={styles.devText}>
                💡 Modo Desenvolvimento
              </Text>
              <Text variant="labelSmall" style={styles.devText}>
                Use as credenciais do backend
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  header: {
    backgroundColor: Colors.light.primary,
    padding: 16,
    marginHorizontal: -16,
    marginTop: -16,
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
  formCard: {
    backgroundColor: '#fff',
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
    width: '100%',
  },
  input: {
    marginBottom: 8,
  },
  button: {
    marginTop: 16,
    backgroundColor: Colors.light.primary,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  signupLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 4,
  },
  signupText: {
    color: Colors.light.icon,
    fontSize: 13,
  },
  signupLink: {
    marginLeft: -4,
  },
  errorText: {
    marginTop: 8,
  },
  devInfo: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 2,
    alignItems: 'center',
  },
  devText: {
    color: '#666',
    marginVertical: 2,
  },
});

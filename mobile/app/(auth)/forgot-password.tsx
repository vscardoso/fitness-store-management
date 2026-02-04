/**
 * Tela de Recuperação de Senha
 * Permite ao usuário solicitar reset de senha
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, Button, Text, HelperText, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState('');

  /**
   * Validar email
   */
  const validate = (): boolean => {
    setEmailError('');
    setError('');

    if (!email) {
      setEmailError('Email é obrigatório');
      return false;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Email inválido');
      return false;
    }

    return true;
  };

  /**
   * Solicitar recuperação de senha
   */
  const handleSubmit = async () => {
    if (!validate()) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      });

      setSuccess(true);

      // Em desenvolvimento, mostrar a senha temporária
      if (response.data.temp_password) {
        setTempPassword(response.data.temp_password);
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Erro ao processar solicitação';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Ir para login com email preenchido
   */
  const handleGoToLogin = () => {
    router.replace('/(auth)/login');
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextContainer}>
              <Text variant="headlineMedium" style={styles.headerTitle}>
                Recuperar Senha
              </Text>
              <Text variant="bodyMedium" style={styles.headerSubtitle}>
                Enviaremos instruções para seu email
              </Text>
            </View>
          </View>

          {/* Card de Recuperação */}
          <View style={styles.formCard}>
            {!success ? (
              <>
                {/* Ícone */}
                <View style={styles.iconContainer}>
                  <Ionicons name="lock-open-outline" size={48} color={Colors.light.primary} />
                </View>

                <Text variant="bodyMedium" style={styles.instructions}>
                  Digite o email cadastrado na sua conta. Você receberá uma senha temporária para acessar o sistema.
                </Text>

                {/* Formulário */}
                <View style={styles.form}>
                  <TextInput
                    label="Email"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      setEmailError('');
                      setError('');
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    mode="outlined"
                    error={!!emailError}
                    style={styles.input}
                    disabled={isLoading}
                    left={<TextInput.Icon icon="email-outline" />}
                  />
                  {emailError ? (
                    <HelperText type="error" visible={!!emailError}>
                      {emailError}
                    </HelperText>
                  ) : null}

                  {/* Erro geral */}
                  {error ? (
                    <HelperText type="error" visible={!!error} style={styles.errorText}>
                      {error}
                    </HelperText>
                  ) : null}

                  {/* Botão de Enviar */}
                  <Button
                    mode="contained"
                    onPress={handleSubmit}
                    loading={isLoading}
                    disabled={isLoading}
                    style={styles.button}
                    contentStyle={styles.buttonContent}
                    icon="send"
                  >
                    {isLoading ? 'Enviando...' : 'Recuperar Senha'}
                  </Button>
                </View>
              </>
            ) : (
              <>
                {/* Sucesso */}
                <View style={styles.successContainer}>
                  <View style={styles.successIcon}>
                    <Ionicons name="checkmark-circle" size={64} color={Colors.light.success} />
                  </View>

                  <Text variant="titleLarge" style={styles.successTitle}>
                    Senha Redefinida!
                  </Text>

                  <Text variant="bodyMedium" style={styles.successText}>
                    Uma nova senha temporária foi gerada para sua conta.
                  </Text>

                  {/* Mostrar senha temporária (apenas em dev) */}
                  {tempPassword && (
                    <Card style={styles.passwordCard}>
                      <Card.Content>
                        <Text variant="labelMedium" style={styles.passwordLabel}>
                          Sua nova senha temporária:
                        </Text>
                        <View style={styles.passwordBox}>
                          <Text variant="headlineMedium" style={styles.passwordText}>
                            {tempPassword}
                          </Text>
                        </View>
                        <Text variant="bodySmall" style={styles.passwordHint}>
                          Anote esta senha e use-a para fazer login.
                          Recomendamos alterá-la após o acesso.
                        </Text>
                      </Card.Content>
                    </Card>
                  )}

                  <Button
                    mode="contained"
                    onPress={handleGoToLogin}
                    style={styles.button}
                    contentStyle={styles.buttonContent}
                    icon="login"
                  >
                    Ir para Login
                  </Button>
                </View>
              </>
            )}

            {/* Link para voltar ao login */}
            {!success && (
              <View style={styles.linkContainer}>
                <Text style={styles.linkText}>Lembrou a senha?</Text>
                <Button
                  mode="text"
                  compact
                  onPress={() => router.back()}
                  style={styles.link}
                >
                  Voltar ao Login
                </Button>
              </View>
            )}
          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  headerTextContainer: {
    flex: 1,
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
    padding: 24,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  instructions: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginBottom: 24,
    lineHeight: 22,
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
  errorText: {
    marginTop: 8,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 4,
  },
  linkText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  link: {
    marginLeft: -4,
  },
  successContainer: {
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 16,
  },
  successTitle: {
    fontWeight: '700',
    color: Colors.light.success,
    marginBottom: 8,
  },
  successText: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginBottom: 24,
  },
  passwordCard: {
    width: '100%',
    backgroundColor: Colors.light.backgroundSecondary,
    marginBottom: 24,
  },
  passwordLabel: {
    color: Colors.light.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  passwordBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.light.primary,
    borderStyle: 'dashed',
  },
  passwordText: {
    fontWeight: '700',
    color: Colors.light.primary,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  passwordHint: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginTop: 12,
    fontStyle: 'italic',
  },
});

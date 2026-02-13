/**
 * Add Team Member Screen
 * Formulário para adicionar novo membro à equipe
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Card } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { createTeamMember, getRoleLabel } from '@/services/teamService';
import { UserRole, type TeamMemberCreate } from '@/types';
import { phoneMask } from '@/utils/masks';
import { capitalizeWords } from '@/utils/format';

export default function AddTeamMemberScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<TeamMemberCreate>({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: UserRole.SELLER,
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Mutation: Criar membro
  const createMutation = useMutation({
    mutationFn: createTeamMember,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      Alert.alert(
        'Sucesso',
        `${data.full_name} foi adicionado(a) à equipe!`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: any) => {
      Alert.alert(
        'Erro',
        error.response?.data?.detail || 'Erro ao criar membro da equipe'
      );
    },
  });

  // Validar e submeter
  const handleSubmit = () => {
    // Validações
    if (!formData.full_name.trim()) {
      Alert.alert('Erro', 'Informe o nome completo');
      return;
    }
    if (!formData.email.trim()) {
      Alert.alert('Erro', 'Informe o email');
      return;
    }
    // Validação de email mais rigorosa
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Alert.alert('Erro', 'Email inválido. Use o formato: exemplo@dominio.com');
      return;
    }
    if (formData.phone && formData.phone.replace(/\D/g, '').length < 10) {
      Alert.alert('Erro', 'Telefone inválido. Use o formato: (00) 00000-0000');
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (formData.password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não conferem');
      return;
    }

    // Remove máscara do telefone antes de enviar
    const dataToSend = {
      ...formData,
      phone: formData.phone ? formData.phone.replace(/\D/g, '') : '',
    };

    createMutation.mutate(dataToSend);
  };

  const roleOptions = [
    { value: UserRole.SELLER, label: 'Vendedor' },
    { value: UserRole.CASHIER, label: 'Caixa' },
    { value: UserRole.MANAGER, label: 'Gerente' },
    { value: UserRole.ADMIN, label: 'Admin' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      {/* Header com gradiente */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>

              <Text style={styles.headerTitle}>
                Novo Membro
              </Text>

              <View style={styles.headerPlaceholder} />
            </View>

            <View style={styles.headerInfo}>
              <Text style={styles.headerSubtitle}>
                Adicione um colaborador à sua equipe
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Card: Informações Pessoais */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="person-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações Pessoais</Text>
            </View>

          <TextInput
            label="Nome Completo *"
            value={formData.full_name}
            onChangeText={(text) => {
              // Capitaliza primeira letra de cada palavra
              const capitalized = capitalizeWords(text);
              setFormData({ ...formData, full_name: capitalized });
            }}
            style={styles.input}
            mode="outlined"
            left={<TextInput.Icon icon="account" />}
            autoCapitalize="words"
          />

          <TextInput
            label="Email *"
            value={formData.email}
            onChangeText={(text) => setFormData({ ...formData, email: text.toLowerCase() })}
            style={styles.input}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            left={<TextInput.Icon icon="email" />}
            placeholder="exemplo@dominio.com"
          />

          <TextInput
            label="Telefone"
            value={formData.phone}
            onChangeText={(text) => {
              // Aplica máscara de telefone
              const masked = phoneMask(text);
              setFormData({ ...formData, phone: masked });
            }}
            style={styles.input}
            mode="outlined"
            keyboardType="phone-pad"
            left={<TextInput.Icon icon="phone" />}
            placeholder="(00) 00000-0000"
          />
          </Card.Content>
        </Card>

        {/* Card: Função */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="briefcase-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Função na Loja</Text>
            </View>

          <SegmentedButtons
            value={formData.role}
            onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
            buttons={roleOptions}
            style={styles.segmented}
          />

          <View style={styles.roleDescription}>
            <Ionicons name="information-circle" size={18} color="#6B7280" />
            <Text style={styles.roleDescriptionText}>
              {formData.role === UserRole.ADMIN && 'Acesso total: gerenciar equipe, produtos, vendas e configurações.'}
              {formData.role === UserRole.MANAGER && 'Pode gerenciar produtos, vendas e ver relatórios.'}
              {formData.role === UserRole.SELLER && 'Pode realizar vendas e visualizar produtos.'}
              {formData.role === UserRole.CASHIER && 'Acesso apenas ao PDV para registrar vendas.'}
            </Text>
          </View>
          </Card.Content>
        </Card>

        {/* Card: Senha */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Senha de Acesso</Text>
            </View>

          <TextInput
            label="Senha *"
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            style={styles.input}
            mode="outlined"
            secureTextEntry={!showPassword}
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />

          <TextInput
            label="Confirmar Senha *"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.input}
            mode="outlined"
            secureTextEntry={!showPassword}
            left={<TextInput.Icon icon="lock-check" />}
          />

          <Text style={styles.passwordHint}>
            A senha deve ter pelo menos 6 caracteres
          </Text>
          </Card.Content>
        </Card>

        {/* Botões de ação */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => router.back()}
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
            icon="account-plus"
          >
            Adicionar à Equipe
          </Button>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.sm,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    marginTop: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
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
    color: '#fff',
    fontWeight: 'bold' as const,
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
    fontSize: theme.fontSize.sm,
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
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
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.background,
  },
  segmented: {
    marginBottom: 12,
  },
  roleDescription: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  roleDescriptionText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  passwordHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: -4,
    marginBottom: 0,
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

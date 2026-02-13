/**
 * Team Member Detail Screen
 * Visualizar e editar detalhes de um membro da equipe
 */

import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, SegmentedButtons } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CustomModal from '@/components/ui/CustomModal';
import ModalActions from '@/components/ui/ModalActions';
import {
  getTeamMember,
  updateTeamMember,
  changeTeamMemberRole,
  resetTeamMemberPassword,
  deactivateTeamMember,
  activateTeamMember,
  getRoleLabel,
  getRoleColor,
} from '@/services/teamService';
import { UserRole, type TeamMemberUpdate } from '@/types';
import { phoneMask } from '@/utils/masks';

export default function TeamMemberDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const memberId = parseInt(id || '0', 10);
  const isCurrentUser = user?.id === memberId;

  // Estados do formulário
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<TeamMemberUpdate>({
    full_name: '',
    phone: '',
  });
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.SELLER);

  // Estado para reset de senha
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Estados para dialogs de confirmação e feedback
  const [showChangeRoleDialog, setShowChangeRoleDialog] = useState(false);
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  // Query: Buscar membro
  const {
    data: member,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['team-member', memberId],
    queryFn: () => getTeamMember(memberId),
    enabled: memberId > 0,
  });

  // Atualizar formulário quando carregar dados
  useEffect(() => {
    if (member) {
      setFormData({
        full_name: member.full_name,
        phone: member.phone || '',
      });
      setSelectedRole(member.role as UserRole);
    }
  }, [member]);

  // Mutation: Atualizar membro
  const updateMutation = useMutation({
    mutationFn: (data: TeamMemberUpdate) => updateTeamMember(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-member', memberId] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setIsEditing(false);
      setSuccessMessage('Dados atualizados com sucesso');
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Erro ao atualizar dados');
      setShowErrorDialog(true);
    },
  });

  // Mutation: Alterar role
  const changeRoleMutation = useMutation({
    mutationFn: (role: UserRole) => changeTeamMemberRole(memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-member', memberId] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      // Atualiza selectedRole só após sucesso no backend
      if (pendingRole) {
        setSelectedRole(pendingRole);
      }
      setPendingRole(null);
      setShowChangeRoleDialog(false);
      setSuccessMessage('Função alterada com sucesso');
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      // Em caso de erro, NÃO atualiza selectedRole, mantém o antigo
      setPendingRole(null);
      setShowChangeRoleDialog(false);
      setErrorMessage(error.response?.data?.detail || 'Erro ao alterar função');
      setShowErrorDialog(true);
    },
  });

  // Mutation: Resetar senha
  const resetPasswordMutation = useMutation({
    mutationFn: (password: string) => resetTeamMemberPassword(memberId, password),
    onSuccess: () => {
      setShowPasswordDialog(false);
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setSuccessMessage('Senha alterada com sucesso');
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      setShowPasswordDialog(false);
      setErrorMessage(error.response?.data?.detail || 'Erro ao alterar senha');
      setShowErrorDialog(true);
    },
  });

  // Mutation: Desativar membro
  const deactivateMutation = useMutation({
    mutationFn: deactivateTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-member', memberId] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setShowDeactivateDialog(false);
      setSuccessMessage('Membro desativado com sucesso');
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      setShowDeactivateDialog(false);
      setErrorMessage(error.response?.data?.detail || 'Erro ao desativar membro');
      setShowErrorDialog(true);
    },
  });

  // Mutation: Reativar membro
  const activateMutation = useMutation({
    mutationFn: activateTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-member', memberId] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setShowActivateDialog(false);
      setSuccessMessage('Membro reativado com sucesso');
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      setShowActivateDialog(false);
      setErrorMessage(error.response?.data?.detail || 'Erro ao reativar membro');
      setShowErrorDialog(true);
    },
  });

  // Handlers
  const handleSave = () => {
    if (!formData.full_name?.trim()) {
      setErrorMessage('Nome é obrigatório');
      setShowErrorDialog(true);
      return;
    }
    updateMutation.mutate(formData);
  };

  const handleChangeRole = (role: UserRole) => {
    if (role === member?.role) return;
    // Não muda o selectedRole ainda, só mostra o dialog
    setPendingRole(role);
    setShowChangeRoleDialog(true);
  };

  const confirmChangeRole = () => {
    if (pendingRole) {
      // Não atualiza selectedRole aqui, só faz a mutation
      // O selectedRole será atualizado no onSuccess da mutation
      changeRoleMutation.mutate(pendingRole);
    }
  };

  const handleResetPassword = () => {
    if (newPassword.length < 6) {
      setErrorMessage('A senha deve ter pelo menos 6 caracteres');
      setShowErrorDialog(true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('As senhas não conferem');
      setShowErrorDialog(true);
      return;
    }
    resetPasswordMutation.mutate(newPassword);
  };

  const handleCancelResetPassword = () => {
    setShowPasswordDialog(false);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const handleDeactivate = () => {
    setShowDeactivateDialog(true);
  };

  const handleActivate = () => {
    setShowActivateDialog(true);
  };

  if (!memberId || memberId <= 0) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorText}>ID do membro inválido</Text>
        <Button mode="contained" onPress={() => router.back()}>
          Voltar
        </Button>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Carregando...</Text>
      </View>
    );
  }

  if (isError || !member) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorText}>Membro não encontrado</Text>
        <Button mode="contained" onPress={() => router.back()}>
          Voltar
        </Button>
      </View>
    );
  }

  const roleColor = getRoleColor(member.role as UserRole);
  const roleOptions = [
    { value: UserRole.SELLER, label: 'Vendedor' },
    { value: UserRole.CASHIER, label: 'Caixa' },
    { value: UserRole.MANAGER, label: 'Gerente' },
    { value: UserRole.ADMIN, label: 'Admin' },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <PageHeader
        title={member.full_name}
        subtitle={getRoleLabel(member.role as UserRole)}
        showBackButton
        rightActions={
          !isCurrentUser
            ? [
                {
                  icon: isEditing ? 'close' : 'pencil',
                  onPress: () => setIsEditing(!isEditing),
                },
              ]
            : []
        }
      >
        {/* Badges customizados */}
        <View style={styles.headerBadges}>
          {!member.is_active && (
            <View style={[styles.statusBadge, { backgroundColor: 'rgba(239, 68, 68, 0.3)' }]}>
              <Text style={styles.statusBadgeText}>Inativo</Text>
            </View>
          )}
          {isCurrentUser && (
            <View style={[styles.statusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}>
              <Text style={styles.statusBadgeText}>Você</Text>
            </View>
          )}
        </View>
      </PageHeader>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Informações Pessoais */}
        <Text style={styles.sectionTitle}>Informações Pessoais</Text>

        <View style={styles.infoCard}>
          {isEditing ? (
            <>
              <TextInput
                label="Nome Completo"
                value={formData.full_name}
                onChangeText={(text) => setFormData({ ...formData, full_name: text })}
                style={styles.input}
                mode="outlined"
                left={<TextInput.Icon icon="account" />}
              />

              <TextInput
                label="Telefone"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                style={styles.input}
                mode="outlined"
                keyboardType="phone-pad"
                left={<TextInput.Icon icon="phone" />}
              />

              <Button
                mode="contained"
                onPress={handleSave}
                loading={updateMutation.isPending}
                disabled={updateMutation.isPending}
                style={styles.saveButton}
              >
                Salvar Alterações
              </Button>
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Ionicons name="mail" size={20} color="#6B7280" />
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{member.email}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="call" size={20} color="#6B7280" />
                <Text style={styles.infoLabel}>Telefone:</Text>
                <Text style={styles.infoValue}>
                  {member.phone ? phoneMask(member.phone) : 'Não informado'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="calendar" size={20} color="#6B7280" />
                <Text style={styles.infoLabel}>Cadastro:</Text>
                <Text style={styles.infoValue}>
                  {new Date(member.created_at).toLocaleDateString('pt-BR')}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Função (apenas para admin e não é o próprio usuário) */}
        {!isCurrentUser && (
          <>
            <Text style={styles.sectionTitle}>Função na Loja</Text>

            {user?.role === UserRole.ADMIN ? (
              <>
                <SegmentedButtons
                  value={selectedRole}
                  onValueChange={(value) => {
                    // Não muda ainda, só chama handleChangeRole que mostra o dialog
                    handleChangeRole(value as UserRole);
                  }}
                  buttons={roleOptions}
                  style={styles.segmented}
                />

                <View style={styles.roleDescription}>
                  <Ionicons name="information-circle" size={18} color="#6B7280" />
                  <Text style={styles.roleDescriptionText}>
                    {selectedRole === UserRole.ADMIN && 'Acesso total: gerenciar equipe, produtos, vendas e configurações.'}
                    {selectedRole === UserRole.MANAGER && 'Pode gerenciar produtos, vendas e ver relatórios.'}
                    {selectedRole === UserRole.SELLER && 'Pode realizar vendas e visualizar produtos.'}
                    {selectedRole === UserRole.CASHIER && 'Acesso apenas ao PDV para registrar vendas.'}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.roleReadOnlyCard}>
                <View style={styles.roleReadOnlyHeader}>
                  <View style={[styles.roleBadge, { backgroundColor: getRoleColor(member.role as UserRole) }]}>
                    <Text style={[styles.roleBadgeText, { color: '#fff' }]}>
                      {getRoleLabel(member.role as UserRole)}
                    </Text>
                  </View>
                  <View style={styles.adminOnlyBadge}>
                    <Ionicons name="shield-checkmark" size={14} color="#6366F1" />
                    <Text style={styles.adminOnlyText}>Apenas Admin</Text>
                  </View>
                </View>
                <Text style={styles.roleReadOnlyDescription}>
                  Apenas administradores podem alterar a função de membros da equipe.
                </Text>
              </View>
            )}
          </>
        )}

        {/* Ações (apenas para admin e não é o próprio usuário) */}
        {!isCurrentUser && user?.role === UserRole.ADMIN && (
          <>
            <Text style={styles.sectionTitle}>Ações</Text>

            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowPasswordDialog(true)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#3B82F620' }]}>
                  <Ionicons name="key" size={24} color="#3B82F6" />
                </View>
                <View style={styles.actionTextContainer}>
                  <Text style={styles.actionTitle}>Resetar Senha</Text>
                  <Text style={styles.actionDescription}>Definir uma nova senha</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {member.is_active ? (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleDeactivate}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#EF444420' }]}>
                    <Ionicons name="person-remove" size={24} color="#EF4444" />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionTitle, { color: '#EF4444' }]}>
                      Desativar Membro
                    </Text>
                    <Text style={styles.actionDescription}>
                      Remove acesso ao sistema
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleActivate}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#10B98120' }]}>
                    <Ionicons name="person-add" size={24} color="#10B981" />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionTitle, { color: '#10B981' }]}>
                      Reativar Membro
                    </Text>
                    <Text style={styles.actionDescription}>
                      Restaura acesso ao sistema
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Modal: Reset Password */}
      <CustomModal
        visible={showPasswordDialog}
        onDismiss={handleCancelResetPassword}
        title="Resetar Senha"
        subtitle={`Defina uma nova senha para ${member.full_name}`}
      >
        <TextInput
          label="Nova Senha *"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={!showPassword}
          mode="outlined"
          style={styles.input}
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
          secureTextEntry={!showPassword}
          mode="outlined"
          style={styles.input}
          left={<TextInput.Icon icon="lock-check" />}
        />

        <Text style={styles.passwordHint}>
          A senha deve ter pelo menos 6 caracteres
        </Text>

        <ModalActions
          onCancel={handleCancelResetPassword}
          onConfirm={handleResetPassword}
          cancelText="Cancelar"
          confirmText="Confirmar"
          loading={resetPasswordMutation.isPending}
        />
      </CustomModal>

      {/* ConfirmDialog: Alterar Função */}
      <ConfirmDialog
        visible={showChangeRoleDialog}
        title="Alterar Função"
        message={`Deseja alterar a função de ${member.full_name} para ${pendingRole ? getRoleLabel(pendingRole) : ''}?`}
        confirmText="Confirmar"
        cancelText="Cancelar"
        onConfirm={confirmChangeRole}
        onCancel={() => {
          setShowChangeRoleDialog(false);
          setPendingRole(null);
          // Mantém a função atual selecionada
        }}
        type="info"
        icon="swap-horizontal"
        loading={changeRoleMutation.isPending}
      />

      {/* ConfirmDialog: Desativar Membro */}
      <ConfirmDialog
        visible={showDeactivateDialog}
        title="Desativar Membro"
        message={`Tem certeza que deseja desativar ${member.full_name}?`}
        details={['O membro não poderá mais acessar o sistema', 'As informações serão mantidas no histórico']}
        confirmText="Desativar"
        cancelText="Cancelar"
        onConfirm={() => deactivateMutation.mutate(memberId)}
        onCancel={() => setShowDeactivateDialog(false)}
        type="danger"
        icon="person-remove"
        loading={deactivateMutation.isPending}
      />

      {/* ConfirmDialog: Reativar Membro */}
      <ConfirmDialog
        visible={showActivateDialog}
        title="Reativar Membro"
        message={`Deseja reativar o acesso de ${member.full_name}?`}
        confirmText="Reativar"
        cancelText="Cancelar"
        onConfirm={() => activateMutation.mutate(memberId)}
        onCancel={() => setShowActivateDialog(false)}
        type="success"
        icon="person-add"
        loading={activateMutation.isPending}
      />

      {/* ConfirmDialog: Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Sucesso!"
        message={successMessage}
        confirmText="OK"
        onConfirm={() => setShowSuccessDialog(false)}
        onCancel={() => setShowSuccessDialog(false)}
        type="success"
        icon="checkmark-circle"
      />

      {/* ConfirmDialog: Erro */}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  errorText: {
    fontSize: 18,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  headerBadges: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 16,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    width: 80,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  saveButton: {
    marginTop: 8,
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
  roleReadOnlyCard: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  roleReadOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  adminOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F115',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  adminOnlyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366F1',
  },
  roleReadOnlyDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  actionsContainer: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  actionDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  passwordHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

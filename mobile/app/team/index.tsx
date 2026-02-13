/**
 * Team Management Screen
 * Lista e gerencia membros da equipe (usuários da loja)
 */

import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { Text, Card, Searchbar, Chip } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { Colors, theme } from '@/constants/Colors';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import {
  getTeamMembers,
  deactivateTeamMember,
  activateTeamMember,
  getRoleLabel,
  getRoleColor,
} from '@/services/teamService';
import { UserRole, type TeamMember } from '@/types';

export default function TeamScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Query: Lista de membros
  const {
    data: teamData,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['team-members', showInactive],
    queryFn: () => getTeamMembers({ include_inactive: showInactive }),
  });

  // Mutation: Desativar membro
  const deactivateMutation = useMutation({
    mutationFn: deactivateTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      Alert.alert('Sucesso', 'Membro desativado com sucesso');
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao desativar membro');
    },
  });

  // Mutation: Ativar membro
  const activateMutation = useMutation({
    mutationFn: activateTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      Alert.alert('Sucesso', 'Membro reativado com sucesso');
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao reativar membro');
    },
  });

  // Auto-refresh no foco
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Filtrar por busca
  const filteredMembers = teamData?.items?.filter((member) => {
    const search = searchQuery.toLowerCase();
    return (
      member.full_name.toLowerCase().includes(search) ||
      member.email.toLowerCase().includes(search) ||
      member.phone?.includes(search)
    );
  });

  // Confirmar desativação
  const handleDeactivate = (member: TeamMember) => {
    Alert.alert(
      'Desativar Membro',
      `Tem certeza que deseja desativar ${member.full_name}? Ele não poderá mais acessar o sistema.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desativar',
          style: 'destructive',
          onPress: () => deactivateMutation.mutate(member.id),
        },
      ]
    );
  };

  // Confirmar reativação
  const handleActivate = (member: TeamMember) => {
    Alert.alert(
      'Reativar Membro',
      `Deseja reativar ${member.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reativar',
          onPress: () => activateMutation.mutate(member.id),
        },
      ]
    );
  };

  // Renderizar card de membro
  const renderMember = ({ item }: { item: TeamMember }) => {
    const isCurrentUser = item.id === user?.id;
    const roleColor = getRoleColor(item.role as UserRole);

    return (
      <TouchableOpacity
        onPress={() => router.push(`/team/${item.id}`)}
        activeOpacity={0.7}
        style={styles.cardWrapper}
      >
        <Card style={[styles.memberCard, !item.is_active && styles.inactiveCard]}>
          <Card.Content style={styles.memberContent}>
            {/* Avatar */}
            <View style={[styles.avatarContainer, { backgroundColor: roleColor + '20' }]}>
              <Text style={[styles.avatarText, { color: roleColor }]}>
                {item.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>

            {/* Info */}
            <View style={styles.memberInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.memberName}>{item.full_name}</Text>
                {isCurrentUser && (
                  <View style={styles.youBadge}>
                    <Text style={styles.youBadgeText}>Você</Text>
                  </View>
                )}
              </View>
              <Text style={styles.memberEmail}>{item.email}</Text>
              {item.phone && (
                <Text style={styles.memberPhone}>{item.phone}</Text>
              )}

              {/* Role badge */}
              <View style={[styles.roleBadge, { backgroundColor: roleColor + '15' }]}>
                <Text style={[styles.roleText, { color: roleColor }]}>
                  {getRoleLabel(item.role as UserRole)}
                </Text>
              </View>
            </View>

            {/* Status / Actions */}
            <View style={styles.memberActions}>
              {!item.is_active ? (
                <TouchableOpacity
                  style={styles.activateButton}
                  onPress={() => handleActivate(item)}
                >
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                </TouchableOpacity>
              ) : !isCurrentUser ? (
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => router.push(`/team/${item.id}`)}
                >
                  <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  const memberCount = filteredMembers?.length || 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
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

              <View style={styles.headerInfo}>
                <Text style={styles.headerTitle}>Equipe</Text>
                <Text style={styles.headerSubtitle}>
                  {memberCount} {memberCount === 1 ? 'membro' : 'membros'}
                </Text>
              </View>

              <View style={styles.headerPlaceholder} />
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Search */}
      <Searchbar
        placeholder="Buscar por nome, email..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
      />

      {/* Filters */}
      <View style={styles.filters}>
        <Chip
          selected={!showInactive}
          onPress={() => setShowInactive(false)}
          style={styles.chip}
        >
          Ativos
        </Chip>
        <Chip
          selected={showInactive}
          onPress={() => setShowInactive(true)}
          style={styles.chip}
        >
          Todos
        </Chip>
      </View>

      {/* List */}
      <FlatList
        data={filteredMembers}
        renderItem={renderMember}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[Colors.light.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={searchQuery ? 'Nenhum membro encontrado' : 'Nenhum membro'}
            description={
              searchQuery
                ? 'Tente buscar por outro termo'
                : 'Adicione membros à sua equipe'
            }
          />
        }
      />

      {/* FAB: Adicionar membro */}
      <FAB directRoute="/team/add" bottom={90} />
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
    paddingBottom: theme.spacing.md,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {},
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textAlign: 'center',
  },
  headerPlaceholder: {
    width: 40,
  },
  searchbar: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  chip: {
    backgroundColor: Colors.light.card,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 100,
  },
  cardWrapper: {
    marginBottom: theme.spacing.sm,
  },
  memberCard: {
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
    backgroundColor: Colors.light.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inactiveCard: {
    opacity: 0.6,
  },
  memberContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  memberName: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  youBadge: {
    backgroundColor: Colors.light.primary + '20',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.md,
  },
  youBadgeText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  memberEmail: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  memberPhone: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing.xs,
  },
  roleText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  memberActions: {
    marginLeft: theme.spacing.xs,
  },
  activateButton: {
    padding: theme.spacing.xs,
  },
  menuButton: {
    padding: theme.spacing.xs,
  },
});

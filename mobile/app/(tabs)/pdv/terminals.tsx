import { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import { haptics } from '@/utils/haptics';
import { listTerminals, createTerminal, setupTerminal, saveTerminalCredentials, deleteTerminal } from '@/services/pdvService';
import type { PDVTerminal, PDVTerminalCreate, PaymentProvider } from '@/types/pdv';

const C = Colors.light;

const PROVIDER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  mercadopago: { label: 'Mercado Pago', color: '#00A9CE', bg: '#E0F7FF' },
  cielo:       { label: 'Cielo',        color: '#003DA5', bg: '#E0E9FF' },
  stone:       { label: 'Stone',        color: '#00A868', bg: '#E0F5ED' },
  rede:        { label: 'Rede',         color: '#E30613', bg: '#FDECEA' },
  getnet:      { label: 'GetNet',       color: '#E4851A', bg: '#FEF0E0' },
  pagseguro:   { label: 'PagSeguro',    color: '#009B02', bg: '#E0F5E0' },
  sumup:       { label: 'SumUp',        color: '#1A1A2E', bg: '#EBEBF5' },
  manual:      { label: 'Manual',       color: '#6B7280', bg: '#F3F4F6' },
};

const PROVIDER_ORDER: PaymentProvider[] = [
  'cielo', 'stone', 'rede', 'getnet', 'pagseguro', 'sumup', 'manual', 'mercadopago',
];

type CredentialField = { key: string; label: string; placeholder: string; hint?: string };

const PROVIDER_CREDENTIALS: Partial<Record<PaymentProvider, CredentialField[]>> = {
  cielo: [
    {
      key: 'merchant_id',
      label: 'Merchant ID (EC)',
      placeholder: 'Ex: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      hint: 'Número do estabelecimento (EC) no portal Cielo.',
    },
  ],
  stone: [
    {
      key: 'stonecode',
      label: 'Stone Code',
      placeholder: 'Ex: 123456789',
      hint: 'Código Stone do estabelecimento.',
    },
    {
      key: 'sk_key',
      label: 'Chave Secreta (SK)',
      placeholder: 'sk_live_...',
      hint: 'Chave secreta Stone para autenticação.',
    },
  ],
};

function ProviderBadge({ provider }: { provider: string }) {
  const meta = PROVIDER_LABELS[provider] ?? { label: provider, color: C.textSecondary, bg: C.border };
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function TerminalCard({
  terminal,
  onDelete,
}: {
  terminal: PDVTerminal;
  onDelete: (t: PDVTerminal) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.cardName}>{terminal.name}</Text>
        <ProviderBadge provider={terminal.provider} />
      </View>

      <Text style={styles.cardId}>ID: {terminal.external_id}</Text>

      <View style={styles.cardFooter}>
        <View style={styles.statusRow}>
          <Ionicons
            name={terminal.is_configured ? 'checkmark-circle' : 'warning'}
            size={15}
            color={terminal.is_configured ? '#00A868' : '#E4851A'}
          />
          <Text
            style={[
              styles.statusText,
              { color: terminal.is_configured ? '#00A868' : '#E4851A' },
            ]}
          >
            {terminal.is_configured ? 'Configurado' : 'Pendente'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            haptics.light();
            onDelete(terminal);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={18} color={C.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptyTerminals() {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="hardware-chip-outline" size={52} color={C.textSecondary} />
      <Text style={styles.emptyTitle}>Nenhum terminal cadastrado</Text>
      <Text style={styles.emptySubtitle}>Adicione sua primeira maquininha</Text>
    </View>
  );
}

export default function TerminalsScreen() {
  const queryClient = useQueryClient();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PDVTerminal | null>(null);

  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [provider, setProvider] = useState<PaymentProvider>('cielo');
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ['pdv-terminals'],
    queryFn: listTerminals,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: PDVTerminalCreate) => {
      const terminal = await createTerminal(payload);
      const fields = PROVIDER_CREDENTIALS[payload.provider ?? 'manual'];
      if (fields) {
        const creds: Record<string, string> = {};
        for (const f of fields) {
          if (credentials[f.key]?.trim()) creds[f.key] = credentials[f.key].trim();
        }
        if (Object.keys(creds).length > 0) {
          // Salvar credenciais já chama setup internamente no backend
          await saveTerminalCredentials(terminal.id, creds);
          return terminal;
        }
      }
      // Providers sem credenciais (manual, rede, getnet, etc.) → setup marca is_configured
      await setupTerminal(terminal.id).catch(() => {});
      return terminal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-terminals'] });
      setSheetVisible(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTerminal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-terminals'] });
      setDeleteTarget(null);
    },
  });

  function resetForm() {
    setName('');
    setExternalId('');
    setProvider('cielo');
    setCredentials({});
  }

  function handleOpenSheet() {
    haptics.light();
    resetForm();
    setSheetVisible(true);
  }

  function handleCreate() {
    if (!name.trim() || !externalId.trim()) return;
    haptics.medium();
    createMutation.mutate({ name: name.trim(), external_id: externalId.trim(), provider });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    haptics.medium();
    deleteMutation.mutate(deleteTarget.id);
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title="Terminais PDV"
        subtitle={terminals.length > 0 ? `${terminals.length} terminal${terminals.length !== 1 ? 'is' : ''}` : undefined}
        showBackButton
        rightActions={[
          {
            icon: 'add',
            onPress: handleOpenSheet,
          },
        ]}
      />

      <FlatList
        data={terminals}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.list,
          terminals.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={isLoading ? null : <EmptyTerminals />}
        renderItem={({ item }) => (
          <TerminalCard terminal={item} onDelete={setDeleteTarget} />
        )}
      />

      <BottomSheet
        visible={sheetVisible}
        onDismiss={() => setSheetVisible(false)}
        title="Novo Terminal"
        icon="hardware-chip-outline"
        actions={[
          {
            label: 'Criar Terminal',
            onPress: handleCreate,
            variant: 'primary',
            loading: createMutation.isPending,
            disabled: !name.trim() || !externalId.trim(),
          },
        ]}
      >
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Nome do caixa</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Caixa 1"
              placeholderTextColor={C.textSecondary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>ID do terminal</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: LOJ001POS001"
              placeholderTextColor={C.textSecondary}
              value={externalId}
              onChangeText={setExternalId}
              autoCapitalize="characters"
            />
          </View>

          <Text style={styles.label}>Provedor de pagamento</Text>
          <View style={styles.providerGrid}>
            {PROVIDER_ORDER.map((p) => {
              const meta = PROVIDER_LABELS[p];
              const selected = provider === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.providerChip,
                    selected && { backgroundColor: meta.bg, borderColor: meta.color },
                  ]}
                  onPress={() => {
                    haptics.light();
                    setProvider(p);
                    setCredentials({});
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.providerChipText,
                      selected && { color: meta.color, fontWeight: '600' },
                    ]}
                  >
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Campos de credenciais — condicionais por provider */}
          {PROVIDER_CREDENTIALS[provider]?.map((field) => (
            <View key={field.key} style={styles.field}>
              <Text style={styles.label}>{field.label}</Text>
              <TextInput
                style={styles.input}
                placeholder={field.placeholder}
                placeholderTextColor={C.textSecondary}
                value={credentials[field.key] ?? ''}
                onChangeText={(v) => setCredentials((prev) => ({ ...prev, [field.key]: v }))}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {field.hint ? (
                <Text style={styles.fieldHint}>{field.hint}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </BottomSheet>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Excluir terminal"
        message={`Deseja excluir o terminal "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        type="danger"
        icon="trash-outline"
        loading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  listEmpty: {
    flex: 1,
  },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: theme.borderRadius.xl,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    flex: 1,
  },
  cardId: {
    fontSize: 12,
    color: C.textSecondary,
    fontFamily: 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: C.textSecondary,
  },

  // Form
  form: {
    gap: 16,
    paddingBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    backgroundColor: C.background,
  },
  fieldHint: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 3,
  },

  // Provider chips grid
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  providerChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  providerChipText: {
    fontSize: 13,
    color: C.textSecondary,
  },
});

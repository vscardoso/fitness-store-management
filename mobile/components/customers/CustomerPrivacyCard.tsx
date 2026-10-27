/**
 * Privacidade (LGPD) na ficha do cliente: exportar os dados (gerente/admin), ver quem acessou e
 * anonimizar (admin). A loja atende o pedido do titular; o cliente da loja não usa o app.
 */
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { anonymizeCustomer, exportCustomerData, getCustomerAccessLog } from '@/services/customerService';
import { formatDateTime } from '@/utils/format';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

interface Props {
  customerId: number;
  canExport: boolean;
  isAdmin: boolean;
  onAnonymized: () => void;
}

async function saveJson(data: unknown, filename: string) {
  const text = JSON.stringify(data, null, 2);
  if (Platform.OS === 'web') {
    const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return;
  }
  const path = `${LegacyFileSystem.cacheDirectory}${filename}`;
  await LegacyFileSystem.writeAsStringAsync(path, text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento não disponível neste aparelho.');
  await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Dados do cliente' });
}

export default function CustomerPrivacyCard({ customerId, canExport, isAdmin, onAnonymized }: Props) {
  const brandingColors = useBrandingColors();
  const styles = useMemo(() => createStyles(brandingColors.primary), [brandingColors.primary]);
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showAnonymize, setShowAnonymize] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [dialog, setDialog] = useState<{ title: string; message: string; type: 'success' | 'danger' } | null>(null);

  const { data: log = [], isLoading: loadingLog } = useQuery({
    queryKey: ['customer-access-log', customerId],
    queryFn: () => getCustomerAccessLog(customerId),
    enabled: showLog && isAdmin,
  });

  const anonymizeMutation = useMutation({
    mutationFn: () => anonymizeCustomer(customerId, confirmText),
    onSuccess: () => {
      setShowAnonymize(false);
      queryClient.invalidateQueries();
      setDialog({
        title: 'Cliente anonimizado',
        message: 'Os dados pessoais foram apagados. As vendas continuam no caixa e nos relatórios, sem identificar a pessoa.',
        type: 'success',
      });
    },
    // erro aparece dentro do formulário: um diálogo abriria atrás dele
    onError: (e: any) => setInlineError(e?.message || 'Não foi possível anonimizar.'),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportCustomerData(customerId);
      await saveJson(data, `dados-cliente-${customerId}.json`);
      if (isAdmin) queryClient.invalidateQueries({ queryKey: ['customer-access-log', customerId] });
    } catch (e: any) {
      setDialog({ title: 'Erro', message: e?.message || 'Não foi possível exportar.', type: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  if (!canExport && !isAdmin) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={brandingColors.primary} />
        </View>
        <Text style={styles.cardTitle}>Privacidade (LGPD)</Text>
      </View>
      <Text style={styles.hint}>
        Use quando a cliente pedir os dados dela ou pedir para ser apagada do cadastro.
      </Text>

      {canExport && (
        <TouchableOpacity style={styles.row} onPress={handleExport} disabled={exporting} activeOpacity={0.75}>
          <Ionicons name="download-outline" size={20} color={brandingColors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{exporting ? 'Exportando...' : 'Exportar dados da cliente'}</Text>
            <Text style={styles.rowSub}>Arquivo com cadastro, compras, condicionais e conversas</Text>
          </View>
        </TouchableOpacity>
      )}

      {isAdmin && (
        <TouchableOpacity style={styles.row} onPress={() => setShowLog(true)} activeOpacity={0.75}>
          <Ionicons name="eye-outline" size={20} color={brandingColors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Quem acessou</Text>
            <Text style={styles.rowSub}>Quem abriu, alterou ou exportou este cadastro</Text>
          </View>
        </TouchableOpacity>
      )}

      {isAdmin && (
        <TouchableOpacity
          style={styles.row}
          onPress={() => { setConfirmText(''); setInlineError(''); setShowAnonymize(true); }}
          activeOpacity={0.75}
        >
          <Ionicons name="person-remove-outline" size={20} color={Colors.light.error} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: Colors.light.error }]}>Anonimizar cliente</Text>
            <Text style={styles.rowSub}>Apaga nome, contato, CPF e endereço. Não tem volta.</Text>
          </View>
        </TouchableOpacity>
      )}

      <BottomSheet
        visible={showLog}
        onDismiss={() => setShowLog(false)}
        title="Quem acessou"
        subtitle="Mais recente primeiro"
        icon="eye-outline"
        actions={[{ label: 'Fechar', onPress: () => setShowLog(false), variant: 'secondary' }]}
      >
        {loadingLog ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : log.length === 0 ? (
          <Text style={styles.hint}>Nenhum acesso registrado ainda.</Text>
        ) : (
          log.map((entry, i) => (
            <View key={i} style={styles.logRow}>
              <Text style={styles.logAction}>{entry.acao}</Text>
              <Text style={styles.logMeta}>
                {formatDateTime(entry.data)} · {entry.usuario || 'usuário removido'}
              </Text>
            </View>
          ))
        )}
      </BottomSheet>

      <BottomSheet
        visible={showAnonymize}
        onDismiss={() => setShowAnonymize(false)}
        title="Anonimizar cliente"
        subtitle="Não tem volta"
        icon="person-remove-outline"
        actions={[
          { label: 'Voltar', onPress: () => setShowAnonymize(false), variant: 'secondary' },
          {
            label: 'Anonimizar',
            onPress: () => {
              if (confirmText.trim().toUpperCase() !== 'ANONIMIZAR') {
                setInlineError('Digite ANONIMIZAR para confirmar.');
                return;
              }
              setInlineError('');
              anonymizeMutation.mutate();
            },
            variant: 'danger',
            loading: anonymizeMutation.isPending,
          },
        ]}
      >
        <Text style={styles.sheetText}>
          Nome, e-mail, telefone, CPF, nascimento e endereço serão apagados, inclusive o endereço dos envios
          condicionais e as conversas do WhatsApp com este número. As vendas continuam no caixa e nos relatórios,
          sem identificar a pessoa.
        </Text>
        <Text style={styles.sheetText}>
          Antes, se a cliente pediu os dados dela, use "Exportar dados da cliente".
        </Text>
        <Text style={styles.label}>Para confirmar, digite ANONIMIZAR</Text>
        <TextInput
          value={confirmText}
          onChangeText={(t) => { setConfirmText(t); if (inlineError) setInlineError(''); }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ANONIMIZAR"
          placeholderTextColor={Colors.light.textTertiary}
          style={[styles.input, !!inlineError && { borderColor: Colors.light.error }]}
          accessibilityLabel="Confirmação da anonimização"
        />
        {!!inlineError && <Text style={styles.error}>{inlineError}</Text>}
      </BottomSheet>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        type={dialog?.type || 'success'}
        confirmText="OK"
        cancelText=""
        onConfirm={() => {
          const wasSuccess = dialog?.type === 'success';
          setDialog(null);
          if (wasSuccess) onAnonymized();
        }}
        onCancel={() => setDialog(null)}
      />
    </View>
  );
}

const createStyles = (_brand: string) => StyleSheet.create({
  // mesmo visual dos cartões da ficha do cliente
  card: {
    marginBottom: 16,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    ...theme.shadows.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardHeaderIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardTitle: { fontWeight: '600', color: Colors.light.text },
  hint: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 18, marginBottom: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  rowSub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  logRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  logAction: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  logMeta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  sheetText: { fontSize: 14, color: Colors.light.text, lineHeight: 20, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary, marginTop: 4, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: Colors.light.border, borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 14, height: 48, fontSize: 16, color: Colors.light.text, backgroundColor: Colors.light.card,
  },
  error: { marginTop: 6, fontSize: 13, color: Colors.light.error },
});

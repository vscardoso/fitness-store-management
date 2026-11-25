/**
 * Despesa (detalhe). Lê primeiro, corrige depois:
 *  1. Resumo no topo: valor, descrição, categoria e dia, de onde saiu o dinheiro, quem lançou e, se houver, o pedido de aprovação
 *     em andamento ou a sugestão de que isto é retirada (antes essas respostas ficavam abaixo da dobra, depois do formulário).
 *  2. "Corrigir": valor, descrição, dia e categoria; observação e gasto fixo ficam em "Mais opções".
 *  3. Conta de onde saiu o dinheiro e vínculo com lote não mudam aqui (só leitura no resumo); para trocar, exclui e lança de novo.
 * Salvar fica num rodapé fixo; Excluir (só admin) fica separado no fim, com o aviso do que acontece em despesa paga por banco.
 */
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Text, Switch } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { FormFooter, FormSection, MoreOptions } from '@/components/expenses/FormParts';
import { ApprovalNotice, CategoryDot, CategoryField, OwnerDrawNotice } from '@/components/expenses/ExpenseParts';
import { Money } from '@/components/ui/PriceDisplay';
import { accountLine } from '@/utils/expenseLogic';
import { formatDateOnly } from '@/utils/dateOnly';
import FormGrid from '@/components/layout/FormGrid';
import {
  getExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
} from '@/services/expenseService';
import { getFinanceOverview } from '@/services/financeService';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { maskCurrencyBR, unmaskCurrency, toBRNumber } from '@/utils/priceFormatter';
import { formatCurrency } from '@/utils/format';
import type { ExpenseCategory, ExpenseUpdate } from '@/types/expense';
import { parseApiError } from '@/utils/apiError';
import { dateToIso } from '@/utils/dateBr';
import { useAuth } from '@/hooks/useAuth';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { isAdminRole } from '@/utils/roles';
import ScreenLoader from '@/components/ui/ScreenLoader';

/** Converte YYYY-MM-DD → Date (horário meio-dia para evitar bug de fuso) */
const isoToDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

export default function EditExpenseScreen() {
  const brandingColors = useBrandingColors();
  const desktopContent = useDesktopContentStyle();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const expenseId = Number(id);
  const queryClient = useQueryClient();
  // Excluir despesa é só do admin no servidor (permissions.py)
  const { user } = useAuth();
  const canDelete = isAdminRole(user?.role);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const [errorDialog, setErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: expense, isLoading } = useQuery({
    queryKey: ['expense', expenseId],
    queryFn: () => getExpense(expenseId),
    enabled: !isNaN(expenseId),
  });

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: getExpenseCategories,
  });

  // só para dizer, por extenso, de qual conta saiu o dinheiro (leitura)
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const paidWith = finance?.accounts.find((a) => a.id === expense?.account_id)?.name;
  const acc = expense ? accountLine(expense, paidWith, !!finance?.started) : null;

  useEffect(() => {
    if (expense) {
      // Converter para formatos mascarados dos inputs
      setAmount(toBRNumber(Number(expense.amount)));
      setDescription(expense.description);
      setExpenseDate(isoToDate(expense.expense_date));
      setNotes(expense.notes ?? '');
      setIsRecurring(expense.is_recurring);
      setRecurrenceDay(expense.recurrence_day ? String(expense.recurrence_day) : '');
      setSelectedCategory(expense.category ?? null);
    }
  }, [expense]);

  const updateMutation = useMutation({
    mutationFn: (data: ExpenseUpdate) => updateExpense(expenseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-result'] });
      router.replace('/(tabs)/expenses');
    },
    onError: (err: any) => {
      setErrorMessage(parseApiError(err) || 'Não foi possível salvar.');
      setErrorDialog(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExpense(expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-result'] });
      router.replace('/(tabs)/expenses');
    },
    onError: (err: any) => {
      setDeleteConfirm(false);
      setErrorMessage(parseApiError(err) || 'Não foi possível excluir.');
      setErrorDialog(true);
    },
  });

  const handleSave = () => {
    const parsedAmount = unmaskCurrency(amount);

    if (!description.trim()) {
      setErrorMessage('Informe a descrição.');
      setErrorDialog(true);
      return;
    }
    if (parsedAmount <= 0) {
      setErrorMessage('Valor inválido.');
      setErrorDialog(true);
      return;
    }
    if (!expenseDate) {
      setErrorMessage('Selecione a data da despesa.');
      setErrorDialog(true);
      return;
    }

    updateMutation.mutate({
      amount: parsedAmount,
      description: description.trim(),
      expense_date: dateToIso(expenseDate),
      notes: notes.trim() || null,
      is_recurring: isRecurring,
      recurrence_day: isRecurring && recurrenceDay ? parseInt(recurrenceDay) : null,
      category_id: selectedCategory?.id ?? null,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Editar Despesa" showBackButton />
        <ScreenLoader message="Carregando despesa..." />
      </View>
    );
  }

  const moreFilled = [notes.trim() ? 'observação' : null, isRecurring ? 'gasto fixo' : null].filter(Boolean).join(', ');
  // Pedido de aprovação em andamento: a despesa fica só para leitura até os administradores decidirem (o servidor também recusa)
  const locked = !!expense?.pending_approval;
  const paidByBank = !!expense?.account_id && finance?.accounts.find((a) => a.id === expense.account_id)?.kind === 'bank';
  const created = [expense?.created_by_name ? `Lançada por ${expense.created_by_name}` : null].filter(Boolean).join(' ');

  return (
    <View style={styles.container}>
      <PageHeader title="Despesa" showBackButton />

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, desktopContent]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* 1. Resumo: as respostas antes do formulário */}
          {!!expense && (
            <View style={styles.summaryCard} testID="expense-detail-summary">
              <View style={styles.summaryTop}>
                <CategoryDot category={expense.category} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.summaryTitle} numberOfLines={2}>{expense.description}</Text>
                  <Text style={styles.summaryMeta} numberOfLines={1}>
                    {[expense.category?.name ?? 'Sem categoria', formatDateOnly(expense.expense_date) ?? expense.expense_date].join(' · ')}
                  </Text>
                </View>
              </View>
              <Money style={styles.summaryValue} value={Number(expense.amount)} />
              {!!acc && (
                <View style={styles.factRow}>
                  <Ionicons
                    name={acc.tone === 'ok' ? 'checkmark-circle-outline' : acc.tone === 'warn' ? 'alert-circle-outline' : 'layers-outline'}
                    size={18} color={acc.tone === 'warn' ? Colors.light.warningDark : Colors.light.textSecondary} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.factText}>{acc.text}</Text>
                    {!!acc.detail && <Text style={styles.help}>{acc.detail}</Text>}
                  </View>
                </View>
              )}
              {!expense.stock_entry_id && (
                <View style={styles.factRow}>
                  <Ionicons name="stats-chart-outline" size={18} color={Colors.light.textSecondary} style={{ marginTop: 1 }} />
                  <Text style={[styles.factText, { flex: 1 }]}>Entra no resultado do mês</Text>
                </View>
              )}
              {expense.is_recurring && (
                <View style={styles.factRow}>
                  <Ionicons name="repeat" size={18} color={Colors.light.textSecondary} style={{ marginTop: 1 }} />
                  <Text style={[styles.factText, { flex: 1 }]}>{expense.recurrence_day ? `Gasto fixo, todo dia ${expense.recurrence_day}` : 'Gasto fixo'}</Text>
                </View>
              )}
              {!!created && <Text style={styles.help}>{created}</Text>}
            </View>
          )}
          {!!expense?.pending_approval && <ApprovalNotice pending={expense.pending_approval} onOpen={() => router.push('/finance/approvals' as any)} />}
          {!expense?.stock_entry_id && (
            <OwnerDrawNotice text={`${description} ${expense?.description ?? ''}`} onOpenDraws={() => router.push('/finance/entries' as any)} />
          )}

          {/* 2. Corrigir */}
          <FormGrid>
            <FormSection title="Corrigir">
              <TextInput
                label="Valor *"
                value={amount}
                disabled={locked}
                onChangeText={(t) => setAmount(maskCurrencyBR(t))}
                mode="outlined"
                keyboardType="numeric"
                left={<TextInput.Affix text="R$" />}
                style={styles.input}
              />
              <TextInput
                label="Descrição *"
                value={description}
                disabled={locked}
                onChangeText={setDescription}
                mode="outlined"
                style={styles.input}
              />
              <DateTimeInput
                label="Data do pagamento *"
                value={expenseDate}
                onChange={(d) => d && setExpenseDate(d)}
                mode="date"
                maximumDate={new Date()}
                disabled={locked}
              />
              <CategoryField categories={categories ?? []} value={selectedCategory} onChange={setSelectedCategory} disabled={locked} />
              {(!!expense?.account_id || !!expense?.stock_entry_id) && (
                <Text style={styles.help}>A conta de onde saiu o dinheiro e o lote não mudam aqui. Para trocar, exclua a despesa e lance de novo.</Text>
              )}
            </FormSection>

            <MoreOptions
              title="Mais opções"
              filled={moreFilled || 'observação, gasto fixo'}
              open={moreOpen}
              onToggle={() => setMoreOpen((v) => !v)}
            >
              <TextInput
                label="Observações"
                value={notes}
                disabled={locked}
                onChangeText={setNotes}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={styles.input}
              />
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Despesa Recorrente</Text>
                  <Text style={styles.help}>Marca como gasto fixo do mês. O app não lança o próximo sozinho.</Text>
                </View>
                <Switch value={isRecurring} onValueChange={setIsRecurring} color={brandingColors.primary} disabled={locked} />
              </View>
              {isRecurring && (
                <TextInput
                  label="Dia do mês (1–31)"
                  disabled={locked}
                  value={recurrenceDay}
                  onChangeText={setRecurrenceDay}
                  mode="outlined"
                  keyboardType="numeric"
                  placeholder="Ex: 5"
                  style={styles.input}
                />
              )}
            </MoreOptions>
          </FormGrid>

          {canDelete && (
            <View style={{ gap: 6 }}>
              <AppButton
                variant="danger-outline" size="md" fullWidth icon="trash-outline" label="Excluir Despesa"
                onPress={() => setDeleteConfirm(true)} disabled={deleteMutation.isPending || !!expense?.pending_approval}
              />
              {paidByBank && !expense?.pending_approval && (
                <Text style={styles.help}>Despesa paga por banco: o app pede um motivo e a aprovação dos administradores antes de apagar.</Text>
              )}
              {!!expense?.pending_approval && <Text style={styles.help}>Já existe um pedido em andamento para esta despesa.</Text>}
            </View>
          )}
        </ScrollView>

        <FormFooter
          primaryLabel="Salvar Alterações"
          onPrimary={handleSave}
          disabled={locked}
          hint={locked ? 'Em análise: não dá para mudar até os administradores decidirem.' : undefined}
          loading={updateMutation.isPending}
          onSecondary={() => router.back()}
        />
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={errorDialog}
        type="danger"
        icon="alert-circle-outline"
        title="Atenção"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setErrorDialog(false)}
      />

      <ConfirmDialog
        visible={deleteConfirm}
        type="danger"
        icon="trash-outline"
        title="Excluir Despesa"
        message="Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        cancelText="Cancelar"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleteConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  keyboardView: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl, gap: theme.spacing.sm },
  input: { backgroundColor: Colors.light.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  help: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  summaryCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, gap: 10, marginBottom: theme.spacing.xs,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryTitle: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  summaryMeta: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  summaryValue: { fontSize: theme.fontSize.xxxl, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text, letterSpacing: -0.5 },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  factText: { fontSize: theme.fontSize.md, color: Colors.light.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  switchLabel: { fontSize: 15, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
});

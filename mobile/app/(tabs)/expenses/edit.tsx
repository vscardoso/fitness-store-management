/**
 * Editar despesa. O gasto (valor, descrição, dia, categoria) vem primeiro; observação e gasto fixo ficam em "Mais opções".
 * Conta de onde saiu o dinheiro e vínculo com lote não mudam aqui: aparecem só para leitura, com a saída (excluir e lançar de novo).
 * Salvar fica num rodapé fixo; Excluir (só admin) fica separado no fim, longe do botão principal.
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
import { ChoiceChip, FormFooter, FormSection, MoreOptions } from '@/components/expenses/FormParts';
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
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview, enabled: !!expense?.account_id });
  const paidWith = finance?.accounts.find((a) => a.id === expense?.account_id)?.name;

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

  const parsedNow = unmaskCurrency(amount);
  const summary = [parsedNow > 0 ? formatCurrency(parsedNow) : null, description.trim() || null].filter(Boolean).join(' · ');
  const moreFilled = [notes.trim() ? 'observação' : null, isRecurring ? 'gasto fixo' : null].filter(Boolean).join(', ');
  const locked: string[] = [];
  if (expense?.stock_entry_id) locked.push('Gasto de um lote: soma no custo das peças dele');
  if (expense?.account_id) locked.push(paidWith ? `Pago com ${paidWith}` : 'Pago com uma conta do Financeiro');

  return (
    <View style={styles.container}>
      <PageHeader title={description || 'Editar Despesa'} subtitle={expense?.category?.name} showBackButton />

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, desktopContent]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          <FormGrid>
            <FormSection title="O gasto">
              <TextInput
                label="Valor *"
                value={amount}
                onChangeText={(t) => setAmount(maskCurrencyBR(t))}
                mode="outlined"
                keyboardType="numeric"
                left={<TextInput.Affix text="R$" />}
                style={styles.input}
              />
              <TextInput
                label="Descrição *"
                value={description}
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
              />
              {(categories ?? []).length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Categoria</Text>
                  <View style={styles.chips}>
                    {(categories ?? []).map((cat) => {
                      const selected = selectedCategory?.id === cat.id;
                      return (
                        <ChoiceChip
                          key={cat.id}
                          label={cat.name}
                          icon={cat.icon as any}
                          color={cat.color}
                          selected={selected}
                          onPress={() => setSelectedCategory(selected ? null : cat)}
                        />
                      );
                    })}
                  </View>
                </>
              )}
            </FormSection>

            {locked.length > 0 && (
              <FormSection title="Não muda aqui">
                {locked.map((line) => (
                  <View key={line} style={styles.lockedRow}>
                    <Ionicons name="lock-closed-outline" size={16} color={Colors.light.textSecondary} />
                    <Text style={styles.lockedText}>{line}</Text>
                  </View>
                ))}
                <Text style={styles.help}>Para trocar, exclua a despesa e lance de novo.</Text>
              </FormSection>
            )}

            <MoreOptions
              title="Mais opções"
              filled={moreFilled || 'observação, gasto fixo'}
              open={moreOpen}
              onToggle={() => setMoreOpen((v) => !v)}
            >
              <TextInput
                label="Observações"
                value={notes}
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
                <Switch value={isRecurring} onValueChange={setIsRecurring} color={brandingColors.primary} />
              </View>
              {isRecurring && (
                <TextInput
                  label="Dia do mês (1–31)"
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
            <AppButton
              variant="danger-outline" size="md" fullWidth icon="trash-outline" label="Excluir Despesa"
              onPress={() => setDeleteConfirm(true)} disabled={deleteMutation.isPending}
            />
          )}
        </ScrollView>

        <FormFooter
          summary={summary}
          primaryLabel="Salvar Alterações"
          onPrimary={handleSave}
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
  fieldLabel: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary, marginTop: theme.spacing.xs },
  help: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedText: { fontSize: theme.fontSize.md, color: Colors.light.text, flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  switchLabel: { fontSize: 15, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
});

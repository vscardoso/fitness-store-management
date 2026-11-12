/**
 * Nova despesa. Ordem pensada para o lançamento comum (um gasto da loja, pago hoje):
 *  1. O gasto: valor, descrição, categoria e dia do pagamento.
 *  2. Como foi pago: a conta de onde saiu o dinheiro, ou "Vou pagar depois" com o vencimento (só com o Financeiro implantado).
 *  3. Mais opções (recolhidas): observação, gasto fixo e gasto de lote.
 * O botão Salvar fica num rodapé fixo, com o resumo do que vai ser gravado.
 */
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Text, Switch } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { ChoiceChip, FormFooter, FormSection, MoreOptions } from '@/components/expenses/FormParts';
import { createExpense, getExpenseCategories } from '@/services/expenseService';
import { getStockEntries } from '@/services/stockEntryService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import type { ExpenseCategory, ExpenseCreate } from '@/types/expense';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { createPayable, getFinanceOverview } from '@/services/financeService';
import FormGrid from '@/components/layout/FormGrid';
import { parseApiError } from '@/utils/apiError';
import { dateToIso } from '@/utils/dateBr';

export default function CreateExpenseScreen() {
  const desktopContent = useDesktopContentStyle();
  const brandingColors = useBrandingColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  // De onde vem a despesa: da loja (aluguel, luz), ou de um lote (frete da compra)
  const [scope, setScope] = useState<'general' | 'lot'>('general');
  // Financeiro implantado: de qual conta saiu o dinheiro (gaveta, banco); sem escolher, só entra no resultado do mês
  const [accountId, setAccountId] = useState<number | null>(null);
  // "Vou pagar depois": vira despesa a pagar (entra no resultado do mês quando for paga)
  const [payLater, setPayLater] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const payAccounts = (finance?.accounts ?? []).filter((a) => a.kind !== 'card');
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);

  const { data: lots } = useQuery({
    queryKey: ['expense-scope-lots'],
    queryFn: () => getStockEntries({ limit: 30 }),
    enabled: scope === 'lot',
  });

  const [errorDialog, setErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: getExpenseCategories,
  });

  const laterMutation = useMutation({
    mutationFn: createPayable,
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.replace('/finance/payables' as any);
    },
    onError: (err: any) => {
      setErrorMessage(parseApiError(err) || 'Não foi possível salvar a despesa a pagar.');
      setErrorDialog(true);
    },
  });

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-result'] });
      queryClient.invalidateQueries({ queryKey: ['lot-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['lot-costs'] });
      queryClient.invalidateQueries({ queryKey: ['lot-profit-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      router.replace('/(tabs)/expenses');
    },
    onError: (err: any) => {
      setErrorMessage(parseApiError(err) || 'Não foi possível salvar a despesa.');
      setErrorDialog(true);
    },
  });

  const handleSave = () => {
    const parsedAmount = unmaskCurrency(amount);

    if (!description.trim()) {
      setErrorMessage('Informe a descrição da despesa.');
      setErrorDialog(true);
      return;
    }
    if (parsedAmount <= 0) {
      setErrorMessage('Informe um valor válido.');
      setErrorDialog(true);
      return;
    }

    if (scope === 'lot' && !selectedEntryId) {
      setErrorMessage('Escolha de qual lote é esta despesa.');
      setErrorDialog(true);
      return;
    }

    if (payLater) {
      if (scope !== 'general') {
        setErrorMessage('Gasto de lote a pagar: lance quando pagar (ele entra no custo das peças).');
        setErrorDialog(true);
        return;
      }
      if (!dueDate) {
        setErrorMessage('Informe o vencimento.');
        setErrorDialog(true);
        return;
      }
      laterMutation.mutate({
        description: description.trim(), amount: parsedAmount, due_date: dateToIso(dueDate), notes: notes.trim() || null,
        counts_as_expense: true, expense_category_id: selectedCategory?.id ?? null,
      });
      return;
    }

    const payload: ExpenseCreate = {
      amount: parsedAmount,
      description: description.trim(),
      expense_date: dateToIso(expenseDate),
      notes: notes.trim() || null,
      is_recurring: isRecurring,
      recurrence_day: isRecurring && recurrenceDay ? parseInt(recurrenceDay) : null,
      category_id: selectedCategory?.id ?? null,
      stock_entry_id: scope === 'lot' ? selectedEntryId : null,
      account_id: accountId,
    };
    createMutation.mutate(payload);
  };

  // O que vai ser gravado, por extenso (aparece no rodapé)
  const parsedNow = unmaskCurrency(amount);
  const accountName = payAccounts.find((a) => a.id === accountId)?.name;
  const summary = [
    parsedNow > 0 ? formatCurrency(parsedNow) : null,
    description.trim() || null,
    payLater ? (dueDate ? `a pagar em ${dueDate.toLocaleDateString('pt-BR')}` : 'a pagar depois') : accountName ? `sai de ${accountName}` : null,
  ].filter(Boolean).join(' · ');
  const moreFilled = [
    notes.trim() ? 'observação' : null,
    isRecurring ? 'gasto fixo' : null,
    scope === 'lot' ? 'gasto de lote' : null,
  ].filter(Boolean).join(', ');
  const saving = createMutation.isPending || laterMutation.isPending;

  return (
    <View style={styles.container}>
      <PageHeader title="Nova Despesa" showBackButton />

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
                placeholder="0,00"
                left={<TextInput.Affix text="R$" />}
                style={styles.input}
              />
              <TextInput
                label="Descrição *"
                value={description}
                onChangeText={setDescription}
                mode="outlined"
                placeholder="Ex: Aluguel do mês, Conta de luz..."
                style={styles.input}
              />
              {/* vai pagar depois: a data é a do pagamento, informada ao pagar */}
              {!payLater && (
                <DateTimeInput
                  label="Data do pagamento *"
                  value={expenseDate}
                  onChange={(d) => d && setExpenseDate(d)}
                  mode="date"
                  maximumDate={new Date()}
                />
              )}
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

            {/* Pago com: tira da conta escolhida (só com o financeiro implantado) */}
            {finance?.started && payAccounts.length > 0 && (
              <FormSection title="Pago com" subtitle="De onde saiu o dinheiro">
                <View style={styles.chips}>
                  {[...payAccounts.map((a) => ({ id: a.id as number | null, name: a.name, later: false })),
                    { id: null as number | null, name: 'Vou pagar depois', later: true }].map((a) => {
                    const on = a.later ? payLater : !payLater && accountId === a.id;
                    return (
                      <ChoiceChip
                        key={a.later ? 'depois' : String(a.id)}
                        label={a.name}
                        selected={on}
                        onPress={() => { setPayLater(a.later); setAccountId(a.later ? null : a.id); }}
                      />
                    );
                  })}
                </View>
                {payLater ? (
                  <>
                    <DateTimeInput label="Vencimento" value={dueDate} onChange={setDueDate} mode="date" />
                    <Text style={styles.help}>Fica em Despesas a pagar; quando você pagar, entra no resultado do mês e sai da conta escolhida.</Text>
                  </>
                ) : accountId === null ? (
                  <Text style={styles.help}>Escolha a conta, ou “Vou pagar depois”. Sem escolher, o saldo das contas não muda.</Text>
                ) : null}
              </FormSection>
            )}

            <MoreOptions
              title="Mais opções"
              filled={moreFilled || 'observação, gasto fixo, gasto de lote'}
              open={moreOpen}
              onToggle={() => setMoreOpen((v) => !v)}
            >
              <TextInput
                label="Observações"
                value={notes}
                onChangeText={setNotes}
                mode="outlined"
                placeholder="Notas adicionais (opcional)"
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

              <Text style={styles.fieldLabel}>De onde vem este gasto?</Text>
              <View style={styles.chips}>
                <ChoiceChip label="Da loja" icon="storefront-outline" selected={scope === 'general'} onPress={() => setScope('general')} />
                <ChoiceChip label="De um lote" icon="layers-outline" selected={scope === 'lot'} onPress={() => setScope('lot')} />
              </View>
              {scope === 'lot' && (
                <Text style={styles.help}>
                  Gasto de uma compra, como frete, embalagem ou taxa. Soma no custo das peças daquele lote e só pesa no resultado quando elas forem vendidas.
                </Text>
              )}
              {scope === 'lot' &&
                (lots ?? []).map((l) => (
                  <View key={l.id} style={styles.pickRow}>
                    <ChoiceChip
                      label={`${l.entry_code} · ${l.supplier_name} · ${formatCurrency(Number(l.total_cost) || 0)}`}
                      selected={selectedEntryId === l.id}
                      onPress={() => setSelectedEntryId(l.id)}
                    />
                  </View>
                ))}
              {scope === 'lot' && lots && lots.length === 0 && (
                <View style={styles.emptyLots}>
                  <Ionicons name="information-circle-outline" size={18} color={Colors.light.textSecondary} />
                  <Text style={styles.help}>Você ainda não tem nenhum lote cadastrado.</Text>
                </View>
              )}
            </MoreOptions>
          </FormGrid>
        </ScrollView>

        <FormFooter
          summary={summary}
          primaryLabel="Salvar Despesa"
          onPrimary={handleSave}
          loading={saving}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  keyboardView: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  input: { backgroundColor: Colors.light.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary, marginTop: theme.spacing.xs },
  help: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  switchLabel: { fontSize: 15, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  pickRow: { flexDirection: 'row' },
  emptyLots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

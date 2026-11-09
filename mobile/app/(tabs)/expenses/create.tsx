import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TextInput, Button, Text, Switch } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
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

  return (
    <View style={styles.container}>
      <PageHeader
        title="Nova Despesa"
        showBackButton
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, desktopContent]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >

          <FormGrid>
{/* Valor e Descrição */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="receipt-outline" size={20} color={brandingColors.primary} />
              <Text style={styles.cardTitle}>Dados da Despesa</Text>
            </View>
            <View style={styles.cardContent}>
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

              <TextInput
                label="Observações"
                value={notes}
                onChangeText={setNotes}
                mode="outlined"
                placeholder="Notas adicionais (opcional)"
                multiline
                numberOfLines={3}
                style={[styles.input, { marginBottom: 0 }]}
              />
            </View>
          </View>

          {/* Pago com: tira da conta escolhida (só com o financeiro implantado) */}
          {finance?.started && payAccounts.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="wallet-outline" size={20} color={brandingColors.primary} />
                <Text style={styles.cardTitle}>Pago com</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.categoryGrid}>
                  {[...payAccounts.map((a) => ({ id: a.id as number | null, name: a.name, later: false })),
                    { id: null as number | null, name: 'Vou pagar depois', later: true }].map((a) => {
                    const on = a.later ? payLater : !payLater && accountId === a.id;
                    return (
                      <TouchableOpacity
                        key={a.later ? 'depois' : String(a.id)}
                        style={[styles.categoryChip, { borderColor: brandingColors.primary }, on && { backgroundColor: brandingColors.primary }]}
                        onPress={() => { setPayLater(a.later); setAccountId(a.later ? null : a.id); }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[styles.categoryChipText, { color: on ? '#fff' : Colors.light.text }]}>{a.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {payLater ? (
                  <>
                    <DateTimeInput label="Vencimento" value={dueDate} onChange={setDueDate} mode="date" />
                    <Text style={styles.scopeHelp}>Fica em Despesas a pagar; quando você pagar, entra no resultado do mês e sai da conta escolhida.</Text>
                  </>
                ) : accountId === null ? (
                  <Text style={styles.scopeHelp}>Escolha de onde saiu o dinheiro, ou "Vou pagar depois".</Text>
                ) : null}
              </View>
            </View>
          )}

          {/* De onde vem a despesa */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="git-branch-outline" size={20} color={brandingColors.primary} />
              <Text style={styles.cardTitle}>De onde vem este gasto?</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.categoryGrid}>
                {([
                  ['general', 'Da loja', 'storefront-outline'],
                  ['lot', 'De um lote', 'layers-outline'],
                ] as const).map(([key, label, icon]) => {
                  const on = scope === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.categoryChip, { borderColor: brandingColors.primary }, on && { backgroundColor: brandingColors.primary }]}
                      onPress={() => setScope(key)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={icon} size={16} color={on ? '#fff' : brandingColors.primary} />
                      <Text style={[styles.categoryChipText, { color: on ? '#fff' : Colors.light.text }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.scopeHelp}>
                {scope === 'general' &&
                  'Gastos do dia a dia da loja, como aluguel, luz, internet e salários. Eles aparecem no resultado do mês em que você pagou.'}
                {scope === 'lot' &&
                  'Gasto de uma compra específica, como frete, embalagem ou taxa. Ele soma no custo das peças daquele lote e só pesa no resultado quando as peças forem vendidas.'}
              </Text>

              {scope === 'lot' &&
                (lots ?? []).map((l) => (
                  <TouchableOpacity key={l.id} style={styles.pickRow} onPress={() => setSelectedEntryId(l.id)} activeOpacity={0.75}>
                    <Ionicons
                      name={selectedEntryId === l.id ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={brandingColors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickTitle}>{l.entry_code}</Text>
                      <Text style={styles.pickSub}>
                        {l.supplier_name} · {formatCurrency(Number(l.total_cost) || 0)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              {scope === 'lot' && lots && lots.length === 0 && (
                <Text style={styles.scopeHelp}>Você ainda não tem nenhum lote cadastrado.</Text>
              )}
            </View>
          </View>

          {/* Categoria */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="list-outline" size={20} color={brandingColors.primary} />
              <Text style={styles.cardTitle}>Categoria</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.categoryGrid}>
                {(categories ?? []).map((cat) => {
                  const selected = selectedCategory?.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        { borderColor: cat.color },
                        selected && { backgroundColor: cat.color },
                      ]}
                      onPress={() => setSelectedCategory(selected ? null : cat)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={16}
                        color={selected ? '#fff' : cat.color}
                      />
                      <Text style={[styles.categoryChipText, { color: selected ? '#fff' : Colors.light.text }]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Recorrência */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="repeat-outline" size={20} color={brandingColors.primary} />
              <Text style={styles.cardTitle}>Recorrência</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Despesa Recorrente</Text>
                  <Text style={styles.switchSubtitle}>Marca como gasto fixo do mês. O app não lança o próximo sozinho.</Text>
                </View>
                <Switch
                  value={isRecurring}
                  onValueChange={setIsRecurring}
                  color={brandingColors.primary}
                />
              </View>
              {isRecurring && (
                <TextInput
                  label="Dia do mês (1–31)"
                  value={recurrenceDay}
                  onChangeText={setRecurrenceDay}
                  mode="outlined"
                  keyboardType="numeric"
                  placeholder="Ex: 5"
                  style={[styles.input, { marginTop: theme.spacing.md, marginBottom: 0 }]}
                />
              )}
            </View>
          </View>

</FormGrid>

          {/* Botões de ação */}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={() => router.back()}
              style={[styles.button, { borderColor: brandingColors.primary }]}
              textColor={brandingColors.primary}
              disabled={createMutation.isPending || laterMutation.isPending}
            >
              Cancelar
            </Button>

            <Button
              mode="contained"
              onPress={handleSave}
              style={[styles.button, { backgroundColor: brandingColors.primary }]}
              loading={createMutation.isPending || laterMutation.isPending}
              disabled={createMutation.isPending || laterMutation.isPending}
              icon="check"
            >
              Salvar Despesa
            </Button>
          </View>

        </ScrollView>
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
  scopeHelp: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 10 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.light.border },
  pickTitle: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  pickSub: { fontSize: 12, color: Colors.light.textSecondary },
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: theme.spacing.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: '#fff',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  switchSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  button: {
    flex: 1,
    borderRadius: 12,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TextInput, Button, Text, Switch, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import {
  getExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
} from '@/services/expenseService';
import { Colors, theme } from '@/constants/Colors';
import { maskCurrencyBR, unmaskCurrency, toBRNumber } from '@/utils/priceFormatter';
import type { ExpenseCategory, ExpenseUpdate } from '@/types/expense';

/** Converte YYYY-MM-DD → Date (horário meio-dia para evitar bug de fuso) */
const isoToDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

export default function EditExpenseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const expenseId = Number(id);
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);

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
      router.back();
    },
    onError: (err: any) => {
      setErrorMessage(err?.response?.data?.detail || 'Não foi possível salvar.');
      setErrorDialog(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExpense(expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-result'] });
      router.back();
    },
    onError: (err: any) => {
      setDeleteConfirm(false);
      setErrorMessage(err?.response?.data?.detail || 'Não foi possível excluir.');
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
      expense_date: expenseDate.toISOString().split('T')[0],
      notes: notes.trim() || null,
      is_recurring: isRecurring,
      recurrence_day: isRecurring && recurrenceDay ? parseInt(recurrenceDay) : null,
      category_id: selectedCategory?.id ?? null,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Editar Despesa" showBackButton onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando despesa...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title={description || 'Editar Despesa'}
        subtitle={expense?.category?.name}
        showBackButton
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >

          {/* Valor e Descrição */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="receipt-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.cardTitle}>Dados da Despesa</Text>
            </View>
            <View style={styles.cardContent}>
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
                label="Data *"
                value={expenseDate}
                onChange={(d) => d && setExpenseDate(d)}
                mode="date"
                maximumDate={new Date()}
              />

              <TextInput
                label="Observações"
                value={notes}
                onChangeText={setNotes}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={[styles.input, { marginBottom: 0 }]}
              />
            </View>
          </View>

          {/* Categoria */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="list-outline" size={20} color={Colors.light.primary} />
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
              <Ionicons name="repeat-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.cardTitle}>Recorrência</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Despesa Recorrente</Text>
                  <Text style={styles.switchSubtitle}>Marca automaticamente todo mês</Text>
                </View>
                <Switch
                  value={isRecurring}
                  onValueChange={setIsRecurring}
                  color={Colors.light.primary}
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

          {/* Botões de ação */}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={() => router.back()}
              style={styles.button}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>

            <Button
              mode="contained"
              onPress={handleSave}
              style={[styles.button, styles.buttonPrimary]}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
              icon="check"
            >
              Salvar Alterações
            </Button>
          </View>

          {/* Excluir */}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.light.error} />
            <Text style={styles.deleteText}>Excluir Despesa</Text>
          </TouchableOpacity>

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
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
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
  },
  button: {
    flex: 1,
    borderRadius: 12,
  },
  buttonPrimary: {
    backgroundColor: Colors.light.primary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.error + '12',
    borderWidth: 1,
    borderColor: Colors.light.error + '30',
    padding: theme.spacing.md,
    borderRadius: 12,
    marginTop: theme.spacing.md,
  },
  deleteText: {
    color: Colors.light.error,
    fontWeight: '700',
    fontSize: 15,
  },
});

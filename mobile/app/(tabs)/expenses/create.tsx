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
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { createExpense, getExpenseCategories } from '@/services/expenseService';
import { Colors, theme } from '@/constants/Colors';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';
import type { ExpenseCategory, ExpenseCreate } from '@/types/expense';

export default function CreateExpenseScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);

  const [errorDialog, setErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: getExpenseCategories,
  });

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-result'] });
      router.back();
    },
    onError: (err: any) => {
      setErrorMessage(err?.response?.data?.detail || 'Não foi possível salvar a despesa.');
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

    const payload: ExpenseCreate = {
      amount: parsedAmount,
      description: description.trim(),
      expense_date: expenseDate.toISOString().split('T')[0],
      notes: notes.trim() || null,
      is_recurring: isRecurring,
      recurrence_day: isRecurring && recurrenceDay ? parseInt(recurrenceDay) : null,
      category_id: selectedCategory?.id ?? null,
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
                placeholder="Notas adicionais (opcional)"
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
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>

            <Button
              mode="contained"
              onPress={handleSave}
              style={[styles.button, styles.buttonPrimary]}
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
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
  buttonPrimary: {
    backgroundColor: Colors.light.primary,
  },
});

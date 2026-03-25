import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { Text, TextInput, Switch, Card, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import {
  getExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
} from '@/services/expenseService';
import { Colors, theme } from '@/constants/Colors';
import type { ExpenseCategory, ExpenseUpdate } from '@/types/expense';

export default function EditExpenseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const expenseId = Number(id);
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);

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
      setAmount(String(expense.amount));
      setDescription(expense.description);
      setExpenseDate(expense.expense_date);
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
      Alert.alert('Erro', err?.response?.data?.detail || 'Não foi possível salvar.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExpense(expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-result'] });
      router.back();
    },
  });

  const handleSave = () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) { Alert.alert('Atenção', 'Informe a descrição.'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { Alert.alert('Atenção', 'Valor inválido.'); return; }

    updateMutation.mutate({
      amount: parsedAmount,
      description: description.trim(),
      expense_date: expenseDate,
      notes: notes.trim() || null,
      is_recurring: isRecurring,
      recurrence_day: isRecurring && recurrenceDay ? parseInt(recurrenceDay) : null,
      category_id: selectedCategory?.id ?? null,
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Excluir Despesa',
      'Tem certeza que deseja excluir esta despesa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PageHeader
        title="Editar Despesa"
        showBackButton
        rightActions={[
          { icon: 'checkmark', onPress: handleSave },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.section}>
          <View style={styles.sectionContent}>
            <Text variant="labelMedium" style={styles.label}>Valor *</Text>
            <TextInput
              mode="outlined"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />}
              style={styles.input}
            />
            <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>Descrição *</Text>
            <TextInput
              mode="outlined"
              value={description}
              onChangeText={setDescription}
              style={styles.input}
            />
            <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>Data *</Text>
            <TextInput
              mode="outlined"
              value={expenseDate}
              onChangeText={setExpenseDate}
              keyboardType="numeric"
              style={styles.input}
            />
            <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>Observações</Text>
            <TextInput
              mode="outlined"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.input}
            />
          </View>
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionContent}>
            <Text variant="titleSmall" style={styles.sectionTitle}>Categoria</Text>
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
                    <Ionicons name={cat.icon as any} size={16} color={selected ? '#fff' : cat.color} />
                    <Text style={[styles.categoryChipText, selected && { color: '#fff' }]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionContent}>
            <View style={styles.switchRow}>
              <View>
                <Text variant="titleSmall" style={styles.sectionTitle}>Despesa Recorrente</Text>
                <Text variant="bodySmall" style={styles.switchSubtitle}>Marca automaticamente todo mês</Text>
              </View>
              <Switch value={isRecurring} onValueChange={setIsRecurring} color={Colors.light.primary} />
            </View>
            {isRecurring && (
              <>
                <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>Dia do mês (1–31)</Text>
                <TextInput
                  mode="outlined"
                  value={recurrenceDay}
                  onChangeText={setRecurrenceDay}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </>
            )}
          </View>
        </Card>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color={Colors.light.error} />
          <Text style={styles.deleteText}>Excluir Despesa</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  section: { borderRadius: theme.borderRadius.lg, elevation: 1, borderWidth: 1, borderColor: Colors.light.border },
  sectionContent: { padding: 16 },
  sectionTitle: { fontWeight: '700', color: Colors.light.text, marginBottom: 12 },
  label: { color: Colors.light.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.light.background },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  categoryChipText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchSubtitle: { color: Colors.light.textSecondary, marginTop: 2 },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.errorLight ?? '#FFEBEE',
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    marginTop: 8,
  },
  deleteText: { color: Colors.light.error, fontWeight: '700', fontSize: 15 },
});

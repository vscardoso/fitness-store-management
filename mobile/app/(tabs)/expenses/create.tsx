import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { Text, TextInput, Switch, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import { createExpense, getExpenseCategories } from '@/services/expenseService';
import { Colors, theme } from '@/constants/Colors';
import type { ExpenseCategory, ExpenseCreate } from '@/types/expense';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function CreateExpenseScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);

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
      Alert.alert('Erro', err?.response?.data?.detail || 'Não foi possível salvar a despesa.');
    },
  });

  const handleSave = () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) {
      Alert.alert('Atenção', 'Informe a descrição da despesa.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Atenção', 'Informe um valor válido.');
      return;
    }
    if (!expenseDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Atenção', 'Data inválida. Use o formato AAAA-MM-DD.');
      return;
    }

    const payload: ExpenseCreate = {
      amount: parsedAmount,
      description: description.trim(),
      expense_date: expenseDate,
      notes: notes.trim() || null,
      is_recurring: isRecurring,
      recurrence_day: isRecurring && recurrenceDay ? parseInt(recurrenceDay) : null,
      category_id: selectedCategory?.id ?? null,
    };
    createMutation.mutate(payload);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PageHeader
        title="Nova Despesa"
        showBackButton
        rightActions={[
          { icon: 'checkmark', onPress: handleSave },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Valor */}
        <Card style={styles.section}>
          <View style={styles.sectionContent}>
            <Text variant="labelMedium" style={styles.label}>Valor *</Text>
            <TextInput
              mode="outlined"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0,00"
              left={<TextInput.Affix text="R$" />}
              style={styles.input}
            />

            <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>Descrição *</Text>
            <TextInput
              mode="outlined"
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: Aluguel do mês, Conta de luz..."
              style={styles.input}
            />

            <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>Data *</Text>
            <TextInput
              mode="outlined"
              value={expenseDate}
              onChangeText={setExpenseDate}
              placeholder="AAAA-MM-DD"
              keyboardType="numeric"
              style={styles.input}
            />

            <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>Observações</Text>
            <TextInput
              mode="outlined"
              value={notes}
              onChangeText={setNotes}
              placeholder="Notas adicionais (opcional)"
              multiline
              numberOfLines={3}
              style={styles.input}
            />
          </View>
        </Card>

        {/* Categoria */}
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
                    <Ionicons
                      name={cat.icon as any}
                      size={16}
                      color={selected ? '#fff' : cat.color}
                    />
                    <Text style={[styles.categoryChipText, selected && { color: '#fff' }]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Card>

        {/* Recorrência */}
        <Card style={styles.section}>
          <View style={styles.sectionContent}>
            <View style={styles.switchRow}>
              <View>
                <Text variant="titleSmall" style={styles.sectionTitle}>Despesa Recorrente</Text>
                <Text variant="bodySmall" style={styles.switchSubtitle}>
                  Marca automaticamente todo mês
                </Text>
              </View>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                color={Colors.light.primary}
              />
            </View>
            {isRecurring && (
              <>
                <Text variant="labelMedium" style={[styles.label, { marginTop: 16 }]}>
                  Dia do mês (1–31)
                </Text>
                <TextInput
                  mode="outlined"
                  value={recurrenceDay}
                  onChangeText={setRecurrenceDay}
                  keyboardType="numeric"
                  placeholder="Ex: 5"
                  style={styles.input}
                />
              </>
            )}
          </View>
        </Card>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  section: {
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  sectionContent: { padding: 16 },
  sectionTitle: {
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  label: {
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  input: { backgroundColor: Colors.light.background },
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
    color: Colors.light.text,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchSubtitle: { color: Colors.light.textSecondary, marginTop: 2 },
});

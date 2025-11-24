import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, StatusBar, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';

import { createTrip } from '@/services/tripService';
import { TripCreate } from '@/types';
import { Colors } from '@/constants/Colors';
import { formatCurrency, parseCurrency } from '@/utils/format';

export default function AddTripScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tripCode, setTripCode] = useState('');
  const [tripDate, setTripDate] = useState(new Date());
  const [destination, setDestination] = useState('');
  const [departureTime, setDepartureTime] = useState<Date | undefined>();
  const [returnTime, setReturnTime] = useState<Date | undefined>();
  const [costFuel, setCostFuel] = useState('0,00');
  const [costFood, setCostFood] = useState('0,00');
  const [costToll, setCostToll] = useState('0,00');
  const [costHotel, setCostHotel] = useState('0,00');
  const [costOther, setCostOther] = useState('0,00');
  const [notes, setNotes] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  const [showReturnPicker, setShowReturnPicker] = useState(false);

  const createMutation = useMutation({
    mutationFn: createTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      Alert.alert('Sucesso', 'Viagem criada com sucesso!');
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao criar viagem');
    },
  });

  const handleSubmit = () => {
    if (!tripCode.trim()) {
      Alert.alert('Atenção', 'Informe o código da viagem');
      return;
    }

    if (tripCode.trim().length < 5) {
      Alert.alert('Atenção', 'O código da viagem deve ter no mínimo 5 caracteres');
      return;
    }

    if (!destination.trim()) {
      Alert.alert('Atenção', 'Informe o destino da viagem');
      return;
    }

    const tripData: TripCreate = {
      trip_code: tripCode.trim(),
      trip_date: tripDate.toISOString().split('T')[0],
      destination: destination.trim(),
      travel_cost_fuel: parseCurrency(costFuel),
      travel_cost_food: parseCurrency(costFood),
      travel_cost_toll: parseCurrency(costToll),
      travel_cost_hotel: parseCurrency(costHotel),
      travel_cost_other: parseCurrency(costOther),
      notes: notes.trim() || undefined,
    };

    if (departureTime) {
      tripData.departure_time = departureTime.toISOString();
    }

    if (returnTime) {
      tripData.return_time = returnTime.toISOString();
    }

    createMutation.mutate(tripData);
  };

  const totalCost = parseCurrency(costFuel) + parseCurrency(costFood) + 
                   parseCurrency(costToll) + parseCurrency(costHotel) + 
                   parseCurrency(costOther);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      {/* Header */}
      <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nova Viagem</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Informações Básicas */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informações Básicas</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Código da Viagem *</Text>
              <TextInput
                style={styles.input}
                value={tripCode}
                onChangeText={setTripCode}
                placeholder="Ex: VIAGEM-001 (mín. 5 caracteres)"
                placeholderTextColor={Colors.light.textSecondary}
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Data da Viagem *</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowDatePicker(true)}
              >
                <Text>{tripDate.toLocaleDateString('pt-BR')}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={tripDate}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (date) setTripDate(date);
                  }}
                />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Destino *</Text>
              <TextInput
                style={styles.input}
                value={destination}
                onChangeText={setDestination}
                placeholder="Ex: São Paulo - SP"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Horário Saída</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setShowDeparturePicker(true)}
                >
                  <Text>
                    {departureTime ? departureTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Selecionar'}
                  </Text>
                </TouchableOpacity>
                {showDeparturePicker && (
                  <DateTimePicker
                    value={departureTime || new Date()}
                    mode="time"
                    display="default"
                    onChange={(event, date) => {
                      setShowDeparturePicker(false);
                      if (date) setDepartureTime(date);
                    }}
                  />
                )}
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Horário Retorno</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setShowReturnPicker(true)}
                >
                  <Text>
                    {returnTime ? returnTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Selecionar'}
                  </Text>
                </TouchableOpacity>
                {showReturnPicker && (
                  <DateTimePicker
                    value={returnTime || new Date()}
                    mode="time"
                    display="default"
                    onChange={(event, date) => {
                      setShowReturnPicker(false);
                      if (date) setReturnTime(date);
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Custos da Viagem */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custos da Viagem</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Combustível</Text>
              <TextInput
                style={styles.input}
                value={costFuel}
                onChangeText={setCostFuel}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Alimentação</Text>
              <TextInput
                style={styles.input}
                value={costFood}
                onChangeText={setCostFood}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pedágios</Text>
              <TextInput
                style={styles.input}
                value={costToll}
                onChangeText={setCostToll}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Hospedagem</Text>
              <TextInput
                style={styles.input}
                value={costHotel}
                onChangeText={setCostHotel}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Outros Custos</Text>
              <TextInput
                style={styles.input}
                value={costOther}
                onChangeText={setCostOther}
                keyboardType="numeric"
                placeholder="R$ 0,00"
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>

            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Custo Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalCost)}</Text>
            </View>
          </View>

          {/* Observações */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Observações sobre a viagem..."
              placeholderTextColor={Colors.light.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
          >
            <Text style={styles.saveButtonText}>
              {createMutation.isPending ? 'Salvando...' : 'Salvar Viagem'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ? StatusBar.currentHeight + 16 : 40 : 50,
    paddingBottom: 16,
    backgroundColor: Colors.light.primary,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.text,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 100,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  totalCard: {
    backgroundColor: Colors.light.primaryLight,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.light.primary,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  saveButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

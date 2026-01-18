import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  Text,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';

import { createTrip, checkTripCode } from '@/services/tripService';
import { TripCreate } from '@/types';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency, parseCurrency } from '@/utils/format';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useEffect, useRef } from 'react';

export default function AddTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    from?: string;
    preselectedProductId?: string;
    preselectedQuantity?: string;
    preselectedPrice?: string;
  }>();
  const queryClient = useQueryClient();

  const [tripCode, setTripCode] = useState('');
  const [tripDate, setTripDate] = useState(new Date());
  const [tripDateInput, setTripDateInput] = useState('');
  const [destination, setDestination] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [returnDate, setReturnDate] = useState(new Date());
  const [returnDateInput, setReturnDateInput] = useState('');
  const [costFuel, setCostFuel] = useState('0,00');
  const [costFood, setCostFood] = useState('0,00');
  const [costToll, setCostToll] = useState('0,00');
  const [costHotel, setCostHotel] = useState('0,00');
  const [costOther, setCostOther] = useState('0,00');
  const [notes, setNotes] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReturnDatePicker, setShowReturnDatePicker] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdTripCode, setCreatedTripCode] = useState('');
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [codeValidationStatus, setCodeValidationStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const codeCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const createMutation = useMutation({
    mutationFn: createTrip,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setCreatedTripCode(data.trip_code || tripCode);

      // Se veio da tela de entradas, redirecionar de volta com o trip_id
      if (params.from === 'entries') {
        router.replace({
          pathname: '/entries/add',
          params: {
            newTripId: data.id,
            newTripCode: data.trip_code || tripCode,
            // Preservar produto pré-selecionado (se houver)
            ...(params.preselectedProductId && {
              preselectedProductId: params.preselectedProductId,
              preselectedQuantity: params.preselectedQuantity,
              preselectedPrice: params.preselectedPrice
            })
          }
        });
      } else {
        // Se veio da lista de viagens, mostrar dialog e voltar para lista
        setShowSuccessDialog(true);
      }
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Erro ao criar viagem');
      setShowErrorDialog(true);
    },
  });

  /**
   * Validar código de viagem em tempo real (com debounce)
   */
  useEffect(() => {
    // Limpar timeout anterior
    if (codeCheckTimeoutRef.current) {
      clearTimeout(codeCheckTimeoutRef.current);
    }

    // Resetar se campo estiver vazio
    if (!tripCode.trim()) {
      setCodeValidationStatus('idle');
      return;
    }

    // Validar tamanho mínimo
    if (tripCode.trim().length < 5) {
      setCodeValidationStatus('idle');
      return;
    }

    // Iniciar validação após 500ms de inatividade
    setCodeValidationStatus('checking');
    codeCheckTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('🔍 Verificando código:', tripCode.trim());
        const result = await checkTripCode(tripCode.trim());
        console.log('✅ Resultado da validação:', result);
        setCodeValidationStatus(result.exists ? 'invalid' : 'valid');
      } catch (error) {
        // Em caso de erro, assumir que está válido para não bloquear o usuário
        console.error('❌ Erro ao validar código:', error);
        setCodeValidationStatus('valid');
      }
    }, 500);

    // Cleanup
    return () => {
      if (codeCheckTimeoutRef.current) {
        clearTimeout(codeCheckTimeoutRef.current);
      }
    };
  }, [tripCode]);

  /**
   * Formatar entrada de preço com centavos (formato brasileiro)
   */
  const formatPriceInput = (text: string): string => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers.length === 0) return '0,00';
    const value = parseInt(numbers) / 100;
    return value.toFixed(2).replace('.', ',');
  };

  /**
   * Formatar entrada de data (DD/MM/YYYY)
   */
  const formatDateInput = (text: string, currentValue: string): string => {
    const numbers = text.replace(/[^0-9]/g, '');

    if (numbers.length === 0) return '';
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) {
      return `${numbers.substring(0, 2)}/${numbers.substring(2)}`;
    }
    if (numbers.length <= 8) {
      return `${numbers.substring(0, 2)}/${numbers.substring(2, 4)}/${numbers.substring(4, 8)}`;
    }

    return currentValue;
  };

  /**
   * Validar formato de data (DD/MM/YYYY)
   */
  const isValidDate = (dateStr: string): boolean => {
    if (!dateStr || dateStr.length !== 10) return false;

    const parts = dateStr.split('/');
    if (parts.length !== 3) return false;

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
    if (day < 1 || day > 31) return false;
    if (month < 1 || month > 12) return false;
    if (year < 1900 || year > 2100) return false;

    // Validar dia válido para o mês
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year &&
           date.getMonth() === month - 1 &&
           date.getDate() === day;
  };

  /**
   * Converter string DD/MM/YYYY para Date
   */
  const parseDateInput = (dateStr: string): Date | null => {
    if (!isValidDate(dateStr)) return null;

    const parts = dateStr.split('/');
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Month is 0-indexed
    const year = parseInt(parts[2]);

    return new Date(year, month, day);
  };

  /**
   * Formatar entrada de horário (HH:MM)
   */
  const formatTimeInput = (text: string, currentValue: string): string => {
    const numbers = text.replace(/[^0-9]/g, '');

    if (numbers.length === 0) return '';
    if (numbers.length === 1) return numbers;
    if (numbers.length === 2) {
      const hours = parseInt(numbers);
      if (hours > 23) return currentValue;
      return numbers;
    }
    if (numbers.length === 3) {
      const hours = parseInt(numbers.substring(0, 2));
      if (hours > 23) return currentValue;
      return `${numbers.substring(0, 2)}:${numbers.substring(2)}`;
    }
    if (numbers.length >= 4) {
      const hours = parseInt(numbers.substring(0, 2));
      const minutes = parseInt(numbers.substring(2, 4));
      if (hours > 23 || minutes > 59) return currentValue;
      return `${numbers.substring(0, 2)}:${numbers.substring(2, 4)}`;
    }

    return numbers;
  };

  /**
   * Validar formato de horário (HH:MM)
   */
  const isValidTime = (time: string): boolean => {
    if (!time || time.length !== 5) return false;
    const [hours, minutes] = time.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  };

  /**
   * Validar formulário
   */
  const validateForm = (): boolean => {
    console.log('🔍 Validando formulário. Status do código:', codeValidationStatus);

    if (!tripCode.trim()) {
      setValidationMessage('Informe o código da viagem');
      setShowValidationDialog(true);
      return false;
    }

    if (tripCode.trim().length < 5) {
      setValidationMessage('O código da viagem deve ter no mínimo 5 caracteres');
      setShowValidationDialog(true);
      return false;
    }

    // Verificar se código está sendo validado
    if (codeValidationStatus === 'checking') {
      setValidationMessage('Aguarde a verificação do código...');
      setShowValidationDialog(true);
      return false;
    }

    // Verificar se código é inválido
    if (codeValidationStatus === 'invalid') {
      setValidationMessage('O código informado já existe. Por favor, escolha outro código.');
      setShowValidationDialog(true);
      return false;
    }

    if (!destination.trim()) {
      setValidationMessage('Informe o destino da viagem');
      setShowValidationDialog(true);
      return false;
    }

    // Validar data de partida (se digitada manualmente)
    if (tripDateInput && !isValidDate(tripDateInput)) {
      setValidationMessage('Data da viagem inválida. Use o formato DD/MM/AAAA');
      setShowValidationDialog(true);
      return false;
    }

    // Validar data de retorno (se digitada manualmente)
    if (returnDateInput && !isValidDate(returnDateInput)) {
      setValidationMessage('Data de retorno inválida. Use o formato DD/MM/AAAA');
      setShowValidationDialog(true);
      return false;
    }

    // Pegar as datas corretas (input manual ou picker)
    const finalTripDate = tripDateInput ? parseDateInput(tripDateInput) : tripDate;
    const finalReturnDate = returnDateInput ? parseDateInput(returnDateInput) : returnDate;

    if (!finalTripDate) {
      setValidationMessage('Data da viagem inválida');
      setShowValidationDialog(true);
      return false;
    }

    // Validar horários de partida e retorno
    if (departureTime && returnTime && isValidTime(departureTime) && isValidTime(returnTime)) {
      const [depHours, depMinutes] = departureTime.split(':').map(Number);
      const [retHours, retMinutes] = returnTime.split(':').map(Number);

      const depDateTime = new Date(finalTripDate);
      depDateTime.setHours(depHours, depMinutes, 0, 0);

      const retDateTime = new Date(finalReturnDate || finalTripDate);
      retDateTime.setHours(retHours, retMinutes, 0, 0);

      if (depDateTime >= retDateTime) {
        setValidationMessage('O horário de retorno deve ser posterior ao horário de partida. Ajuste as datas ou horários.');
        setShowValidationDialog(true);
        return false;
      }
    }

    return true;
  };

  /**
   * Submeter formulário
   */
  const handleSubmit = () => {
    if (!validateForm()) {
      return;
    }

    // Usar data do input manual ou do picker
    const finalTripDate = tripDateInput ? parseDateInput(tripDateInput) : tripDate;
    const finalReturnDate = returnDateInput ? parseDateInput(returnDateInput) : returnDate;

    if (!finalTripDate) return;

    const tripData: TripCreate = {
      trip_code: tripCode.trim(),
      trip_date: finalTripDate.toISOString().split('T')[0],
      destination: destination.trim(),
      travel_cost_fuel: parseCurrency(costFuel),
      travel_cost_food: parseCurrency(costFood),
      travel_cost_toll: parseCurrency(costToll),
      travel_cost_hotel: parseCurrency(costHotel),
      travel_cost_other: parseCurrency(costOther),
      notes: notes.trim() || undefined,
    };

    if (departureTime && isValidTime(departureTime)) {
      const [hours, minutes] = departureTime.split(':').map(Number);
      const dateTime = new Date(finalTripDate);
      dateTime.setHours(hours, minutes, 0, 0);
      tripData.departure_time = dateTime.toISOString();
    }

    if (returnTime && isValidTime(returnTime)) {
      const [hours, minutes] = returnTime.split(':').map(Number);
      const dateTime = new Date(finalReturnDate || finalTripDate);
      dateTime.setHours(hours, minutes, 0, 0);
      tripData.return_time = dateTime.toISOString();
    }

    createMutation.mutate(tripData);
  };

  const totalCost = parseCurrency(costFuel) + parseCurrency(costFood) + 
                   parseCurrency(costToll) + parseCurrency(costHotel) + 
                   parseCurrency(costOther);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Nova Viagem</Text>

            <View style={styles.headerPlaceholder} />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerSubtitle}>
              Preencha os dados abaixo para cadastrar uma nova viagem
            </Text>
          </View>
        </LinearGradient>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Informações Básicas */}
          <View style={styles.section}>
            <HelperText type="info" style={styles.sectionTitle}>
              Informações Básicas
            </HelperText>

            <TextInput
              label="Código da Viagem *"
              value={tripCode}
              onChangeText={setTripCode}
              mode="outlined"
              style={styles.input}
              placeholder="Ex: VIAGEM-001 (mín. 5 caracteres)"
              maxLength={50}
              autoCapitalize="characters"
              error={codeValidationStatus === 'invalid'}
              right={
                codeValidationStatus === 'checking' ? (
                  <TextInput.Icon icon="clock-outline" />
                ) : codeValidationStatus === 'valid' ? (
                  <TextInput.Icon icon="check-circle" color="#4CAF50" />
                ) : codeValidationStatus === 'invalid' ? (
                  <TextInput.Icon icon="close-circle" color="#f44336" />
                ) : null
              }
            />
            {codeValidationStatus === 'invalid' && (
              <HelperText type="error" visible={true}>
                Código já existe. Por favor, escolha outro código.
              </HelperText>
            )}
            {codeValidationStatus === 'valid' && (
              <HelperText type="info" visible={true} style={{ color: '#4CAF50' }}>
                Código disponível ✓
              </HelperText>
            )}

            <TextInput
              label="Data da Viagem *"
              value={tripDateInput || tripDate.toLocaleDateString('pt-BR')}
              onChangeText={(text) => {
                const formatted = formatDateInput(text, tripDateInput);
                setTripDateInput(formatted);
              }}
              mode="outlined"
              style={styles.input}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              maxLength={10}
              left={<TextInput.Icon icon="calendar-outline" />}
              right={
                <TextInput.Icon
                  icon="calendar"
                  onPress={() => setShowDatePicker(true)}
                />
              }
              error={tripDateInput.length > 0 && !isValidDate(tripDateInput)}
            />
            {tripDateInput.length > 0 && !isValidDate(tripDateInput) && (
              <HelperText type="error" visible={true}>
                Data inválida (use DD/MM/AAAA)
              </HelperText>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={tripDate}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    setTripDate(date);
                    setTripDateInput(''); // Limpar input manual ao usar picker
                  }
                }}
              />
            )}

            <TextInput
              label="Destino *"
              value={destination}
              onChangeText={setDestination}
              mode="outlined"
              style={styles.input}
              placeholder="Ex: São Paulo - SP"
            />

            <View style={styles.row}>
              <View style={styles.inputHalf}>
                <TextInput
                  label="Horário Saída"
                  value={departureTime}
                  onChangeText={(text) => setDepartureTime(formatTimeInput(text, departureTime))}
                  mode="outlined"
                  style={styles.input}
                  placeholder="HH:MM"
                  keyboardType="number-pad"
                  maxLength={5}
                  left={<TextInput.Icon icon="time-outline" />}
                  right={
                    departureTime ? (
                      <TextInput.Icon
                        icon="close-circle"
                        onPress={() => setDepartureTime('')}
                      />
                    ) : null
                  }
                  error={departureTime.length > 0 && !isValidTime(departureTime)}
                />
                {departureTime.length > 0 && !isValidTime(departureTime) && (
                  <HelperText type="error" visible={true}>
                    Horário inválido (00:00 - 23:59)
                  </HelperText>
                )}
              </View>

              <View style={styles.inputHalf}>
                <TextInput
                  label="Horário Retorno"
                  value={returnTime}
                  onChangeText={(text) => setReturnTime(formatTimeInput(text, returnTime))}
                  mode="outlined"
                  style={styles.input}
                  placeholder="HH:MM"
                  keyboardType="number-pad"
                  maxLength={5}
                  left={<TextInput.Icon icon="clock-outline" />}
                  right={
                    returnTime ? (
                      <TextInput.Icon
                        icon="close-circle"
                        onPress={() => setReturnTime('')}
                      />
                    ) : null
                  }
                  error={returnTime.length > 0 && !isValidTime(returnTime)}
                />
                {returnTime.length > 0 && !isValidTime(returnTime) && (
                  <HelperText type="error" visible={true}>
                    Horário inválido (00:00 - 23:59)
                  </HelperText>
                )}
              </View>
            </View>

            <TextInput
              label="Data de Retorno"
              value={returnDateInput || returnDate.toLocaleDateString('pt-BR')}
              onChangeText={(text) => {
                const formatted = formatDateInput(text, returnDateInput);
                setReturnDateInput(formatted);
              }}
              mode="outlined"
              style={styles.input}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              maxLength={10}
              left={<TextInput.Icon icon="calendar-outline" />}
              right={
                <TextInput.Icon
                  icon="calendar"
                  onPress={() => setShowReturnDatePicker(true)}
                />
              }
              error={returnDateInput.length > 0 && !isValidDate(returnDateInput)}
            />
            {returnDateInput.length > 0 && !isValidDate(returnDateInput) && (
              <HelperText type="error" visible={true}>
                Data inválida (use DD/MM/AAAA)
              </HelperText>
            )}
            {showReturnDatePicker && (
              <DateTimePicker
                value={returnDate}
                mode="date"
                display="default"
                minimumDate={tripDate}
                onChange={(event, date) => {
                  setShowReturnDatePicker(false);
                  if (date) {
                    setReturnDate(date);
                    setReturnDateInput(''); // Limpar input manual ao usar picker
                  }
                }}
              />
            )}
          </View>

          {/* Custos da Viagem */}
          <View style={styles.section}>
            <HelperText type="info" style={styles.sectionTitle}>
              Custos da Viagem
            </HelperText>

            <TextInput
              label="Combustível (R$)"
              value={costFuel}
              onChangeText={(text) => setCostFuel(formatPriceInput(text))}
              mode="outlined"
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />}
            />

            <TextInput
              label="Alimentação (R$)"
              value={costFood}
              onChangeText={(text) => setCostFood(formatPriceInput(text))}
              mode="outlined"
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />}
            />

            <TextInput
              label="Pedágios (R$)"
              value={costToll}
              onChangeText={(text) => setCostToll(formatPriceInput(text))}
              mode="outlined"
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />}
            />

            <TextInput
              label="Hospedagem (R$)"
              value={costHotel}
              onChangeText={(text) => setCostHotel(formatPriceInput(text))}
              mode="outlined"
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />}
            />

            <TextInput
              label="Outros Custos (R$)"
              value={costOther}
              onChangeText={(text) => setCostOther(formatPriceInput(text))}
              mode="outlined"
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />}
            />

            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Custo Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalCost)}</Text>
            </View>
          </View>

          {/* Observações */}
          <View style={styles.section}>
            <HelperText type="info" style={styles.sectionTitle}>
              Observações
            </HelperText>

            <TextInput
              label="Observações"
              value={notes}
              onChangeText={setNotes}
              mode="outlined"
              style={styles.input}
              placeholder="Observações sobre a viagem..."
              multiline
              numberOfLines={4}
            />
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
              onPress={handleSubmit}
              style={[styles.button, styles.buttonPrimary]}
              loading={createMutation.isPending}
              disabled={createMutation.isPending || codeValidationStatus === 'invalid' || codeValidationStatus === 'checking'}
            >
              Salvar Viagem
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dialog de Sucesso (só aparece quando NÃO vem de entries) */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Viagem Criada! ✓"
        message={`A viagem ${createdTripCode} foi registrada com sucesso.`}
        details={[
          `Código: ${createdTripCode}`,
          `Destino: ${destination}`,
          `Custo Total: ${formatCurrency(totalCost)}`,
          'Agora você pode vincular entradas de estoque a esta viagem'
        ]}
        type="success"
        confirmText="Ver Viagens"
        cancelText="Nova Viagem"
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.push('/(tabs)/entries');
        }}
        onCancel={() => {
          // Reset para nova viagem rápida
          setShowSuccessDialog(false);
          setTripCode('');
          setTripDate(new Date());
          setTripDateInput('');
          setDestination('');
          setDepartureTime('');
          setReturnTime('');
          setReturnDate(new Date());
          setReturnDateInput('');
          setCostFuel('0,00');
          setCostFood('0,00');
          setCostToll('0,00');
          setCostHotel('0,00');
          setCostOther('0,00');
          setNotes('');
        }}
        icon="checkmark-circle"
      />

      {/* Dialog de Erro */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro ao Criar Viagem"
        message={errorMessage}
        confirmText="OK"
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
        icon="alert-circle"
      />

      {/* Dialog de Validação */}
      <ConfirmDialog
        visible={showValidationDialog}
        title="Atenção"
        message={validationMessage}
        confirmText="OK"
        onConfirm={() => setShowValidationDialog(false)}
        onCancel={() => setShowValidationDialog(false)}
        type="warning"
        icon="alert-circle"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerContainer: {
    marginBottom: 0,
  },
  // Header styles
  headerGradient: {
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  headerInfo: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    maxWidth: '90%',
    alignSelf: 'center',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.95,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: theme.fontWeight.regular,
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
    color: Colors.light.primary,
  },
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.background,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inputHalf: {
    flex: 1,
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
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  button: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: Colors.light.primary,
  },
});

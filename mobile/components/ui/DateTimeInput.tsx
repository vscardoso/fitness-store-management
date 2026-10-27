import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import BottomSheet from '@/components/ui/BottomSheet';

interface DateTimeInputProps {
  label: string;
  value?: Date;
  onChange: (date: Date | undefined) => void;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  mode?: 'date' | 'time' | 'datetime';
  disabled?: boolean;
  modern?: boolean;
}

export default function DateTimeInput({
  label,
  value,
  onChange,
  error,
  minimumDate,
  maximumDate,
  mode = 'datetime',
  disabled = false,
  modern = false,
}: DateTimeInputProps) {
  const brandingColors = useBrandingColors();
  const styles = useMemo(() => createStyles(brandingColors.primary), [brandingColors.primary]);
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [tempDate, setTempDate] = useState<Date | undefined>(value);
  const [currentMode, setCurrentMode] = useState<'date' | 'time'>(
    mode === 'datetime' ? 'date' : mode
  );

  const formatDateTime = (date: Date | undefined): string => {
    if (!date) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (mode === 'date') {
      return `${day}/${month}/${year}`;
    }
    if (mode === 'time') {
      return `${hours}:${minutes}`;
    }
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setPickerVisible(false);

      if (event.type === 'set' && selectedDate) {
        if (mode === 'datetime' && currentMode === 'date') {
          // For datetime mode on Android, show time picker after date is selected
          setTempDate(selectedDate);
          setCurrentMode('time');
          setPickerVisible(true);
        } else {
          onChange(selectedDate);
          setCurrentMode('date');
        }
      } else {
        // User cancelled
        setCurrentMode('date');
      }
    } else {
      // iOS: update immediately
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleIOSConfirm = () => {
    if (tempDate) {
      onChange(tempDate);
    }
    setPickerVisible(false);
    setCurrentMode('date');
  };

  const handleCancel = () => {
    setPickerVisible(false);
    setCurrentMode('date');
    setTempDate(value);
  };

  const handlePress = () => {
    if (Platform.OS === 'web') return; // na web quem abre o seletor é o campo nativo por cima (renderWebInput)
    if (!disabled) {
      setTempDate(value || new Date());
      setCurrentMode(mode === 'datetime' ? 'date' : mode);
      setPickerVisible(true);
    }
  };

  // Web: o seletor nativo do React Native não existe no navegador. Um <input> de data invisível cobre o campo;
  // o toque cai nele e abre o seletor do próprio navegador (calendário no computador, roda no celular).
  const pad = (n: number) => String(n).padStart(2, '0');
  const toWebValue = (d?: Date) => {
    if (!d) return '';
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return mode === 'date' ? date : mode === 'time' ? time : `${date}T${time}`;
  };
  const fromWebValue = (text: string): Date | undefined => {
    if (!text) return undefined;
    if (mode === 'time') {
      const [h, m] = text.split(':').map(Number);
      const base = new Date(value ?? new Date());
      base.setHours(h, m, 0, 0);
      return base;
    }
    const [datePart, timePart] = text.split('T');
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, mi] = (timePart || (value ? `${value.getHours()}:${value.getMinutes()}` : '0:0')).split(':').map(Number);
    const out = new Date(y, mo - 1, d, h, mi, 0, 0);
    return Number.isNaN(out.getTime()) ? undefined : out;
  };
  const renderWebInput = () => {
    if (Platform.OS !== 'web') return null;
    return React.createElement('input', {
      type: mode === 'datetime' ? 'datetime-local' : mode,
      value: toWebValue(value),
      min: minimumDate ? toWebValue(minimumDate) : undefined,
      max: maximumDate ? toWebValue(maximumDate) : undefined,
      disabled,
      'aria-label': label,
      onClick: (e: any) => {
        try { e.currentTarget.showPicker?.(); } catch { /* navegador sem showPicker: o clique já abre */ }
      },
      onChange: (e: any) => {
        const next = fromWebValue(e.target.value);
        if (next) onChange(next);
      },
      style: {
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        opacity: 0, cursor: disabled ? 'default' : 'pointer', border: 0, padding: 0, margin: 0,
      },
    });
  };

  // Render Android picker (native modal behavior)
  const renderAndroidPicker = () => {
    if (!isPickerVisible) return null;

    return (
      <DateTimePicker
        value={tempDate || new Date()}
        mode={currentMode}
        is24Hour={true}
        onChange={handleDateChange}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        themeVariant="light"
        locale="pt-BR"
      />
    );
  };

  // Render iOS picker (custom modal with light theme)
  const renderIOSPicker = () => {
    if (!isPickerVisible) return null;

    return (
      <BottomSheet
        visible={isPickerVisible}
        onDismiss={handleCancel}
        title={label || (mode === 'time' ? 'Escolher horário' : 'Escolher data')}
        icon={mode === 'time' ? 'time-outline' : 'calendar-outline'}
        actions={[
          { label: 'Cancelar', variant: 'secondary', onPress: handleCancel },
          { label: 'Confirmar', icon: 'checkmark-circle-outline', onPress: handleIOSConfirm },
        ]}
      >
        <DateTimePicker
          value={tempDate || new Date()}
          mode={mode === 'datetime' ? 'datetime' : mode}
          is24Hour={true}
          onChange={handleDateChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          display="spinner"
          themeVariant="light"
          locale="pt-BR"
          style={styles.iosPicker}
        />
      </BottomSheet>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.field}>
      {modern ? (
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.8}
          disabled={disabled}
          style={[
            styles.modernInput,
            disabled && styles.modernInputDisabled,
            !!error && styles.modernInputError,
          ]}
        >
          <View style={styles.modernIconWrap}>
            <Ionicons
              name={mode === 'time' ? 'time-outline' : 'calendar-outline'}
              size={18}
              color={brandingColors.primary}
            />
          </View>
          <View style={styles.modernTextWrap}>
            <Text style={styles.modernLabel}>{label}</Text>
            <Text style={[styles.modernValue, !value && styles.modernValuePlaceholder]}>
              {value ? formatDateTime(value) : 'Selecionar'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
        </TouchableOpacity>
      ) : (
        <TextInput
          label={label}
          value={formatDateTime(value)}
          onFocus={handlePress}
          editable={false}
          mode="outlined"
          error={!!error}
          disabled={disabled}
          right={<TextInput.Icon icon="calendar" onPress={handlePress} />}
          style={styles.input}
        />
      )}
      {renderWebInput()}
      </View>
      {error && (
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
      )}

      {Platform.OS === 'ios' ? renderIOSPicker() : Platform.OS === 'android' ? renderAndroidPicker() : null}
    </View>
  );
}

const createStyles = (brand: string) => StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  field: {
    position: 'relative',
  },
  input: {
    backgroundColor: Colors.light.card,
  },
  modernInput: {
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 14,
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modernInputDisabled: {
    opacity: 0.5,
  },
  modernInputError: {
    borderColor: Colors.light.error,
  },
  modernIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: brand + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  modernLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontWeight: '600',
    marginBottom: 1,
  },
  modernValue: {
    fontSize: 15,
    color: Colors.light.text,
    fontWeight: '600',
  },
  modernValuePlaceholder: {
    color: Colors.light.textTertiary,
    fontWeight: '500',
  },
  // iOS Modal styles
  iosPicker: {
    backgroundColor: Colors.light.background,
    height: 260,
  },
});

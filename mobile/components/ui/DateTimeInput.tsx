import React, { useState } from 'react';
import { View, StyleSheet, Platform, Modal, TouchableOpacity } from 'react-native';
import { TextInput, HelperText, Button } from 'react-native-paper';
import { Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

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
    if (!disabled) {
      setTempDate(value || new Date());
      setCurrentMode(mode === 'datetime' ? 'date' : mode);
      setPickerVisible(true);
    }
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
      <Modal
        visible={isPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCancel}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCancel}
        >
          <View style={styles.modalContent}>
            <View style={styles.pickerHeader}>
              <Button onPress={handleCancel} textColor={Colors.light.text}>
                Cancelar
              </Button>
              <Button onPress={handleIOSConfirm} textColor={Colors.light.primary}>
                Confirmar
              </Button>
            </View>
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
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
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
              color={Colors.light.primary}
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
      {error && (
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
      )}

      {Platform.OS === 'ios' ? renderIOSPicker() : renderAndroidPicker()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
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
    backgroundColor: Colors.light.primary + '14',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.light.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  iosPicker: {
    backgroundColor: Colors.light.background,
    height: 260,
  },
});

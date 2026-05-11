import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { createPrinter } from '@/services/printService';
import type { ConnectionType, LabelPrinterCreate } from '@/types/printer';

const CONNECTION_OPTIONS: { value: ConnectionType; label: string; description: string }[] = [
  { value: 'ethernet', label: 'Ethernet (TCP/IP)', description: 'Conexão via rede — porta 9100' },
  { value: 'usb', label: 'USB', description: 'Cabo USB direto ao computador/servidor' },
  { value: 'serial', label: 'Serial (RS-232)', description: 'Porta COM / cabo serial' },
];

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address';
}) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.light.textTertiary}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export default function NewPrinterScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const brandingColors = useBrandingColors();

  const [name, setName] = useState('Elgin L42 Pro');
  const [model, setModel] = useState('Elgin L42 Pro');
  const [connectionType, setConnectionType] = useState<ConnectionType>('ethernet');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('9100');
  const [serialPort, setSerialPort] = useState('');
  const [baudRate, setBaudRate] = useState('9600');
  const [usbDevice, setUsbDevice] = useState('');
  const [widthMm, setWidthMm] = useState('55');
  const [heightMm, setHeightMm] = useState('65');
  const [dpi, setDpi] = useState('203');
  const [isDefault, setIsDefault] = useState(true);

  const mutation = useMutation({
    mutationFn: createPrinter,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['label-printers'] });
      Alert.alert('Impressora cadastrada', 'Use o botão Testar para verificar a conexão.');
      router.back();
    },
    onError: (e: any) => Alert.alert('Erro', e.response?.data?.detail ?? e.message),
  });

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Atenção', 'Informe um nome para a impressora.');
      return;
    }
    if (connectionType === 'ethernet' && !ipAddress.trim()) {
      Alert.alert('Atenção', 'Informe o endereço IP da impressora.');
      return;
    }

    const payload: LabelPrinterCreate = {
      name: name.trim(),
      model: model.trim(),
      connection_type: connectionType,
      protocol: 'zpl',
      ip_address: ipAddress.trim() || undefined,
      port: parseInt(port) || 9100,
      serial_port: serialPort.trim() || undefined,
      baud_rate: parseInt(baudRate) || 9600,
      usb_device: usbDevice.trim() || undefined,
      label_width_mm: parseInt(widthMm) || 55,
      label_height_mm: parseInt(heightMm) || 65,
      dpi: parseInt(dpi) || 203,
      is_default: isDefault,
    };

    mutation.mutate(payload);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PageHeader
        title="Nova Impressora"
        subtitle="Elgin L42 Pro — ZPL II"
        showBackButton
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <SectionLabel>IDENTIFICAÇÃO</SectionLabel>
        <Field
          label="Nome"
          value={name}
          onChangeText={setName}
          placeholder="Ex: Elgin L42 Pro — Estoque"
        />
        <Field
          label="Modelo"
          value={model}
          onChangeText={setModel}
          placeholder="Elgin L42 Pro"
        />

        <SectionLabel>CONEXÃO</SectionLabel>
        {CONNECTION_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.connectionOption,
              connectionType === opt.value && {
                borderColor: brandingColors.primary,
                backgroundColor: brandingColors.primary + '10',
              },
            ]}
            onPress={() => setConnectionType(opt.value)}
            activeOpacity={0.7}
          >
            <View style={styles.connectionLeft}>
              <View
                style={[
                  styles.radio,
                  connectionType === opt.value && { borderColor: brandingColors.primary },
                ]}
              >
                {connectionType === opt.value && (
                  <View
                    style={[styles.radioDot, { backgroundColor: brandingColors.primary }]}
                  />
                )}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectionLabel}>{opt.label}</Text>
              <Text style={styles.connectionDesc}>{opt.description}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {connectionType === 'ethernet' && (
          <>
            <Field
              label="Endereço IP"
              value={ipAddress}
              onChangeText={setIpAddress}
              placeholder="192.168.1.100"
              keyboardType="decimal-pad"
            />
            <Field
              label="Porta TCP"
              value={port}
              onChangeText={setPort}
              placeholder="9100"
              keyboardType="numeric"
            />
          </>
        )}

        {connectionType === 'serial' && (
          <>
            <Field
              label="Porta Serial"
              value={serialPort}
              onChangeText={setSerialPort}
              placeholder="COM3 ou /dev/ttyUSB0"
            />
            <Field
              label="Velocidade (baud)"
              value={baudRate}
              onChangeText={setBaudRate}
              placeholder="9600"
              keyboardType="numeric"
            />
          </>
        )}

        {connectionType === 'usb' && (
          <Field
            label="Dispositivo USB (opcional)"
            value={usbDevice}
            onChangeText={setUsbDevice}
            placeholder="/dev/usb/lp0"
          />
        )}

        <SectionLabel>ETIQUETA</SectionLabel>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field
              label="Largura (mm)"
              value={widthMm}
              onChangeText={setWidthMm}
              keyboardType="numeric"
            />
          </View>
          <View style={{ width: theme.spacing.sm }} />
          <View style={{ flex: 1 }}>
            <Field
              label="Altura (mm)"
              value={heightMm}
              onChangeText={setHeightMm}
              keyboardType="numeric"
            />
          </View>
          <View style={{ width: theme.spacing.sm }} />
          <View style={{ flex: 1 }}>
            <Field
              label="DPI"
              value={dpi}
              onChangeText={setDpi}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Elgin L42 Pro: 55×65mm, 203 DPI — padrão pré-configurado.
            Frente pré-impressa com marca da empresa.
            Verso impresso com QR Code + dados da peça.
          </Text>
        </View>

        <SectionLabel>OPÇÕES</SectionLabel>
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Impressora padrão</Text>
            <Text style={styles.switchDesc}>Usada automaticamente ao imprimir</Text>
          </View>
          <Switch
            value={isDefault}
            onValueChange={setIsDefault}
            trackColor={{ true: brandingColors.primary }}
          />
        </View>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={mutation.isPending}
        >
          <LinearGradient
            colors={brandingColors.gradient as [string, string]}
            style={styles.saveBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.saveBtnText}>
              {mutation.isPending ? 'Salvando...' : 'Cadastrar Impressora'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  scroll: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  sectionLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    color: Colors.light.textTertiary,
    letterSpacing: 0.5,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  fieldWrapper: { marginBottom: theme.spacing.sm },
  fieldLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md,
    height: 52,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
  },
  connectionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  connectionLeft: { marginRight: theme.spacing.sm },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  connectionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  connectionDesc: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  row: { flexDirection: 'row' },
  infoBox: {
    backgroundColor: '#3B82F610',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#3B82F630',
  },
  infoText: {
    fontSize: theme.fontSize.xs,
    color: '#3B82F6',
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  switchLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  switchDesc: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  saveBtn: {
    borderRadius: theme.borderRadius.xxl,
    overflow: 'hidden',
  },
  saveBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: theme.borderRadius.xxl,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: theme.fontSize.base },
});

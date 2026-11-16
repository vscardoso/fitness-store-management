/**
 * Janela que pede o MOTIVO quando alguém tenta mexer no saldo de um banco (ver services/bankApproval.ts). Fica montada na raiz
 * do app e responde a `withBankReason`. Mínimo de 20 letras: o que aconteceu e como foi conferido (ex.: extrato do banco).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native-paper';

import BottomSheet from '@/components/ui/BottomSheet';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { registerReasonAsker } from '@/services/bankApproval';

const MIN = 20;

export default function BankApprovalHost() {
  const brand = useBrandingColors();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    registerReasonAsker(() => new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setReason('');
      setOpen(true);
    }));
    return () => registerReasonAsker(null);
  }, []);

  const close = (value: string | null) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };
  const text = reason.trim();
  const short = text.length < MIN;

  return (
    <BottomSheet
      visible={open}
      onDismiss={() => close(null)}
      title="Mexer no saldo do banco"
      subtitle="Precisa de motivo e da aprovação de todos os administradores"
      icon="shield-checkmark-outline"
      actions={[
        { label: 'Enviar pedido', variant: 'primary', disabled: short, onPress: () => close(text) },
        { label: 'Cancelar', variant: 'secondary', onPress: () => close(null) },
      ]}
    >
      <View style={{ gap: 10 }}>
        <Text style={styles.note}>
          O saldo do banco só muda depois que todos os administradores aprovarem. Explique o que aconteceu e como você conferiu, por exemplo, comparando com o extrato do banco.
        </Text>
        <TextInput mode="outlined" label="Motivo (mínimo 20 letras)" value={reason} onChangeText={setReason} multiline numberOfLines={4}
          activeOutlineColor={brand.primary} autoFocus />
        <Text style={[styles.note, !short && { color: Colors.light.success }]}>
          {short ? `Faltam ${MIN - text.length} letras.` : 'Motivo suficiente.'}
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
});

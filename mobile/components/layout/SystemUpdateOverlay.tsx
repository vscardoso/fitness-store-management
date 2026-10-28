/**
 * Tela única de "sistema atualizando": aparece sozinha quando a API para de responder (publicação de versão nova,
 * sinal fora) e some sozinha quando volta, retomando as telas. Ninguém precisa escolher nada, então vale para todas
 * as pessoas ao mesmo tempo. O que estava na tela (campos digitados, carrinho) continua onde estava.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getSystemState, onSystemRecovered, onSystemState, retryNow, type SystemState } from '@/services/systemStatus';

const COPY: Record<Exclude<SystemState, 'ok'>, { title: string; text: string }> = {
  updating: {
    title: 'Estamos atualizando o sistema',
    text: 'Leva menos de 1 minuto. Não precisa fazer nada: quando terminar, você volta para esta mesma tela. O que você já salvou está guardado e o que está digitado continua aqui.',
  },
  offline: {
    title: 'Sem conexão com a internet',
    text: 'Confira o Wi-Fi ou o 4G. Assim que a conexão voltar, o app continua sozinho.',
  },
  slow: {
    title: 'A atualização está demorando',
    text: 'Está levando mais que o normal. Seu trabalho está guardado. Toque em "Tentar agora" ou aguarde, que o app volta sozinho.',
  },
};

export default function SystemUpdateOverlay() {
  const brand = useBrandingColors();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SystemState>(getSystemState());
  const [welcomeBack, setWelcomeBack] = useState(false);

  useEffect(() => onSystemState(setState), []);
  useEffect(
    () =>
      onSystemRecovered(() => {
        queryClient.invalidateQueries(); // recarrega o que falhou durante a atualização
        setWelcomeBack(true);
        setTimeout(() => setWelcomeBack(false), 2200);
      }),
    [queryClient],
  );

  if (state === 'ok') {
    if (!welcomeBack) return null;
    return (
      <View pointerEvents="none" style={styles.toastWrap}>
        <View style={styles.toast} accessibilityRole="alert">
          <Text style={styles.toastText}>Pronto, sistema atualizado.</Text>
        </View>
      </View>
    );
  }

  const copy = COPY[state];
  return (
    <View style={styles.overlay} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.card}>
        <ActivityIndicator size="large" color={brand.primary} alwaysShow />
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.text}>{copy.text}</Text>
        {state === 'slow' && (
          <TouchableOpacity onPress={retryNow} style={[styles.button, { backgroundColor: brand.primary }]} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Tentar agora</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20000,
    elevation: 40,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { maxWidth: 380, alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.light.text, textAlign: 'center', marginTop: 8 },
  text: { fontSize: 14, lineHeight: 20, color: Colors.light.textSecondary, textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', zIndex: 20000 },
  toast: { backgroundColor: '#166534', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  toastText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

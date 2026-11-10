/**
 * Tela de referência do padrão visual (só desenvolvimento): /ui-kit
 * O que está aqui é o que vale no app. Antes de inventar um botão, cartão ou cor, olhe esta tela.
 */
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Colors, theme } from '@/constants/Colors';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import AppCard, { type CardTone } from '@/components/ui/AppCard';
import SectionTitle from '@/components/ui/SectionTitle';
import type { ButtonVariant } from '@/constants/tokens';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outlined', 'ghost', 'text', 'warning', 'danger', 'danger-outline'];
const TONES: CardTone[] = ['default', 'success', 'warning', 'error', 'info'];
const SWATCHES: (keyof typeof Colors.light)[] = [
  'text', 'textStrong', 'textSecondary', 'textTertiary', 'border', 'card', 'surfaceMuted', 'surfaceSoft',
  'success', 'successLight', 'successSoft', 'successDark', 'warning', 'warningLight', 'warningDark', 'warningDarker',
  'error', 'errorLight', 'errorSoft', 'errorDark', 'info', 'infoLight',
];

export default function UiKitScreen() {
  return (
    <View style={styles.screen}>
      <PageHeader title="Padrão visual" subtitle="Referência de botões, cartões e cores" showBackButton showHelp={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppCard title="Botões" subtitle="Uma ação principal por cartão; as outras em outlined ou text.">
          {VARIANTS.map((v) => (
            <AppButton key={v} label={v} variant={v} fullWidth onPress={() => {}} />
          ))}
          <View style={styles.row}>
            <AppButton label="sm" size="sm" variant="outlined" onPress={() => {}} />
            <AppButton label="md" size="md" variant="outlined" onPress={() => {}} />
            <AppButton label="lg" size="lg" variant="outlined" onPress={() => {}} />
          </View>
          <View style={styles.row}>
            <AppButton label="Com ícone" icon="checkmark" onPress={() => {}} />
            <AppButton label="Carregando" loading onPress={() => {}} />
            <AppButton label="Desativado" disabled onPress={() => {}} />
          </View>
        </AppCard>

        {TONES.map((t) => (
          <AppCard key={t} tone={t} title={`Cartão ${t}`} subtitle="Borda 1, raio 16, respiro 16, espaço 12 entre os filhos.">
            <Text style={styles.body}>Texto do cartão em 14, cor do texto padrão.</Text>
          </AppCard>
        ))}

        <AppCard title="Letras">
          <SectionTitle title="Título de seção (16, peso 700)" subtitle="Subtítulo (12, cor secundária)" />
          <Text style={styles.body}>Texto (14, peso 400)</Text>
          <Text style={[styles.body, { fontWeight: theme.fontWeight.semibold }]}>Destaque (14, peso 600)</Text>
          <Text style={styles.small}>Legenda (12, cor secundária)</Text>
        </AppCard>

        <AppCard title="Cores com nome" subtitle="Colors.light.* (a cor da loja vem de useBrandingColors)">
          <View style={styles.swatches}>
            {SWATCHES.map((name) => (
              <View key={name} style={styles.swatch}>
                <View style={[styles.swatchColor, { backgroundColor: Colors.light[name] as string }]} />
                <Text style={styles.small} numberOfLines={1}>{name}</Text>
              </View>
            ))}
          </View>
        </AppCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: theme.spacing.md, gap: theme.spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.sm },
  body: { fontSize: theme.fontSize.md, color: Colors.light.text },
  small: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  swatch: { width: 96, gap: 4 },
  swatchColor: { height: 40, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: Colors.light.border },
});

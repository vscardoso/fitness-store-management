/**
 * Peças comuns dos formulários de Despesa e de Prejuízo (nova, editar, registrar):
 *  - FormSection: bloco com título e subtítulo, para agrupar campos da mesma natureza;
 *  - ChoiceChip: escolha única em pílula (conta, categoria, escopo);
 *  - MoreOptions: campos opcionais recolhidos, com resumo do que já foi preenchido;
 *  - FormFooter: rodapé fixo com o resumo do lançamento, o motivo de o botão estar desligado e a ação principal.
 * O rodapé fica fora da rolagem: salvar nunca some de vista, em formulário curto ou longo.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopFooterStyle } from '@/hooks/useLayout';

type IconName = keyof typeof Ionicons.glyphMap;

export function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function ChoiceChip({ label, selected, onPress, color, icon }: {
  label: string; selected: boolean; onPress: () => void; color?: string; icon?: IconName;
}) {
  const brand = useBrandingColors();
  const tone = color ?? brand.primary;
  return (
    <TouchableOpacity
      style={[styles.chip, { borderColor: tone }, selected && { backgroundColor: tone }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {!!icon && <Ionicons name={icon} size={16} color={selected ? Colors.light.white : tone} />}
      <Text style={[styles.chipText, { color: selected ? Colors.light.white : Colors.light.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function MoreOptions({ title, filled, open, onToggle, children }: {
  title: string; filled?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <View style={styles.more}>
      <TouchableOpacity style={styles.moreHead} onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.moreTitle}>{title}</Text>
          {!!filled && !open && <Text style={styles.moreFilled} numberOfLines={1}>{filled}</Text>}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.light.textSecondary} />
      </TouchableOpacity>
      {open && <View style={styles.moreBody}>{children}</View>}
    </View>
  );
}

export function FormFooter({ summary, hint, primaryLabel, primaryIcon = 'checkmark', onPrimary, disabled, loading, secondaryLabel = 'Cancelar', onSecondary }: {
  /** O que vai ser gravado, por extenso (ex.: "R$ 120,00 · Conta de luz · sai da Gaveta"). */
  summary?: string;
  /** O que falta para o botão ligar (só aparece quando ele está desligado). */
  hint?: string;
  primaryLabel: string;
  primaryIcon?: IconName;
  onPrimary: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const desktopPad = useDesktopFooterStyle(theme.spacing.md);
  return (
    <View style={[styles.footer, desktopPad]}>
      <View style={styles.footerInner}>
        {!!summary && <Text style={styles.footerSummary} numberOfLines={2}>{summary}</Text>}
        {!!hint && <Text style={styles.footerHint}>{hint}</Text>}
        <View style={styles.footerActions}>
          {!!onSecondary && (
            <AppButton variant="ghost" size="md" label={secondaryLabel} onPress={onSecondary} disabled={loading} style={{ flex: 0 }} />
          )}
          <AppButton
            variant="primary" size="md" icon={primaryIcon} label={primaryLabel} onPress={onPrimary}
            disabled={disabled || loading} loading={loading} style={{ flex: 1 }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    marginBottom: theme.spacing.md, overflow: 'hidden',
  },
  sectionHead: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, gap: 2 },
  sectionTitle: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  sectionSub: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  sectionBody: { padding: theme.spacing.md, gap: theme.spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
    borderWidth: 1.5, backgroundColor: Colors.light.white,
  },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.semibold },
  more: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    marginBottom: theme.spacing.md, overflow: 'hidden',
  },
  moreHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md },
  moreTitle: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  moreFilled: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, marginTop: 2 },
  moreBody: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md, gap: theme.spacing.sm },
  footer: {
    backgroundColor: Colors.light.card, borderTopWidth: 1, borderTopColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
  },
  footerInner: { gap: 6, width: '100%', alignSelf: 'center' },
  footerSummary: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  footerHint: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
});

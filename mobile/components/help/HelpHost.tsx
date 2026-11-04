/**
 * Onde a ficha de ajuda aparece: folha de baixo no celular (HelpSheet) e painel fixo à direita no notebook (HelpPanel),
 * que fica aberto enquanto a pessoa usa a tela e acompanha a tela aberta. Abre pelo "?" do PageHeader ou F1 no notebook.
 */
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import BottomSheet from '@/components/ui/BottomSheet';
import HelpContent from '@/components/help/HelpContent';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useHelpStore } from '@/store/helpStore';
import { useAuth } from '@/hooks/useAuth';
import { canSeeHelp, findHelpForPath, helpById, type HelpEntry } from '@/constants/help';
import { routeMatches } from '@/utils/helpRoutes';

/** A ficha é da tela que já está aberta? Então "Abrir esta tela" não aparece. */
const isHere = (entry: HelpEntry, pathname: string) => entry.routes.some((r) => routeMatches(r, pathname));

/** Ficha da tela atual que este usuário pode ver (ou nada). */
export function useCurrentHelp(): HelpEntry | undefined {
  const pathname = usePathname();
  const { user } = useAuth();
  const entry = findHelpForPath(pathname);
  return entry && canSeeHelp(entry, user?.role) ? entry : undefined;
}

/**
 * "?" para telas com cabeçalho próprio (sem PageHeader). `onColor` = cabeçalho colorido (ícone branco, como o PageHeader).
 * Sem ficha para a tela: some, ou com `keepSpace` deixa o espaço vazio (título continua centralizado).
 */
export function HelpIconButton({ onColor = false, keepSpace = false }: { onColor?: boolean; keepSpace?: boolean }) {
  const help = useCurrentHelp();
  const toggle = useHelpStore((s) => s.toggle);
  const on = useHelpStore((s) => !!help && s.openId === help.id);
  const brand = useBrandingColors();
  if (!help) return keepSpace ? <View style={{ width: 40 }} /> : null;
  if (onColor) {
    return (
      <TouchableOpacity onPress={() => toggle(help.id)} accessibilityRole="button" accessibilityLabel="Ajuda desta tela"
        style={[styles.iconBtnOnColor, on && { backgroundColor: 'rgba(255, 255, 255, 0.4)' }]}>
        <Ionicons name="help-circle-outline" size={20} color="#fff" />
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={() => toggle(help.id)} accessibilityRole="button" accessibilityLabel="Ajuda desta tela"
      style={[styles.iconBtn, on && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}>
      <Ionicons name="help-circle-outline" size={20} color={on ? brand.primary : Colors.light.textSecondary} />
    </TouchableOpacity>
  );
}

/** Celular e web estreito: a ficha numa folha de baixo; trocar de tela fecha. */
export function HelpSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const { openId, open, close } = useHelpStore();
  const entry = helpById(openId);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    close();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BottomSheet
      visible={!!entry}
      onDismiss={close}
      title={entry?.title ?? ''}
      subtitle="Ajuda desta tela"
      icon="help-circle-outline"
      actions={entry?.open && !isHere(entry, pathname)
        ? [{ label: 'Abrir esta tela', variant: 'primary', onPress: () => { close(); router.push(entry.open as any); } }]
        : undefined}
    >
      {!!entry && <HelpContent entry={entry} onOpenRelated={open} />}
    </BottomSheet>
  );
}

/** Notebook: painel à direita da tela. Ao trocar de tela, mostra a ficha da tela nova (se tiver). */
export function HelpPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const brand = useBrandingColors();
  const { openId, open, close } = useHelpStore();
  const current = useCurrentHelp();
  const entry = helpById(openId);

  useEffect(() => {
    if (openId && current && current.id !== openId) open(current.id);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return null;
  return (
    <View style={styles.panel} accessibilityLabel={`Ajuda: ${entry.title}`}>
      <View style={styles.head}>
        <Ionicons name="help-circle-outline" size={20} color={brand.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Ajuda</Text>
          <Text style={styles.title} numberOfLines={2}>{entry.title}</Text>
        </View>
        <TouchableOpacity onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar a ajuda">
          <Ionicons name="close" size={22} color={Colors.light.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <HelpContent entry={entry} onOpenRelated={open} />
        {!!entry.open && !isHere(entry, pathname) && (
          <TouchableOpacity style={[styles.openBtn, { backgroundColor: brand.primary }]} onPress={() => router.push(entry.open as any)}
            accessibilityRole="button">
            <Text style={styles.openText}>Abrir esta tela</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.hint}>F1 abre e fecha a ajuda.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: 380, backgroundColor: Colors.light.card, borderLeftWidth: 1, borderLeftColor: Colors.light.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  kicker: { fontSize: 12, fontWeight: '700', color: Colors.light.textTertiary },
  title: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  body: { padding: 18, gap: 16, paddingBottom: 40 },
  openBtn: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  openText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 12, color: Colors.light.textTertiary },
  iconBtnOnColor: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.25)', alignItems: 'center',
    justifyContent: 'center' },
  iconBtn: { width: 38, height: 38, borderRadius: 9, borderWidth: 1, borderColor: Colors.light.border, alignItems: 'center',
    justifyContent: 'center', backgroundColor: Colors.light.card },
});

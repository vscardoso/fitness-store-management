/**
 * Central de Ajuda: todas as fichas de ajuda (constants/help), agrupadas como a barra lateral, com busca.
 * Celular: uma coluna, toque abre a ficha na folha de baixo. Notebook: lista à esquerda e a ficha à direita.
 * Só aparecem as fichas que o papel da pessoa pode ver. Plano: docs/PLANO_AJUDA.md.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import HelpContent from '@/components/help/HelpContent';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useHelpStore } from '@/store/helpStore';
import { useAuth } from '@/hooks/useAuth';
import { useIsDesktop } from '@/hooks/useLayout';
import useBackToList from '@/hooks/useBackToList';
import { buildSearchIndex, matchesSearch } from '@/utils/searchMatch';
import { canSeeHelp, HELP_ENTRIES, HELP_GROUPS, helpById, helpSearchText, type HelpEntry } from '@/constants/help';

export default function HelpScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const { goBack } = useBackToList('/(tabs)/more');
  const openSheet = useHelpStore((s) => s.open);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(
    () => HELP_ENTRIES.filter((e) => canSeeHelp(e, user?.role)).map((e) => ({ e, index: buildSearchIndex(helpSearchText(e)) })),
    [user?.role],
  );
  const found = visible.filter((v) => matchesSearch(v.index, query)).map((v) => v.e);
  const groups = HELP_GROUPS.map((g) => ({ ...g, items: found.filter((e) => e.group === g.key) })).filter((g) => g.items.length);
  const current = helpById(selected) ?? (isDesktop ? found[0] : undefined);

  const pick = (e: HelpEntry) => (isDesktop ? setSelected(e.id) : openSheet(e.id));

  const list = (
    <View style={styles.list}>
      <TextInput mode="outlined" placeholder="Buscar: troca, caixa, PIX..." value={query} onChangeText={setQuery}
        left={<TextInput.Icon icon="magnify" />} activeOutlineColor={brand.primary} dense accessibilityLabel="Buscar na ajuda" />
      {!groups.length && <Text style={styles.empty}>Nada encontrado para “{query}”. Tente outra palavra.</Text>}
      {groups.map((g) => (
        <View key={g.key} style={styles.group}>
          <View style={styles.groupHead}>
            <Ionicons name={g.icon as any} size={16} color={brand.primary} />
            <Text style={styles.groupTitle}>{g.title}</Text>
          </View>
          {g.items.map((e) => {
            const on = isDesktop && current?.id === e.id;
            return (
              <TouchableOpacity key={e.id} onPress={() => pick(e)} activeOpacity={0.75} accessibilityRole="button"
                style={[styles.item, on && { borderColor: brand.primary, backgroundColor: brand.primary + '0F' }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.itemTitle, on && { color: brand.primary }]}>{e.title}</Text>
                  <Text style={styles.itemPurpose} numberOfLines={2}>{e.purpose}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <Text style={styles.tip}>
        Em qualquer tela, toque no “?” no alto para ver a ajuda dela{isDesktop ? ' (ou aperte F1)' : ''}.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Central de Ajuda" subtitle="Como usar cada tela do Provador" showBackButton onBack={goBack} />
      {isDesktop ? (
        <View style={styles.split}>
          <ScrollView style={styles.left} contentContainerStyle={styles.leftContent}>{list}</ScrollView>
          <ScrollView style={styles.right} contentContainerStyle={styles.rightContent}>
            {!!current && (
              <View style={styles.detail}>
                <Text style={styles.detailTitle}>{current.title}</Text>
                <HelpContent entry={current} onOpenRelated={setSelected} />
                {!!current.open && (
                  <TouchableOpacity style={[styles.openBtn, { backgroundColor: brand.primary }]} accessibilityRole="button"
                    onPress={() => router.push(current.open as any)}>
                    <Text style={styles.openText}>Abrir esta tela</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.mobileContent}>{list}</ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  mobileContent: { padding: 16, paddingBottom: 48 },
  split: { flex: 1, flexDirection: 'row' },
  left: { width: 380, flexGrow: 0, borderRightWidth: 1, borderRightColor: Colors.light.border },
  leftContent: { padding: 20, paddingBottom: 48 },
  right: { flex: 1 },
  rightContent: { padding: 28, paddingBottom: 48 },
  detail: { maxWidth: 720, gap: 16 },
  detailTitle: { fontSize: 22, fontWeight: '800', color: Colors.light.text },
  list: { gap: 16 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTitle: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.card, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  itemTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  itemPurpose: { fontSize: 13, lineHeight: 18, color: Colors.light.textSecondary },
  empty: { color: Colors.light.textSecondary, textAlign: 'center', marginTop: 12 },
  tip: { fontSize: 13, color: Colors.light.textTertiary, lineHeight: 19 },
  openBtn: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  openText: { color: Colors.light.white, fontWeight: '700', fontSize: 14 },
});

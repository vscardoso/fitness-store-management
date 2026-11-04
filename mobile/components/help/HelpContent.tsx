/**
 * Corpo de uma ficha de ajuda (constants/help): para que serve, passo a passo, partes da tela, bom saber, diferenças
 * do notebook e do celular, quem usa e telas ligadas. Usado na folha do celular, no painel do notebook e na Central.
 */
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useIsDesktop } from '@/hooks/useLayout';
import { helpById, type HelpEntry, type HelpRole } from '@/constants/help';

const ROLE_LABEL: Record<HelpRole, string> = { cashier: 'caixa', seller: 'vendedor', manager: 'gerente', admin: 'admin' };

/** Nomes de botão vêm entre aspas curvas: aparecem em negrito, com as aspas. */
function Rich({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(“[^”]+”)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) => (p.startsWith('“') ? <Text key={i} style={styles.strong}>{p}</Text> : p))}
    </Text>
  );
}

function Section({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }) {
  const brand = useBrandingColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={brand.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function HelpContent({ entry, onOpenRelated }: { entry: HelpEntry; onOpenRelated?: (id: string) => void }) {
  const brand = useBrandingColors();
  // no app web as diferenças do notebook valem para quem está no notebook; no celular, as do celular
  const isDesktop = useIsDesktop();
  const showWeb = Platform.OS === 'web' && isDesktop;
  const diffs = showWeb ? entry.web : entry.mobile;
  const related = (entry.related ?? []).map((id) => helpById(id)).filter(Boolean) as HelpEntry[];

  return (
    <View style={styles.wrap}>
      <Rich text={entry.purpose} style={styles.purpose} />

      <Section icon="list-outline" title="Como usar">
        {entry.steps.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepNum, { backgroundColor: brand.primary + '18' }]}>
              <Text style={[styles.stepNumText, { color: brand.primary }]}>{i + 1}</Text>
            </View>
            <Rich text={s} style={styles.body} />
          </View>
        ))}
      </Section>

      {!!entry.parts?.length && (
        <Section icon="grid-outline" title="O que aparece na tela">
          {entry.parts.map((p, i) => (
            <Text key={i} style={styles.body}>
              <Text style={styles.strong}>{p.label}: </Text>
              <Rich text={p.text} />
            </Text>
          ))}
        </Section>
      )}

      {!!entry.goodToKnow?.length && (
        <Section icon="bulb-outline" title="Bom saber">
          {entry.goodToKnow.map((g, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={[styles.dot, { color: brand.primary }]}>•</Text>
              <Rich text={g} style={styles.body} />
            </View>
          ))}
        </Section>
      )}

      {!!diffs?.length && (
        <Section icon={showWeb ? 'laptop-outline' : 'phone-portrait-outline'} title={showWeb ? 'No computador' : 'No celular'}>
          {diffs.map((g, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={[styles.dot, { color: brand.primary }]}>•</Text>
              <Rich text={g} style={styles.body} />
            </View>
          ))}
        </Section>
      )}

      {!!entry.roles && (
        <Text style={styles.roles}>
          Quem usa: {entry.roles.map((r) => ROLE_LABEL[r]).concat(entry.roles.includes('admin') ? [] : ['admin']).join(', ')}.
        </Text>
      )}

      {!!related.length && !!onOpenRelated && (
        <View style={styles.related}>
          <Text style={styles.sectionTitle}>Veja também</Text>
          {related.map((r) => (
            <TouchableOpacity key={r.id} onPress={() => onOpenRelated(r.id)} style={styles.relatedRow} accessibilityRole="link">
              <Text style={[styles.relatedText, { color: brand.primary }]}>{r.title}</Text>
              <Ionicons name="chevron-forward" size={14} color={brand.primary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  purpose: { fontSize: 15, lineHeight: 22, color: Colors.light.text },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.light.text },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 12, fontWeight: '800' },
  body: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.light.textSecondary },
  strong: { fontWeight: '700', color: Colors.light.text },
  bullet: { flexDirection: 'row', gap: 8 },
  dot: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  roles: { fontSize: 13, color: Colors.light.textTertiary },
  related: { gap: 6 },
  relatedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  relatedText: { fontSize: 14, fontWeight: '700' },
});

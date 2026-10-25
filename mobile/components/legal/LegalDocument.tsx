import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { BRAND } from '@/constants/Brand';
import { LEGAL_VERSION, type LegalSection } from '@/constants/legal';
import { ProvadorLogo } from '@/components/branding/ProvadorLogo';

interface LegalDocumentProps {
  title: string;
  sections: LegalSection[];
}

/** Página pública (abre sem login) com um texto legal do Provador. */
export function LegalDocument({ title, sections }: LegalDocumentProps) {
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const [y, m, d] = LEGAL_VERSION.split('-');

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={24} color={BRAND.ink} />
        </TouchableOpacity>
        <ProvadorLogo size={30} variant="icon" withName nameColor={BRAND.ink} />
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.version}>Versão de {d}/{m}/{y}</Text>
          {sections.map((s) => (
            <View key={s.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              {s.paragraphs.map((p, i) => (
                <Text key={i} style={styles.paragraph}>{p}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEAF4',
  },
  scroll: { paddingHorizontal: 20, paddingVertical: 24 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: BRAND.ink, letterSpacing: -0.4 },
  version: { fontSize: 13, color: '#6B6480', marginTop: 4, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: BRAND.ink, marginBottom: 8 },
  paragraph: { fontSize: 15, lineHeight: 23, color: '#2E2742', marginBottom: 8 },
});

export default LegalDocument;

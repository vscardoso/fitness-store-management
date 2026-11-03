/**
 * Rota "pega tudo": sem ela, endereço que não é tela do app mostra o "Unmatched Route" do expo-router por conta própria,
 * sem passar pelo _layout. É o caso da vitrine (loja.provadorfit.com.br/{loja}/{produto}): o caminho não é tela do
 * sistema, mas tem de cair no app para virar a página do produto. No endereço do sistema, vira "página não encontrada".
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import ProdutoVitrine from '@/components/vitrine/ProdutoVitrine';
import { Colors, theme } from '@/constants/Colors';
import { vitrineFromLocation } from '@/utils/vitrineUrl';

export default function PegaTudo() {
  const vitrine = vitrineFromLocation();
  if (vitrine) return <ProdutoVitrine store={vitrine.slug} id={vitrine.id} />;
  return (
    <View style={styles.center}>
      <Ionicons name="compass-outline" size={40} color={Colors.light.textTertiary} />
      <Text style={styles.title}>Página não encontrada</Text>
      <Text style={styles.text}>O endereço pode estar errado ou a página mudou de lugar.</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/')} accessibilityRole="button">
        <Text style={styles.btnText}>Ir para o início</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: Colors.light.background },
  title: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.text },
  text: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, textAlign: 'center', maxWidth: 320 },
  btn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: Colors.light.primary },
  btnText: { color: '#fff', fontWeight: '800' },
});

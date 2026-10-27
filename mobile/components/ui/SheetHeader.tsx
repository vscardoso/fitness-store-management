/**
 * SheetHeader: cabeçalho padrão das janelas de baixo (mesmo visual do BottomSheet: degradê na cor da loja,
 * ícone, título, subtítulo e botão fechar). Para janelas com layout próprio (lista com busca, formulário
 * com teclado) que não cabem no BottomSheet.
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

interface Props {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onClose: () => void;
  /** Mostrar a barrinha de arrastar no topo (padrão: sim) */
  handle?: boolean;
}

export default function SheetHeader({ title, subtitle, icon, onClose, handle = true }: Props) {
  const brand = useBrandingColors();
  return (
    <LinearGradient
      colors={[brand.primary, brand.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.header}
    >
      {handle && (
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>
      )}
      <View style={[styles.row, !handle && { paddingTop: 16 }]}>
        <View style={styles.left}>
          {icon && (
            <View style={styles.iconWrap}>
              <Ionicons name={icon} size={20} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={12} accessibilityLabel="Fechar">
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  handleContainer: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: theme.fontSize.base, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: theme.fontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});

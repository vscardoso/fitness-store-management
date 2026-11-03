/**
 * Vitrine pública do produto: é o link "ver no site" do catálogo da loja no WhatsApp e no Instagram (feed da Meta,
 * `catalog_feed_service._product_link`). Abre sem login em loja.provadorfit.com.br/{slug}/{id} (endereço só de vitrine,
 * ver `utils/vitrineUrl.ts`) e, para links antigos, em app.provadorfit.com.br/produtos/{id}?store={slug}.
 * Mostra só o que a cliente pode ver (fotos, nome, preço, cores e tamanhos com peça) e leva a conversa para o WhatsApp
 * da loja com a peça escolhida já escrita. Nunca mostra marca, custo nem quantidade (o servidor já tira).
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { API_CONFIG } from '@/constants/Config';
import { Colors, theme } from '@/constants/Colors';
import { BRAND } from '@/constants/Brand';
import { Money } from '@/components/ui/PriceDisplay';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

interface Showcase {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
  price_min: number;
  price_max: number;
  in_stock: boolean;
  colors: string[];
  sizes: string[];
  photos: string[];
  store: { name: string; logo_url: string | null; primary_color: string | null; whatsapp: string | null };
}

const MAX_W = 560;

function whatsappText(p: Showcase, color: string | null, size: string | null): string {
  const peca = [p.name, p.code].filter(Boolean).join(' ');
  const escolha = [color && `cor ${color}`, size && `tamanho ${size}`].filter(Boolean).join(', ');
  return `Olá! Tenho interesse em: ${peca}${escolha ? ` (${escolha})` : ''}. Ainda tem?`;
}

export default function ProdutoVitrine({ store, id }: { store?: string | null; id?: string | null }) {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Showcase | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [foto, setFoto] = useState(0);
  const [cor, setCor] = useState<string | null>(null);
  const [tamanho, setTamanho] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !store) {
      setErro('Link incompleto. Peça o link do produto de novo para a loja.');
      return;
    }
    const url = `${API_CONFIG.BASE_URL}/public/vitrine/${encodeURIComponent(String(store))}/produtos/${encodeURIComponent(String(id))}`;
    fetch(url)
      .then(async (r) => {
        if (r.status === 404) throw new Error('Este produto não está mais à venda.');
        if (!r.ok) throw new Error('Não foi possível abrir o produto agora. Tente de novo em instantes.');
        return r.json();
      })
      .then((d: Showcase) => {
        setData(d);
        if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = `${d.name} | ${d.store.name}`;
      })
      .catch((e) => setErro(e?.message || 'Não foi possível abrir o produto agora.'));
  }, [id, store]);

  const accent = data?.store.primary_color || BRAND.magenta;
  const pageW = Math.min(width, MAX_W);
  const styles = useMemo(() => makeStyles(accent), [accent]);

  const pedir = () => {
    if (!data?.store.whatsapp) return;
    const href = `https://wa.me/${data.store.whatsapp}?text=${encodeURIComponent(whatsappText(data, cor, tamanho))}`;
    if (Platform.OS === 'web') window.open(href, '_blank');
    else Linking.openURL(href);
  };

  if (erro) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="bag-remove-outline" size={40} color={Colors.light.textTertiary} />
        <Text style={styles.erro}>{erro}</Text>
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={accent} />
      </SafeAreaView>
    );
  }

  const faixa = data.price_max > data.price_min;
  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      <View style={styles.storeBar}>
        <View style={[styles.page, styles.storeRow]}>
          {data.store.logo_url ? <Image source={{ uri: data.store.logo_url }} style={styles.logo} /> : null}
          <Text style={styles.storeName} numberOfLines={1}>{data.store.name}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {data.photos.length > 0 ? (
            <View>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setFoto(Math.round(e.nativeEvent.contentOffset.x / pageW))}
                onScroll={(e) => setFoto(Math.round(e.nativeEvent.contentOffset.x / pageW))}
                scrollEventThrottle={100}
              >
                {data.photos.map((src) => (
                  <Image key={src} source={{ uri: src }} style={[styles.photo, { width: pageW }]} resizeMode="cover"
                    accessibilityLabel={`Foto de ${data.name}`} />
                ))}
              </ScrollView>
              {data.photos.length > 1 && (
                <View style={styles.dots}>
                  {data.photos.map((src, i) => <View key={src} style={[styles.dot, i === foto && styles.dotOn]} />)}
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.body}>
            <Text style={styles.name} accessibilityRole="header">{data.name}</Text>
            <View style={styles.priceRow}>
              {faixa ? <Text style={styles.from}>a partir de</Text> : null}
              <Money value={data.price_min} size={26} color={Colors.light.text} />
            </View>
            <View style={[styles.stock, !data.in_stock && styles.stockOff]}>
              <Ionicons name={data.in_stock ? 'checkmark-circle' : 'time-outline'} size={14}
                color={data.in_stock ? Colors.light.success : Colors.light.textSecondary} />
              <Text style={[styles.stockText, !data.in_stock && styles.stockTextOff]}>
                {data.in_stock ? 'Disponível' : 'Esgotado no momento'}
              </Text>
            </View>

            {data.colors.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Cor</Text>
                <View style={styles.chips}>
                  {data.colors.map((c) => (
                    <TouchableOpacity key={c} style={[styles.chip, cor === c && styles.chipOn]} onPress={() => setCor(cor === c ? null : c)}
                      accessibilityRole="radio" accessibilityState={{ selected: cor === c }}>
                      <Text style={[styles.chipText, cor === c && styles.chipTextOn]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {data.sizes.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Tamanho</Text>
                <View style={styles.chips}>
                  {data.sizes.map((s) => (
                    <TouchableOpacity key={s} style={[styles.chip, styles.chipSize, tamanho === s && styles.chipOn]}
                      onPress={() => setTamanho(tamanho === s ? null : s)}
                      accessibilityRole="radio" accessibilityState={{ selected: tamanho === s }}>
                      <Text style={[styles.chipText, tamanho === s && styles.chipTextOn]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {data.description ? <Text style={styles.description}>{data.description}</Text> : null}
            {data.code ? <Text style={styles.code}>Código {data.code}</Text> : null}
          </View>
        </View>
      </ScrollView>

      {data.store.whatsapp ? (
        <View style={styles.bar}>
          <View style={styles.page}>
            <TouchableOpacity style={styles.cta} onPress={pedir} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={styles.ctaText}>{data.in_stock ? 'Pedir pelo WhatsApp' : 'Avise-me pelo WhatsApp'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (accent: string) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: Colors.light.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: Colors.light.background },
    erro: { fontSize: theme.fontSize.base, color: Colors.light.textSecondary, textAlign: 'center', maxWidth: 320 },
    page: { width: '100%', maxWidth: MAX_W, alignSelf: 'center' },
    storeBar: { borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.card },
    storeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
    logo: { width: 32, height: 32, borderRadius: 16 },
    storeName: { flex: 1, fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
    scroll: { paddingBottom: 110 },
    photo: { aspectRatio: 3 / 4, backgroundColor: Colors.light.backgroundSecondary },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.light.border },
    dotOn: { backgroundColor: accent, width: 16 },
    body: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
    name: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: Colors.light.text },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    from: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
    stock: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 999, backgroundColor: Colors.light.success + '14' },
    stockOff: { backgroundColor: Colors.light.backgroundSecondary },
    stockText: { fontSize: theme.fontSize.xs, fontWeight: '700', color: Colors.light.success },
    stockTextOff: { color: Colors.light.textSecondary },
    block: { gap: 8, marginTop: 6 },
    blockTitle: { fontSize: theme.fontSize.sm, fontWeight: '800', color: Colors.light.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: Colors.light.card },
    chipSize: { minWidth: 48, alignItems: 'center' },
    chipOn: { borderColor: accent, backgroundColor: accent + '14' },
    chipText: { fontSize: theme.fontSize.sm, fontWeight: '600', color: Colors.light.text },
    chipTextOn: { color: accent },
    description: { fontSize: theme.fontSize.sm, lineHeight: 21, color: Colors.light.textSecondary, marginTop: 8 },
    code: { fontSize: theme.fontSize.xs, color: Colors.light.textTertiary, marginTop: 4 },
    bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 20, backgroundColor: Colors.light.background,
      borderTopWidth: 1, borderTopColor: Colors.light.border },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 15,
      backgroundColor: Colors.light.success },
    ctaText: { color: '#fff', fontSize: theme.fontSize.base, fontWeight: '800' },
  });

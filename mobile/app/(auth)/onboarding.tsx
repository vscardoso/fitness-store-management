/**
 * Apresentação do Provador (primeiro acesso).
 *
 * O passo atual é estado da tela (não rolagem de lista): o botão Continuar só troca o índice,
 * o que funciona igual no navegador, no Android e no iPhone. Deslizar o dedo também troca de passo
 * (onTouchStart/onTouchEnd; o PanResponder perdia o gesto depois da troca de conteúdo no navegador).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  StatusBar,
  AccessibilityInfo,
  GestureResponderEvent,
  Platform,
  ScrollView,
} from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProvadorLogo } from '@/components/branding/ProvadorLogo';
import { BRAND, BRAND_GRADIENT } from '@/constants/Brand';

const ONBOARDING_COMPLETED_KEY = '@fitness_store:onboarding_completed';
const SWIPE_MIN_DX = 50;

interface Step {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  kicker: string;
  title: string;
  description: string;
  highlights: string[];
}

const STEPS: Step[] = [
  {
    id: 'loja',
    icon: 'shirt-outline',
    kicker: 'SUA LOJA NUM LUGAR SÓ',
    title: 'Feito para loja de moda fitness',
    description:
      'Produtos com tamanho e cor, estoque, vendas e clientes conectados. Use no celular ou no computador.',
    highlights: ['Grade de tamanhos e cores', 'Estoque que baixa sozinho na venda', 'Equipe com acesso por função'],
  },
  {
    id: 'venda',
    icon: 'bag-handle-outline',
    kicker: 'VENDA SEM COMPLICAÇÃO',
    title: 'No balcão ou na casa da cliente',
    description:
      'Leia o código da peça, monte o carrinho e receba em dinheiro, PIX ou cartão. Mande peças para a cliente provar em casa e registre o que ela ficou.',
    highlights: ['Caixa com leitor de código', 'Envio condicional para provar em casa', 'Troca e devolução registradas'],
  },
  {
    id: 'lucro',
    icon: 'trending-up-outline',
    kicker: 'DINHEIRO NA MÃO',
    title: 'Saiba quanto cada compra rendeu',
    description:
      'Veja o lucro de cada lote de mercadoria, já com frete e gastos da viagem, e receba aviso antes de faltar peça.',
    highlights: ['Lucro por lote de compra', 'Aviso de estoque baixo', 'Resultado do mês em linguagem simples'],
  },
];

export default function OnboardingScreen() {
  const [showIntro, setShowIntro] = useState(true);
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const enter = useRef(new Animated.Value(1)).current;
  const direction = useRef(1);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [index, reduceMotion, enter]);

  const goTo = (next: number) => {
    if (next < 0 || next >= STEPS.length || next === index) return;
    direction.current = next > index ? 1 : -1;
    setIndex(next);
  };

  const finish = async (route: '/(auth)/login' | '/(auth)/signup') => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    } finally {
      router.replace(route);
    }
  };

  // Deslizar o dedo: compara onde o toque começou e onde terminou
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pointOf = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.changedTouches?.[0] ?? e.nativeEvent;
    return { x: t.pageX, y: t.pageY };
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    touchStart.current = pointOf(e);
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const end = pointOf(e);
    const dx = end.x - start.x;
    if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < Math.abs(end.y - start.y) * 1.5) return;
    goTo(dx < 0 ? index + 1 : index - 1);
  };

  const translateX = enter.interpolate({ inputRange: [0, 1], outputRange: [24 * direction.current, 0] });

  if (showIntro) {
    return <BrandIntro reduceMotion={reduceMotion} onStart={() => setShowIntro(false)} onLogin={() => finish('/(auth)/login')} />;
  }

  return (
    <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <ProvadorLogo size={40} variant="mark" color="#FFFFFF" withName nameColor="#FFFFFF" />
          {!isLast && (
            <TouchableOpacity onPress={() => finish('/(auth)/login')} hitSlop={12} accessibilityRole="button">
              <Text style={styles.skip}>Pular</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.fill, styles.swipeArea]} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.content, { opacity: enter, transform: [{ translateX }] }]}>
            <View style={styles.iconWrap}>
              <Ionicons name={step.icon} size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.kicker}>{step.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">{step.title}</Text>
            <Text style={styles.description}>{step.description}</Text>

            <View style={styles.card}>
              {step.highlights.map((h) => (
                <View key={h} style={styles.highlight}>
                  <View style={styles.check}>
                    <Ionicons name="checkmark" size={14} color={BRAND.violet} />
                  </View>
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots} accessibilityLabel={`Passo ${index + 1} de ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <TouchableOpacity key={s.id} onPress={() => goTo(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Ir para o passo ${i + 1}`}>
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.88}
            onPress={() => (isLast ? finish('/(auth)/signup') : goTo(index + 1))}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{isLast ? 'Criar minha conta' : 'Continuar'}</Text>
            <Ionicons name="arrow-forward" size={18} color={BRAND.violet} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => finish('/(auth)/login')} accessibilityRole="button">
            <Text style={styles.secondaryText}>Já tenho conta</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/** Abertura da marca: primeira coisa que a pessoa vê no primeiro acesso. */
function BrandIntro({ reduceMotion, onStart, onLogin }: { reduceMotion: boolean; onStart: () => void; onLogin: () => void }) {
  const appear = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.sequence([
      Animated.spring(appear, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [appear, rise, reduceMotion]);

  const logoScale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const textY = rise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <LinearGradient colors={[BRAND.ink, '#3B1470', BRAND.violet, BRAND.magenta]} locations={[0, 0.35, 0.72, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.fill}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.introCenter}>
          <Animated.View style={[styles.introGlow, { opacity: appear, transform: [{ scale: logoScale }] }]}>
            <ProvadorLogo size={132} variant="icon" />
          </Animated.View>
          <Animated.View style={{ alignItems: 'center', opacity: rise, transform: [{ translateY: textY }] }}>
            <Text style={styles.introName} accessibilityRole="header">{BRAND.name}</Text>
            <Text style={styles.introTagline}>{BRAND.tagline}</Text>
          </Animated.View>
        </View>
        <Animated.View style={[styles.footer, { opacity: rise }]}>
          <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.88} onPress={onStart} accessibilityRole="button">
            <Text style={styles.primaryText}>Começar</Text>
            <Ionicons name="arrow-forward" size={18} color={BRAND.violet} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onLogin} accessibilityRole="button">
            <Text style={styles.secondaryText}>Já tenho conta</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  introCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 28 },
  introGlow: {
    borderRadius: 40,
    shadowColor: BRAND.magenta,
    shadowOpacity: 0.55,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  introName: { color: '#FFFFFF', fontSize: 46, fontWeight: '800', letterSpacing: -1.2 },
  introTagline: { color: 'rgba(255,255,255,0.88)', fontSize: 17, marginTop: 6, textAlign: 'center' },
  fill: { flex: 1 },
  // No navegador, o gesto horizontal é do app: sem isso, deslizar para a direita volta a página
  swipeArea: Platform.OS === 'web' ? ({ touchAction: 'pan-y' } as object) : {},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  skip: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', opacity: 0.9 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  kicker: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: '#FFFFFF', fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5, marginBottom: 12 },
  description: { color: 'rgba(255,255,255,0.92)', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, gap: 14 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightText: { flex: 1, color: BRAND.ink, fontSize: 15, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingBottom: 16, gap: 12, width: '100%', maxWidth: 488, alignSelf: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { width: 24, backgroundColor: '#FFFFFF' },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { color: BRAND.violet, fontSize: 17, fontWeight: '800' },
  secondaryBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

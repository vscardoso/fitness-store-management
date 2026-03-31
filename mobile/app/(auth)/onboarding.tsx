import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  FlatList,
  ViewToken,
  Animated,
  TouchableOpacity,
  StatusBar,
  AccessibilityInfo,
} from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface IntroSlide {
  id: string;
  kicker: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  palette: [string, string];
  highlights: string[];
}

const ONBOARDING_COMPLETED_KEY = '@fitness_store:onboarding_completed';

const INTRO_SLIDES: IntroSlide[] = [
  {
    id: 'store',
    kicker: 'GESTAO CENTRALIZADA',
    title: 'Sua operacao em uma unica plataforma',
    description:
      'Produtos, estoque e vendas conectados para voce trabalhar com clareza e velocidade.',
    icon: 'storefront-outline',
    palette: ['#1A1F36', '#243B6B'],
    highlights: ['Catalogo e estoque integrados', 'Multiusuario por loja', 'Fluxo sem retrabalho'],
  },
  {
    id: 'pos',
    kicker: 'PDV PROFISSIONAL',
    title: 'Venda rapido, com controle real de estoque',
    description:
      'Scanner, carrinho inteligente e validacoes em tempo real para atendimento sem erro.',
    icon: 'flash-outline',
    palette: ['#0F3B2E', '#1A6A52'],
    highlights: ['Escaneamento e busca agil', 'Pagamentos mistos', 'Sincronizacao imediata'],
  },
  {
    id: 'insights',
    kicker: 'INTELIGENCIA DE NEGOCIO',
    title: 'Decida melhor com dados acionaveis',
    description:
      'Dashboards e alertas objetivos para antecipar ruptura e aumentar margem.',
    icon: 'stats-chart-outline',
    palette: ['#3B1F1A', '#A14123'],
    highlights: ['Alertas de estoque baixo', 'Historico de vendas completo', 'Visao diaria de performance'],
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const flatListRef = useRef<FlatList<IntroSlide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const introProgress = useRef(new Animated.Value(0)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;
  const ambientProgress = useRef(new Animated.Value(0)).current;

  const isLast = currentIndex === INTRO_SLIDES.length - 1;

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotionEnabled(enabled);
        }
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotionEnabled) {
      introProgress.setValue(1);
      return;
    }

    introProgress.setValue(0);
    Animated.timing(introProgress, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [introProgress, reduceMotionEnabled]);

  useEffect(() => {
    if (reduceMotionEnabled) {
      ctaPulse.stopAnimation();
      ctaPulse.setValue(1);
      return;
    }

    ctaPulse.setValue(1);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, {
          toValue: 1.06,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(ctaPulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [ctaPulse, currentIndex, reduceMotionEnabled]);

  useEffect(() => {
    if (reduceMotionEnabled) {
      ambientProgress.setValue(0.5);
      return;
    }

    ambientProgress.setValue(0);
    const ambientLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientProgress, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(ambientProgress, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );

    ambientLoop.start();

    return () => {
      ambientLoop.stop();
    };
  }, [ambientProgress, reduceMotionEnabled]);

  const cinematicOpacity = reduceMotionEnabled ? 1 : introProgress;
  const cinematicTranslateY = reduceMotionEnabled
    ? 0
    : introProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [28, 0],
      });

  const cinematicPanelTranslateY = reduceMotionEnabled
    ? 0
    : introProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [36, 0],
      });

  const cinematicScale = reduceMotionEnabled
    ? 1
    : introProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.95, 1],
      });

  const ambientTopTranslateY = reduceMotionEnabled
    ? 0
    : ambientProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-12, 12],
      });

  const ambientTopScale = reduceMotionEnabled
    ? 1
    : ambientProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.95, 1.06],
      });

  const ambientBottomTranslateY = reduceMotionEnabled
    ? 0
    : ambientProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [10, -10],
      });

  const ambientBottomScale = reduceMotionEnabled
    ? 1
    : ambientProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1.04, 0.96],
      });

  const ctaGradient = useMemo<[string, string]>(() => INTRO_SLIDES[currentIndex].palette, [currentIndex]);

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    router.replace('/(auth)/login');
  };

  const handleNext = () => {
    if (isLast) {
      void finishOnboarding();
      return;
    }
    flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
  };

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const renderSlide = ({ item, index }: { item: IntroSlide; index: number }) => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];

    const cardOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.55, 1, 0.55],
      extrapolate: 'clamp',
    });

    const cardScale = scrollX.interpolate({
      inputRange,
      outputRange: [0.95, 1, 0.95],
      extrapolate: 'clamp',
    });

    const cardGlowOpacity = reduceMotionEnabled
      ? (index === currentIndex ? 0.22 : 0.08)
      : scrollX.interpolate({
          inputRange,
          outputRange: [0.08, 0.25, 0.08],
          extrapolate: 'clamp',
        });

    const iconTranslateY = reduceMotionEnabled
      ? 0
      : scrollX.interpolate({
          inputRange,
          outputRange: [16, 0, -16],
          extrapolate: 'clamp',
        });

    const titleTranslateY = reduceMotionEnabled
      ? 0
      : scrollX.interpolate({
          inputRange,
          outputRange: [20, 0, -20],
          extrapolate: 'clamp',
        });

    const descriptionTranslateY = reduceMotionEnabled
      ? 0
      : scrollX.interpolate({
          inputRange,
          outputRange: [14, 0, -14],
          extrapolate: 'clamp',
        });

    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <View style={styles.slideGradient}>
          <Animated.View
            style={[
              styles.backShapeTop,
              {
                transform: [{ translateY: ambientTopTranslateY }, { scale: ambientTopScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.backShapeBottom,
              {
                transform: [{ translateY: ambientBottomTranslateY }, { scale: ambientBottomScale }],
              },
            ]}
          />

          <Animated.View style={[styles.contentCard, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
            <Animated.View style={[styles.cardGlow, { opacity: cardGlowOpacity }]} pointerEvents="none" />

            <Animated.View style={{ transform: [{ translateY: iconTranslateY }] }}>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={30} color="#fff" />
              </View>
            </Animated.View>

            <Text style={styles.kicker}>{item.kicker}</Text>
            <Animated.View style={{ transform: [{ translateY: titleTranslateY }] }}>
              <Text style={styles.title}>{item.title}</Text>
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: descriptionTranslateY }] }}>
              <Text style={styles.description}>{item.description}</Text>
            </Animated.View>

            <View style={styles.highlightsWrap}>
              {item.highlights.map((h, idx) => {
                const staggerInputRange = [
                  (index - 1) * SCREEN_WIDTH,
                  index * SCREEN_WIDTH + idx * 28,
                  (index + 1) * SCREEN_WIDTH,
                ];

                const highlightOpacity = reduceMotionEnabled
                  ? 1
                  : scrollX.interpolate({
                      inputRange: staggerInputRange,
                      outputRange: [0.05, 1, 0.15],
                      extrapolate: 'clamp',
                    });

                const highlightTranslateY = reduceMotionEnabled
                  ? 0
                  : scrollX.interpolate({
                      inputRange: staggerInputRange,
                      outputRange: [12, 0, -8],
                      extrapolate: 'clamp',
                    });

                return (
                  <Animated.View
                    key={`${item.id}-${idx}`}
                    style={[
                      styles.highlightRow,
                      {
                        opacity: highlightOpacity,
                        transform: [{ translateY: highlightTranslateY }],
                      },
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#EAF8EE" />
                    <Text style={styles.highlightText}>{h}</Text>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.backgroundLayer} pointerEvents="none">
        {INTRO_SLIDES.map((slide, i) => {
          const inputRange = [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH];
          const opacity = reduceMotionEnabled
            ? (i === currentIndex ? 1 : 0)
            : scrollX.interpolate({
                inputRange,
                outputRange: [0, 1, 0],
                extrapolate: 'clamp',
              });

          return (
            <Animated.View key={`bg-${slide.id}`} style={[styles.absoluteFill, { opacity }]}>
              <LinearGradient
                colors={slide.palette}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.absoluteFill}
              />
            </Animated.View>
          );
        })}
      </View>

      <Animated.FlatList
        style={{ opacity: cinematicOpacity, transform: [{ translateY: cinematicTranslateY }, { scale: cinematicScale }] }}
        ref={flatListRef}
        data={INTRO_SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      />

      <Animated.View style={{ opacity: cinematicOpacity, transform: [{ translateY: cinematicTranslateY }] }}>
        <SafeAreaView edges={['top']} style={styles.topActions}>
          <TouchableOpacity style={styles.skipChip} onPress={finishOnboarding} activeOpacity={0.8}>
            <Text style={styles.skipText}>Pular</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>

      <Animated.View style={{ opacity: cinematicOpacity, transform: [{ translateY: cinematicPanelTranslateY }] }}>
      <SafeAreaView edges={['bottom']} style={styles.bottomPanel}>
        <View style={styles.dotsRow}>
          {INTRO_SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH];
            const scaleX = reduceMotionEnabled
              ? (i === currentIndex ? 3.25 : 1)
              : scrollX.interpolate({
                  inputRange,
                  outputRange: [1, 3.25, 1],
                  extrapolate: 'clamp',
                });
            const opacity = reduceMotionEnabled
              ? (i === currentIndex ? 1 : 0.35)
              : scrollX.interpolate({
                  inputRange,
                  outputRange: [0.35, 1, 0.35],
                  extrapolate: 'clamp',
                });

            return <Animated.View key={`dot-${i}`} style={[styles.dot, { opacity, transform: [{ scaleX }] }]} />;
          })}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={finishOnboarding} activeOpacity={0.88}>
            <Text style={styles.secondaryBtnText}>Ja tenho conta</Text>
          </TouchableOpacity>

          <Animated.View style={[styles.primaryBtnWrap, { transform: [{ scale: ctaPulse }] }]}> 
            <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.9}>
              <LinearGradient
                colors={ctaGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtnGradient}
              >
                <Text style={styles.primaryBtnText}>{isLast ? 'Entrar no app' : 'Continuar'}</Text>
                <Ionicons name={isLast ? 'rocket-outline' : 'arrow-forward'} size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1324',
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  slide: {
    flex: 1,
  },
  slideGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 96,
    paddingBottom: 186,
  },
  backShapeTop: {
    position: 'absolute',
    top: -60,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backShapeBottom: {
    position: 'absolute',
    bottom: 110,
    left: -35,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  contentCard: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: 'rgba(6, 10, 20, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 20,
    paddingVertical: 24,
    overflow: 'hidden',
  },
  cardGlow: {
    position: 'absolute',
    top: -80,
    left: '18%',
    width: 230,
    height: 230,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  kicker: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 14,
  },
  description: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  highlightsWrap: {
    gap: 10,
    marginTop: 2,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  highlightText: {
    color: '#F4FAF6',
    fontSize: 14,
    fontWeight: '600',
  },
  topActions: {
    position: 'absolute',
    top: 0,
    right: 16,
    zIndex: 5,
  },
  skipChip: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,10,20,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  skipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 14,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 99,
    backgroundColor: '#fff',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(9,13,24,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtnWrap: {
    flex: 1.3,
  },
  primaryBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});

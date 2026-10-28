/**
 * Rolagem horizontal que AVISA quando há mais itens escondidos: setas nas pontas (clicáveis) que só aparecem
 * quando há conteúdo para aquele lado. Use no lugar de `<ScrollView horizontal>` (chips de filtro, abas, listas de opções).
 * Aceita as mesmas props do ScrollView.
 */
import React, { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, ScrollViewProps, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

const EDGE = 6; // folga em px para considerar que chegou na ponta

export default function HScroll({ children, onScroll, onLayout, onContentSizeChange, ...rest }: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  const [x, setX] = useState(0);
  const [viewW, setViewW] = useState(0);
  const [contentW, setContentW] = useState(0);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setX(e.nativeEvent.contentOffset.x);
      onScroll?.(e);
    },
    [onScroll],
  );
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setViewW(e.nativeEvent.layout.width);
      onLayout?.(e);
    },
    [onLayout],
  );
  const handleContent = useCallback(
    (w: number, h: number) => {
      setContentW(w);
      onContentSizeChange?.(w, h);
    },
    [onContentSizeChange],
  );

  const overflow = contentW > viewW + EDGE && viewW > 0;
  const canLeft = overflow && x > EDGE;
  const canRight = overflow && contentW - viewW - x > EDGE;

  const scrollBy = (dir: 1 | -1) => {
    const target = Math.max(0, Math.min(contentW - viewW, x + dir * viewW * 0.7));
    ref.current?.scrollTo({ x: target, animated: true });
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        {...rest}
        onScroll={handleScroll}
        onLayout={handleLayout}
        onContentSizeChange={handleContent}
      >
        {children}
      </ScrollView>
      {canLeft && (
        <Pressable accessibilityRole="button" accessibilityLabel="Ver anteriores" onPress={() => scrollBy(-1)} style={[styles.arrow, styles.left]}>
          <Ionicons name="chevron-back" size={16} color={Colors.light.text} />
        </Pressable>
      )}
      {canRight && (
        <Pressable accessibilityRole="button" accessibilityLabel="Ver mais" onPress={() => scrollBy(1)} style={[styles.arrow, styles.right]}>
          <Ionicons name="chevron-forward" size={16} color={Colors.light.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  left: { left: 2 },
  right: { right: 2 },
});

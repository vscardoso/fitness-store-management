/**
 * Foto que só aparece inteira: enquanto baixa, o quadro mostra a lupa de carregando; quando termina (onLoad), a foto
 * entra de uma vez com um esmaecer curto. Sem isso a foto ia surgindo em faixas (JPEG progressivo, rede lenta).
 * Uso igual ao <Image> do react-native: o `style` é o do quadro (tamanho, borda, cantos).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, ImageProps, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';

interface Props extends ImageProps {
  /** Tamanho da lupa: "small" em miniaturas de lista, "large" em fotos grandes. Padrão: pelo tamanho do quadro. */
  loaderSize?: 'small' | 'large';
}

function sourceKey(source: ImageProps['source']): string {
  if (!source) return '';
  if (Array.isArray(source)) return source.map((s: any) => s?.uri ?? '').join('|');
  if (typeof source === 'object') return (source as any).uri ?? '';
  return String(source);
}

export default function LoadedImage({ style, source, onLoad, onError, loaderSize, resizeMode, ...rest }: Props) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const opacity = useRef(new Animated.Value(0)).current;
  const key = sourceKey(source);

  // outra foto no mesmo quadro: volta a esperar
  useEffect(() => {
    setState('loading');
    opacity.setValue(0);
  }, [key, opacity]);

  const flat = StyleSheet.flatten(style) || {};
  const small = loaderSize ? loaderSize === 'small' : typeof flat.width === 'number' && flat.width < 120;

  return (
    <View style={[styles.frame, style]}>
      <Animated.Image
        {...rest}
        source={source}
        resizeMode={resizeMode}
        style={[StyleSheet.absoluteFill, { opacity, width: '100%', height: '100%' }]}
        onLoad={(e) => {
          setState('ready');
          Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
          onLoad?.(e);
        }}
        onError={(e) => {
          setState('error');
          onError?.(e);
        }}
      />
      {state === 'loading' && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size={small ? 'small' : 'large'} color={Colors.light.textTertiary} />
        </View>
      )}
      {state === 'error' && (
        <View style={styles.center} pointerEvents="none">
          <Ionicons name="image-outline" size={small ? 18 : 28} color={Colors.light.textTertiary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: Colors.light.backgroundSecondary },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});


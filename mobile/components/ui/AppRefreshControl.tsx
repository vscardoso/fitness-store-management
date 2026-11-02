/**
 * "Puxar para atualizar" que também funciona no app web. O RefreshControl do react-native-web não faz nada (no iPhone
 * instalado o gesto simplesmente não existia). Usar no lugar do RefreshControl: `refreshControl={<AppRefreshControl .../>}`.
 * No celular nativo é o RefreshControl de sempre.
 *
 * Como funciona no web: o ScrollView do react-native-web embrulha a lista com o elemento passado em `refreshControl`;
 * aqui o embrulho escuta o toque e, com a lista no topo, puxar mais de 64 px e soltar chama `onRefresh`.
 */
import React, { useRef, useState } from 'react';
import { Platform, RefreshControl, RefreshControlProps, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';

const TRIGGER = 64;
const MAX = 96;

export default function AppRefreshControl(props: RefreshControlProps) {
  if (Platform.OS !== 'web') return <RefreshControl {...props} />;
  return <WebPullToRefresh {...props} />;
}

function scrollTopOf(wrapper: any): number {
  const el: any = wrapper?.lastElementChild ?? null;   // a lista é o último filho do embrulho
  return el && typeof el.scrollTop === 'number' ? el.scrollTop : 0;
}

function WebPullToRefresh({ refreshing, onRefresh, children, style, colors, enabled = true }: RefreshControlProps) {
  const wrapper = useRef<any>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);   // o soltar pode chegar antes do redesenho: decide pelo valor mais recente
  const setPullBoth = (v: number) => { pullRef.current = v; setPull(v); };
  const color = String(colors?.[0] ?? Colors.light.primary);

  const yOf = (e: any): number | null => {
    const t = e?.nativeEvent?.touches?.[0] ?? e?.nativeEvent?.changedTouches?.[0];
    return t ? t.pageY : null;
  };
  const onTouchStart = (e: any) => {
    startY.current = enabled && !refreshing && scrollTopOf(wrapper.current) <= 0 ? yOf(e) : null;
  };
  const onTouchMove = (e: any) => {
    if (startY.current === null) return;
    const y = yOf(e);
    if (y === null) return;
    const dy = y - startY.current;
    if (dy <= 0 || scrollTopOf(wrapper.current) > 0) {
      if (pullRef.current) setPullBoth(0);
      return;
    }
    setPullBoth(Math.min(MAX, dy * 0.5));
  };
  const onTouchEnd = () => {
    if (startY.current !== null && pullRef.current >= TRIGGER && onRefresh) onRefresh();
    startY.current = null;
    setPullBoth(0);
  };

  const shown = refreshing ? TRIGGER : pull;
  return (
    <View
      ref={wrapper}
      style={[style, styles.wrap]}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {shown > 0 && (
        <View pointerEvents="none" style={[styles.badge, { transform: [{ translateY: shown - 44 }] }]} testID="pull-to-refresh">
          {refreshing ? (
            <ActivityIndicator size="small" color={color} />
          ) : (
            <Ionicons
              name="arrow-down"
              size={20}
              color={color}
              style={{ transform: [{ rotate: pull >= TRIGGER ? '180deg' : '0deg' }] }}
            />
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  badge: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    zIndex: 5,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});

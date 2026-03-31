import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';

interface FitFlowLogoProps {
  size?: number;
  variant?: 'full' | 'icon' | 'minimal';
  dark?: boolean;
}

/**
 * Logo do app (Store Management).
 * Mantido no componente FitFlowLogo por compatibilidade com imports existentes.
 */
export function FitFlowLogo({
  size = 128,
  variant = 'full',
  dark = false,
}: FitFlowLogoProps) {
  const primaryColor = dark ? '#9db3ff' : '#667eea';
  const secondaryColor = dark ? '#8f72c9' : '#764ba2';
  const accentColor = '#10B981';
  const iconScale = variant === 'minimal' ? 0.92 : 1;
  const iconTranslate = (1 - iconScale) * 256;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 512 512">
        <Defs>
          <LinearGradient id="fitflow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={primaryColor} stopOpacity={1} />
            <Stop offset="100%" stopColor={secondaryColor} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="fitflow-soft" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity={0.06} />
          </LinearGradient>
        </Defs>

        <Rect x="24" y="24" width="464" height="464" rx="116" fill="url(#fitflow-gradient)" />
        <Rect x="40" y="40" width="432" height="432" rx="102" fill="url(#fitflow-soft)" />

        <Rect
          x={100 + iconTranslate}
          y={100 + iconTranslate}
          width={312 * iconScale}
          height={312 * iconScale}
          rx={64 * iconScale}
          fill="rgba(255,255,255,0.15)"
          stroke="rgba(255,255,255,0.42)"
          strokeWidth={10}
        />

        <Rect x="162" y="170" width="188" height="28" rx="14" fill="#ffffff" opacity={0.95} />
        <Rect x="162" y="236" width="188" height="28" rx="14" fill="#ffffff" opacity={0.95} />
        <Rect x="162" y="302" width="126" height="28" rx="14" fill="#ffffff" opacity={0.95} />

        {variant !== 'minimal' ? (
          <>
            <Path
              d="M296 292 L350 238 C356 232 366 232 372 238 C378 244 378 254 372 260 L307 325 C301 331 292 331 286 325 L250 289 C244 283 244 273 250 267 C256 261 266 261 272 267 L296 292 Z"
              fill={accentColor}
            />
            <Circle cx="372" cy="140" r="18" fill={accentColor} opacity={0.95} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FitFlowLogo;

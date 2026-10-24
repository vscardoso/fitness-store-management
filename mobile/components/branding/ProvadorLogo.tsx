import { useId } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path, G } from 'react-native-svg';
import { BRAND } from '@/constants/Brand';

type Variant = 'icon' | 'mark';

interface ProvadorLogoProps {
  size?: number;
  /** icon: quadrado em gradiente com o P branco; mark: só o P com o gancho */
  variant?: Variant;
  /** cor do traço no variant "mark" (padrão: violeta da marca) */
  color?: string;
  /** mostra o nome "Provador" ao lado */
  withName?: boolean;
  nameColor?: string;
}

/**
 * Logo do Provador: a letra P pendurada num gancho de cabide.
 * Abaixo de 56 px o traço fica mais grosso para continuar legível.
 */
export function ProvadorLogo({
  size = 128,
  variant = 'icon',
  color,
  withName = false,
  nameColor = BRAND.ink,
}: ProvadorLogoProps) {
  const uid = useId().replace(/:/g, '');
  const bold = size < 56;
  const stroke = variant === 'icon' ? '#FFFFFF' : color ?? BRAND.violet;
  const hook = bold ? 'M256 152 V124 A28 28 0 1 0 228 96' : 'M256 152 V126 A26 26 0 1 0 230 100';

  const logo = (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id={`g${uid}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor={BRAND.violet} />
          <Stop offset="1" stopColor={BRAND.magenta} />
        </LinearGradient>
        <RadialGradient id={`s${uid}`} cx="0.25" cy="0.12" r="0.75">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.28} />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {variant === 'icon' && (
        <>
          <Rect width="512" height="512" rx="128" fill={`url(#g${uid})`} />
          {!bold && <Rect width="512" height="512" rx="128" fill={`url(#s${uid})`} />}
        </>
      )}
      <G fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
        <Path d={hook} strokeWidth={bold ? 34 : 22} />
        <Path d="M178 404 V196 a44 44 0 0 1 44 -44 h52 a76 76 0 0 1 0 152 h-96" strokeWidth={bold ? 54 : 44} />
      </G>
    </Svg>
  );

  if (!withName) return logo;
  return (
    <View style={styles.row}>
      {logo}
      <Text style={[styles.name, { color: nameColor, fontSize: Math.round(size * 0.62) }]}>{BRAND.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontWeight: '800', letterSpacing: -0.5 },
});

export default ProvadorLogo;

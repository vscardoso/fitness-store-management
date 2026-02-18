/**
 * CreativeSpinner Component
 * Loading ultra criativo com órbitas, partículas e efeitos visuais
 */

import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';

interface CreativeSpinnerProps {
  size?: number;
}

export function CreativeSpinner({ size = 100 }: CreativeSpinnerProps) {
  // Animações
  const orbitRotate = useRef(new Animated.Value(0)).current;
  const orbit2Rotate = useRef(new Animated.Value(0)).current;
  const centerPulse = useRef(new Animated.Value(1)).current;
  const waveScale = useRef(new Animated.Value(0)).current;
  const particlePositions = useRef(
    Array.from({ length: 8 }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    // Órbita 1 - Rápida (horário)
    Animated.loop(
      Animated.timing(orbitRotate, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();

    // Órbita 2 - Lenta (anti-horário)
    Animated.loop(
      Animated.timing(orbit2Rotate, {
        toValue: 1,
        duration: 5000,
        useNativeDriver: true,
      })
    ).start();

    // Pulso central
    Animated.loop(
      Animated.sequence([
        Animated.timing(centerPulse, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(centerPulse, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Ondas expandindo
    Animated.loop(
      Animated.sequence([
        Animated.timing(waveScale, {
          toValue: 2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(waveScale, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Partículas flutuando aleatoriamente
    particlePositions.forEach((particle, index) => {
      const delay = index * 200;
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(particle.x, {
              toValue: (Math.random() - 0.5) * 60,
              duration: 2000 + Math.random() * 1000,
              useNativeDriver: true,
            }),
            Animated.timing(particle.y, {
              toValue: (Math.random() - 0.5) * 60,
              duration: 2000 + Math.random() * 1000,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(particle.opacity, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(particle.opacity, {
                toValue: 0,
                duration: 1500,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ])
      ).start();
    });
  }, []);

  const orbit1Rotation = orbitRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const orbit2Rotation = orbit2Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'], // Anti-horário
  });

  const waveOpacity = waveScale.interpolate({
    inputRange: [0, 2],
    outputRange: [0.6, 0],
  });

  return (
    <View style={[styles.container, { width: size * 1.6, height: size * 1.6 }]}>
      {/* Ondas expandindo */}
      <Animated.View
        style={[
          styles.wave,
          {
            width: size * 1.4,
            height: size * 1.4,
            borderRadius: size * 0.7,
            borderColor: Colors.light.primary,
            transform: [{ scale: waveScale }],
            opacity: waveOpacity,
          },
        ]}
      />

      {/* Partículas Flutuantes */}
      {particlePositions.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.particle,
            {
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
              ],
              opacity: particle.opacity,
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            style={styles.particleDot}
          />
        </Animated.View>
      ))}

      {/* Órbita 1 - Externa */}
      <Animated.View
        style={[
          styles.orbitContainer,
          {
            width: size,
            height: size,
            transform: [{ rotate: orbit1Rotation }],
          },
        ]}
      >
        <View style={[styles.orbitDot, styles.orbitDot1]} />
        <View style={[styles.orbitDot, styles.orbitDot2]} />
        <View style={[styles.orbitDot, styles.orbitDot3]} />
      </Animated.View>

      {/* Órbita 2 - Interna */}
      <Animated.View
        style={[
          styles.orbitContainer,
          {
            width: size * 0.7,
            height: size * 0.7,
            transform: [{ rotate: orbit2Rotation }],
          },
        ]}
      >
        <View style={[styles.orbitDot, styles.orbitDot4]} />
        <View style={[styles.orbitDot, styles.orbitDot5]} />
      </Animated.View>

      {/* Centro Pulsante */}
      <Animated.View
        style={[
          styles.center,
          {
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size * 0.15,
            transform: [{ scale: centerPulse }],
          },
        ]}
      >
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: size * 0.15 }]}
        />
        <View style={styles.centerGlow} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  wave: {
    position: 'absolute',
    borderWidth: 3,
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  particleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  orbitContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbitDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  orbitDot1: {
    top: 0,
    left: '50%',
    marginLeft: -6,
    backgroundColor: Colors.light.primary,
  },
  orbitDot2: {
    bottom: 0,
    left: '50%',
    marginLeft: -6,
    backgroundColor: Colors.light.secondary,
  },
  orbitDot3: {
    left: 0,
    top: '50%',
    marginTop: -6,
    backgroundColor: Colors.light.success,
  },
  orbitDot4: {
    right: 0,
    top: '50%',
    marginTop: -6,
    backgroundColor: Colors.light.warning,
  },
  orbitDot5: {
    left: 0,
    top: '50%',
    marginTop: -6,
    backgroundColor: Colors.light.info,
  },
  center: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  centerGlow: {
    position: 'absolute',
    width: '200%',
    height: '200%',
    borderRadius: 9999,
    backgroundColor: Colors.light.primary + '20',
  },
});

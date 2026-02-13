/**
 * HelpButton
 * Botão de ajuda (?) que aparece no header das telas
 * Ao tocar, inicia o tutorial da tela atual
 */

import React from 'react';
import { TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTutorialContext } from '@/contexts/TutorialContext';
import { Colors } from '@/constants/Colors';

interface HelpButtonProps {
  tutorialId: string;
  size?: number;
  color?: string;
  showBadge?: boolean;
}

export function HelpButton({
  tutorialId,
  size = 24,
  color = Colors.light.info,
  showBadge = false,
}: HelpButtonProps) {
  const { startTutorial, isTutorialCompleted } = useTutorialContext();

  const isCompleted = isTutorialCompleted(tutorialId);

  const handlePress = () => {
    startTutorial(tutorialId);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}
    >
      <View style={[styles.button, { backgroundColor: color + '15' }]}>
        <Ionicons
          name="help-circle-outline"
          size={size}
          color={color}
        />
      </View>

      {/* Badge indicando que não foi visto ainda */}
      {showBadge && !isCompleted && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>!</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default HelpButton;

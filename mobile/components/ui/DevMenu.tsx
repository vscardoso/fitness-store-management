import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import Constants from 'expo-constants';

/**
 * Componente de menu de desenvolvedor
 * Exibe apenas em modo de desenvolvimento
 */
export function DevMenu() {
  // Só mostra em desenvolvimento
  if (!__DEV__) {
    return null;
  }

  const handleReload = () => {
    Alert.alert(
      'Reload',
      'Pressione "r" no terminal do Expo para recarregar o app',
      [{ text: 'OK' }]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Limpar Cache',
      'Para limpar o cache:\n\n1. Feche o app\n2. No terminal, pressione "shift + r"\n3. Ou execute: npx expo start -c',
      [{ text: 'OK' }]
    );
  };

  return (
    <Card style={styles.card}>
      <Card.Title title="🔧 Dev Menu" subtitle="Modo de desenvolvimento" />
      <Card.Content>
        <Text variant="bodySmall" style={styles.info}>
          Versão: {Constants.expoConfig?.version || '1.0.0'}
        </Text>
        
        <View style={styles.buttons}>
          <Button
            mode="contained-tonal"
            icon="reload"
            onPress={handleReload}
            style={styles.button}
          >
            Como Reload
          </Button>
          
          <Button
            mode="contained-tonal"
            icon="delete-sweep"
            onPress={handleClearCache}
            style={styles.button}
          >
            Como Limpar Cache
          </Button>
        </View>
        
        <Text variant="bodySmall" style={styles.hint}>
          💡 Dica: Pressione 'r' no terminal para reload rápido
        </Text>
        <Text variant="bodySmall" style={styles.hint}>
          💡 Dica: Pressione 'shift + r' para reload + limpar cache
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#FFF3E0', // Laranja claro
  },
  info: {
    marginBottom: 4,
    color: '#666',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  button: {
    flex: 1,
  },
  hint: {
    marginTop: 8,
    color: '#666',
    fontStyle: 'italic',
  },
});

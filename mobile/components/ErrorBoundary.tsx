/**
 * Error Boundary para capturar erros React não tratados
 * Envia erros para o Sentry e mostra tela de erro amigável
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
// import * as Sentry from 'sentry-expo'; // TEMP: Desabilitado
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // TEMP: Sentry desabilitado
    // Sentry.Native.captureException(error, {
    //   contexts: {
    //     react: {
    //       componentStack: errorInfo.componentStack,
    //     },
    //   },
    // });

    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={64} color="#ef5350" />
          <Text variant="headlineSmall" style={styles.title}>
            Ops! Algo deu errado
          </Text>
          <Text variant="bodyMedium" style={styles.message}>
            Não se preocupe, já registramos o problema e vamos corrigi-lo em breve.
          </Text>
          {__DEV__ && this.state.error && (
            <View style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>
                {this.state.error.toString()}
              </Text>
            </View>
          )}
          <Button
            mode="contained"
            onPress={this.handleReset}
            style={styles.button}
            icon="refresh"
          >
            Tentar Novamente
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  message: {
    marginBottom: 24,
    textAlign: 'center',
    color: '#666',
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    maxWidth: '100%',
  },
  errorText: {
    color: '#c62828',
    fontFamily: 'monospace',
  },
  button: {
    marginTop: 8,
  },
});

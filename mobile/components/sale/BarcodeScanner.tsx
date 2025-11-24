/**
 * Scanner de código de barras para PDV
 *
 * Utiliza expo-barcode-scanner para ler códigos de barras
 * e buscar produtos automaticamente
 */

import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Modal, Portal, Button, Text, ActivityIndicator } from 'react-native-paper';
import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { haptics } from '@/utils/haptics';
import { getProductByBarcode } from '@/services/productService';
import type { Product } from '@/types';

interface BarcodeScannerProps {
  visible: boolean;
  onDismiss: () => void;
  onProductFound: (product: Product) => void;
}

export default function BarcodeScanner({
  visible,
  onDismiss,
  onProductFound,
}: BarcodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Solicitar permissões de câmera ao montar
   */
  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  /**
   * Reset estado ao abrir/fechar
   */
  useEffect(() => {
    if (visible) {
      setIsScanning(true);
      setIsLoading(false);
    }
  }, [visible]);

  /**
   * Handler para quando um código é escaneado
   */
  const handleBarCodeScanned = async ({ type, data }: BarCodeScannerResult) => {
    // Prevenir múltiplos scans simultâneos
    if (!isScanning || isLoading) {
      return;
    }

    setIsScanning(false);
    setIsLoading(true);
    haptics.medium();

    try {
      // Buscar produto por código de barras
      const product = await getProductByBarcode(data);

      // Sucesso - adicionar ao carrinho
      haptics.success();
      onProductFound(product);
      onDismiss();
    } catch (error: any) {
      haptics.error();

      // Exibir erro específico
      const errorMessage =
        error.response?.status === 404
          ? `Produto não encontrado para o código de barras: ${data}`
          : 'Erro ao buscar produto. Verifique sua conexão e tente novamente.';

      Alert.alert('Produto não encontrado', errorMessage, [
        {
          text: 'Escanear novamente',
          onPress: () => {
            setIsScanning(true);
            setIsLoading(false);
          },
        },
        {
          text: 'Fechar',
          style: 'cancel',
          onPress: onDismiss,
        },
      ]);
    }
  };

  /**
   * Renderizar conteúdo baseado no estado de permissão
   */
  const renderContent = () => {
    // Permissão não verificada ainda
    if (hasPermission === null) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.statusText}>Solicitando permissão da câmera...</Text>
        </View>
      );
    }

    // Permissão negada
    if (hasPermission === false) {
      return (
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={64} color={Colors.light.textSecondary} />
          <Text variant="titleMedium" style={styles.errorTitle}>
            Câmera não disponível
          </Text>
          <Text style={styles.errorDescription}>
            Permita o acesso à câmera nas configurações do seu dispositivo para usar o scanner.
          </Text>
          <Button
            mode="contained"
            onPress={onDismiss}
            style={styles.button}
          >
            Fechar
          </Button>
        </View>
      );
    }

    // Scanner ativo
    return (
      <View style={styles.scannerContainer}>
        <BarCodeScanner
          onBarCodeScanned={isScanning ? handleBarCodeScanned : undefined}
          style={StyleSheet.absoluteFillObject}
          barCodeTypes={[
            BarCodeScanner.Constants.BarCodeType.ean13,
            BarCodeScanner.Constants.BarCodeType.ean8,
            BarCodeScanner.Constants.BarCodeType.upc_a,
            BarCodeScanner.Constants.BarCodeType.upc_e,
            BarCodeScanner.Constants.BarCodeType.code39,
            BarCodeScanner.Constants.BarCodeType.code128,
            BarCodeScanner.Constants.BarCodeType.qr,
          ]}
        />

        {/* Overlay com guia de escaneamento */}
        <View style={styles.overlay}>
          <View style={styles.topOverlay} />

          <View style={styles.middleRow}>
            <View style={styles.sideOverlay} />

            {/* Área de foco */}
            <View style={styles.focusBox}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>

            <View style={styles.sideOverlay} />
          </View>

          <View style={styles.bottomOverlay}>
            <Text style={styles.instructionText}>
              {isLoading ? 'Buscando produto...' : 'Posicione o código de barras na área marcada'}
            </Text>

            {isLoading && (
              <ActivityIndicator
                size="large"
                color="#fff"
                style={styles.loader}
              />
            )}

            <Button
              mode="contained"
              onPress={onDismiss}
              style={styles.cancelButton}
              buttonColor="rgba(255, 255, 255, 0.2)"
              icon="close"
            >
              Cancelar
            </Button>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        {renderContent()}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: 250,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  focusBox: {
    width: 300,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#fff',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  loader: {
    marginBottom: 20,
  },
  cancelButton: {
    marginTop: 20,
    minWidth: 200,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.light.background,
  },
  statusText: {
    marginTop: 16,
    color: Colors.light.textSecondary,
  },
  errorTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorDescription: {
    marginBottom: 24,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    minWidth: 200,
  },
});

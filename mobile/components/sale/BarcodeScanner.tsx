/**
 * Scanner de código de barras para PDV
 *
 * Utiliza expo-camera (CameraView) para ler códigos de barras
 * e buscar produtos automaticamente
 */

import { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
} from 'react-native';
import { Modal, Portal, Button, Text, ActivityIndicator } from 'react-native-paper';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
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
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const lastScannedRef = useRef<string | null>(null);

  /**
   * Reset estado ao abrir/fechar
   */
  const handleModalShow = () => {
    setIsScanning(true);
    setIsLoading(false);
    lastScannedRef.current = null;
  };

  /**
   * Handler para quando um código é escaneado
   */
  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    const { data } = result;

    // Prevenir múltiplos scans simultâneos do mesmo código
    if (!isScanning || isLoading || lastScannedRef.current === data) {
      return;
    }

    lastScannedRef.current = data;
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
            lastScannedRef.current = null;
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
    if (!permission) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.statusText}>Verificando permissão da câmera...</Text>
        </View>
      );
    }

    // Permissão negada
    if (!permission.granted) {
      return (
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={64} color={Colors.light.textSecondary} />
          <Text variant="titleMedium" style={styles.errorTitle}>
            Câmera não disponível
          </Text>
          <Text style={styles.errorDescription}>
            Permita o acesso à câmera para usar o scanner de código de barras.
          </Text>
          <Button
            mode="contained"
            onPress={requestPermission}
            style={styles.button}
            icon="camera"
          >
            Permitir Câmera
          </Button>
          <Button
            mode="outlined"
            onPress={onDismiss}
            style={[styles.button, { marginTop: 12 }]}
          >
            Fechar
          </Button>
        </View>
      );
    }

    // Scanner ativo
    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code39',
              'code128',
              'qr',
            ],
          }}
          onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
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
        onShow={handleModalShow}
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

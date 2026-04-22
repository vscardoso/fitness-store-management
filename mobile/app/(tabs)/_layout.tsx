import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator } from 'react-native-paper';
import { Text } from 'react-native-paper';
import { useAuthStore } from '@/store/authStore';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors, useBrandingStore } from '@/store/brandingStore';
import { useUIStore } from '@/store/uiStore';

export default function TabsLayout() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const brandingColors = useBrandingColors();
  const brandingSynced = useBrandingStore((state) => state.synced);
  const brandingHydrating = useBrandingStore((state) => state.isHydrating);
  const initialSyncAttempted = useBrandingStore((state) => state.initialSyncAttempted);
  const fetchBrandingFromServer = useBrandingStore((state) => state.fetchFromServer);
  const triggerDashboardRefresh = useUIStore((s) => s.triggerDashboardRefresh);

  // Se não autenticado, redirecionar para login
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated]);

  // Gatilho agressivo: antes da primeira render das tabs, garante tentativa inicial de hidratação.
  useEffect(() => {
    if (isAuthenticated && !brandingSynced && !initialSyncAttempted && !brandingHydrating) {
      fetchBrandingFromServer().catch(() => {});
    }
  }, [isAuthenticated, brandingSynced, initialSyncAttempted, brandingHydrating, fetchBrandingFromServer]);

  if (isAuthenticated && (brandingHydrating || (!brandingSynced && !initialSyncAttempted))) {
    return (
      <View style={styles.brandingGateContainer}>
        <ActivityIndicator size="large" color={brandingColors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: brandingColors.primary,
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
          backgroundColor: Colors.light.background,
          borderTopWidth: 1,
          borderTopColor: Colors.light.border,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        headerShown: false,
      }}
    >
      {/* ========== TABS VISÍVEIS (4) ========== */}

      {/* Tab 1: Início (Esquerda) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={focused ? size + 4 : size}
              color={color}
            />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              triggerDashboardRefresh();
            }
          },
        })}
      />

      {/* Tab 2: PDV (Centro - Botão Destacado) */}
      <Tabs.Screen
        name="sale"
        options={{
          title: 'PDV',
          tabBarIcon: ({ color, focused, size }) => (
            <View
              style={[
                styles.centralButton,
                { backgroundColor: brandingColors.primary + '33', borderColor: Colors.light.background },
                focused && [styles.centralButtonActive, { backgroundColor: brandingColors.primary }],
              ]}
            >
              <Ionicons
                name={focused ? 'cart' : 'cart-outline'}
                size={size + 6}
                color={focused ? '#fff' : color}
              />
            </View>
          ),
          tabBarLabel: ({ focused, color }) => (
            <Text
              style={[
                styles.centralLabel,
                { color: focused ? brandingColors.primary : color },
              ]}
            >
              PDV
            </Text>
          ),
        }}
      />

      {/* Tab 3: Menu (Direita) */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? 'menu' : 'menu-outline'}
              size={focused ? size + 4 : size}
              color={color}
            />
          ),
        }}
      />

      {/* ========== TELAS OCULTAS (Sem Tab, Rotas Preservadas) ========== */}
      
      {/* Oculta módulo de Vendas do tab bar, mantendo rota acessível */}
      <Tabs.Screen name="sales" options={{ href: null }} />

      <Tabs.Screen name="management" options={{ href: null }} />
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="trips" options={{ href: null }} />
      
      {/* Envios Condicionais: oculto do tab bar mas mantém rotas acessíveis */}
      <Tabs.Screen name="conditional" options={{ href: null }} />
      
      {/* Entries: oculto do tab bar mas mantém rotas acessíveis com tab bar visível */}
      <Tabs.Screen name="entries" options={{ href: null }} />
      
      {/* Payment Discounts: oculto do tab bar mas mantém rotas acessíveis com tab bar visível */}
      <Tabs.Screen name="payment-discounts" options={{ href: null }} />
      
      {/* Team: oculto do tab bar mas mantém rotas acessíveis com tab bar visível */}
      <Tabs.Screen name="team" options={{ href: null }} />

      {/* Demand: dashboard de demanda da wishlist, oculto do tab bar */}
      <Tabs.Screen name="demand" options={{ href: null }} />

      {/* Despesas: oculto do tab bar mas mantém rotas acessíveis */}
      <Tabs.Screen name="expenses" options={{ href: null }} />

      {/* Prejuízos: módulo financeiro separado, oculto do tab bar */}
      <Tabs.Screen name="stock-losses" options={{ href: null }} />

      {/* PDV: rotas de checkout e gestão, ocultas do tab bar */}
      <Tabs.Screen name="pdv/index" options={{ href: null }} />
      <Tabs.Screen name="pdv/pix-checkout" options={{ href: null }} />
      <Tabs.Screen name="pdv/terminal-checkout" options={{ href: null }} />
      <Tabs.Screen name="pdv/terminals" options={{ href: null }} />


    </Tabs>
  );
}

const styles = StyleSheet.create({
  brandingGateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
  centralButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  centralButtonActive: {
    transform: [{ scale: 1.05 }],
  },
  centralLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: -12,
  },
});

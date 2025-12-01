import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import { useAuthStore } from '@/store/authStore';
import { Colors, theme } from '@/constants/Colors';

export default function TabsLayout() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Se não autenticado, redirecionar para login
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.primary,
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
      {/* ========== TABS VISÍVEIS (3) ========== */}
      
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
                focused && styles.centralButtonActive,
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
                { color: focused ? Colors.light.primary : color },
              ]}
            >
              PDV
            </Text>
          ),
        }}
      />

      {/* Tab 3: Gestão (Direita) */}
      <Tabs.Screen
        name="management"
        options={{
          title: 'Gestão',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={focused ? size + 4 : size}
              color={color}
            />
          ),
        }}
      />

      {/* ========== TELAS OCULTAS (Sem Tab, Rotas Preservadas) ========== */}
      
      {/* Oculta módulo de Vendas do tab bar, mantendo rota acessível */}
      <Tabs.Screen name="sales" options={{ href: null }} />

      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="trips" options={{ href: null }} />
      
      {/* Entries: oculto do tab bar mas mantém rotas acessíveis com tab bar visível */}
      <Tabs.Screen name="entries" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centralButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: Colors.light.background,
    ...Platform.select({
      ios: {
        shadowColor: Colors.light.primary,
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
    backgroundColor: Colors.light.primary,
    transform: [{ scale: 1.05 }],
  },
  centralLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: -12,
  },
});

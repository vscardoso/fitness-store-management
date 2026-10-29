/**
 * Moldura do app web: no modo notebook (1024 px ou mais, logado) põe a barra lateral à esquerda das telas.
 * No celular (iOS/Android) devolve as telas como estão, sem nenhuma View a mais.
 */
import { ReactNode, useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useLayout } from '@/hooks/useLayout';
import { Colors } from '@/constants/Colors';
import DesktopSidebar from './DesktopSidebar';

/** Telas sem barra lateral mesmo logado (termos, aceite) */
const NO_SIDEBAR = ['/termos', '/privacidade', '/aceite-termos'];

export default function DesktopShell({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return <WebShell>{children}</WebShell>;
}

function WebShell({ children }: { children: ReactNode }) {
  const { isDesktop } = useLayout();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const inAuth = segments[0] === '(auth)';
  const showSidebar = isDesktop && isAuthenticated && !inAuth && !NO_SIDEBAR.includes(pathname);

  // F2 de qualquer tela abre o ponto de venda (no PDV o próprio PDV usa o F2 para nova venda)
  useEffect(() => {
    if (!showSidebar || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2' && pathname !== '/sale') {
        e.preventDefault();
        router.push('/(tabs)/sale');
      }
    };
    // captura: o campo de texto do react-native-web não deixa a tecla subir até a página
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [showSidebar, pathname, router]);

  return (
    <View style={styles.row}>
      {showSidebar && <DesktopSidebar />}
      <View style={[styles.main, showSidebar && styles.mainDesktop]}>
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  mainDesktop: { backgroundColor: Colors.light.backgroundSecondary },
  content: { flex: 1, width: '100%' },
});

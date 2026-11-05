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
import { HelpPanel, HelpSheet, useCurrentHelp } from '@/components/help/HelpHost';
import { useHelpStore } from '@/store/helpStore';
import { useAppIconBadge } from '@/hooks/usePwaExtras';

/** Telas sem barra lateral mesmo logado (termos, aceite) */
const NO_SIDEBAR = ['/termos', '/privacidade', '/exclusao-de-dados', '/aceite-termos'];

export default function DesktopShell({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}<HelpSheet /></>;
  return <WebShell>{children}</WebShell>;
}

function WebShell({ children }: { children: ReactNode }) {
  const { isDesktop } = useLayout();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useAppIconBadge();   // número no ícone do app instalado: conversas do WhatsApp sem resposta
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const inAuth = segments[0] === '(auth)';
  // /produtos/... é a vitrine pública do produto: nunca com a barra do sistema
  const showSidebar = isDesktop && isAuthenticated && !inAuth && !NO_SIDEBAR.includes(pathname) && !pathname.startsWith('/produtos/');
  const help = useCurrentHelp();
  const toggleHelp = useHelpStore((s) => s.toggle);
  const closeHelp = useHelpStore((s) => s.close);
  const helpOpen = useHelpStore((s) => !!s.openId);

  // F1 abre e fecha a ajuda da tela no notebook (o F1 do navegador abriria a ajuda dele)
  useEffect(() => {
    if (!showSidebar || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      if (helpOpen) closeHelp();
      else if (help) toggleHelp(help.id);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [showSidebar, help, helpOpen, toggleHelp, closeHelp]);

  // Barra de rolagem fina e discreta no PC (a padrão do navegador, cinza grossa com setas, destoava do app)
  useEffect(() => {
    if (!isDesktop || typeof document === 'undefined' || document.getElementById('provador-scrollbar')) return;
    const st = document.createElement('style');
    st.id = 'provador-scrollbar';
    st.textContent =
      '*{scrollbar-width:thin;scrollbar-color:rgba(22,15,40,.22) transparent}' +
      '*::-webkit-scrollbar{width:8px;height:8px}' +
      '*::-webkit-scrollbar-track{background:transparent}' +
      '*::-webkit-scrollbar-thumb{background:rgba(22,15,40,.22);border-radius:8px}' +
      '*::-webkit-scrollbar-thumb:hover{background:rgba(22,15,40,.38)}' +
      '*::-webkit-scrollbar-button{display:none;width:0;height:0}';
    document.head.appendChild(st);
  }, [isDesktop]);

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
      {showSidebar ? <HelpPanel /> : <HelpSheet />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  mainDesktop: { backgroundColor: Colors.light.backgroundSecondary },
  content: { flex: 1, width: '100%' },
});

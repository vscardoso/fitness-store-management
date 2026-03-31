# FitFlow Logo - Guia de Uso

## Visão Geral

O logo **FitFlow** expressa o movimento "**Dynamic Structure**":
- **Vertical** = Força/Crescimento
- **Horizontal** = Estrutura/Gestão  
- **Círculo Central** = Ponto dinâmico de intersecção
- **Acento Superior** = Momentum ascendente
- **Símbolo Core** = Haltere/Contenedor híbrido

**Paleta:**
- Primária: `#667eea` (Azul-violeta)
- Secundária: `#764ba2` (Violeta profundo)
- Acento: `#10B981` (Verde)

---

## Arquivos

### 1. **SVG Standalone** (`mobile/assets/logo.svg`)
- Uso: Exportação estática, favicon, documentação
- Tamanhos naturais: 128px, 256px, 512px (responsivo)
- Sem dependências externas

### 2. **React Native Component** (`mobile/components/branding/FitFlowLogo.tsx`)
- Uso: Integração em telas React Native
- Props customizáveis: `size`, `variant`, `dark`
- Renderiza com `react-native-svg`

---

## Como Usar na App

### Opção 1: Componente em Tela
```typescript
import { FitFlowLogo } from '@/components/branding/FitFlowLogo';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <FitFlowLogo size={256} />
      <Text style={styles.title}>FitFlow</Text>
      <Text style={styles.subtitle}>Store Management</Text>
    </View>
  );
}
```

### Opção 2: Header com Logo
```typescript
import { FitFlowLogo } from '@/components/branding/FitFlowLogo';

export default function ProductsScreen() {
  return (
    <>
      <View style={styles.header}>
        <FitFlowLogo size={48} />
        <Text style={styles.headerTitle}>Produtos</Text>
      </View>
      {/* Lista de produtos */}
    </>
  );
}
```

### Opção 3: Login Screen (Logo Destaque)
```typescript
import { FitFlowLogo } from '@/components/branding/FitFlowLogo';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#667eea', '#764ba2']}>
        <FitFlowLogo size={200} />
      </LinearGradient>
      
      <LoginForm />
    </View>
  );
}
```

### Opção 4: Favicon (Web/PWA)
```html
<!-- public/index.html -->
<link rel="icon" type="image/svg+xml" href="/logo.svg" sizes="any" />
<link rel="apple-touch-icon" href="/logo.svg" />
```

---

## Customização

### Alterar Tamanho
```typescript
<FitFlowLogo size={64} />   {/* Pequeno - 64px */}
<FitFlowLogo size={128} />  {/* Médio - 128px (padrão) */}
<FitFlowLogo size={256} />  {/* Grande - 256px */}
<FitFlowLogo size={512} />  {/* Extra Grande - 512px */}
```

### Modo Escuro (Futuro)
```typescript
<FitFlowLogo size={128} dark={true} />
```

### Variantes (Futuro)
```typescript
<FitFlowLogo variant="full" />      {/* Logo completo com detalhen */}
<FitFlowLogo variant="icon" />      {/* Apenas o símbolo */}
<FitFlowLogo variant="minimal" />   {/* Versão simplificada */}
```

---

## Animações Recomendadas

### Scale on Load
```typescript
const scaleAnim = useSharedValue(0);

useEffect(() => {
  scaleAnim.value = withSpring(1);
}, []);

return (
  <Animated.View style={[
    styles.container,
    { transform: [{ scale: scaleAnim }] }
  ]}>
    <FitFlowLogo size={200} />
  </Animated.View>
);
```

### Pulse on Idle
```typescript
const pulseAnim = useSharedValue(1);

useEffect(() => {
  pulseAnim.value = withRepeat(
    withSequence(
      withTiming(1.05, { duration: 1000 }),
      withTiming(1, { duration: 1000 })
    ),
    -1
  );
}, []);

return (
  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
    <FitFlowLogo size={128} />
  </Animated.View>
);
```

---

## Checklist de Deploying

- [ ] Logo SVG copiado para `mobile/assets/logo.svg`
- [ ] Componente copiado para `mobile/components/branding/FitFlowLogo.tsx`
- [ ] Importado em tela de splash/login
- [ ] Testado em light mode
- [ ] Testado em dark mode
- [ ] Escalado com sucesso em diferentes resolutions
- [ ] AnimationView aplicada (Pulse / Spring)
- [ ] Favicon configurado

---

## Exportar para Favicon

### Via ImageMagick (Terminal)
```bash
# Extrair do SVG para PNG 128x128
convert -background none logo.svg -resize 128x128 favicon.ico

# Múltiplos tamanhos
convert -background none logo.svg -resize 32x32 favicon-32.png
convert -background none logo.svg -resize 64x64 favicon-64.png
convert -background none logo.svg -resize 128x128 favicon-128.png
```

### Via Figma
1. Abrir SVG no Figma
2. Exportar como PNG nos tamanhos desejados
3. Converter para ICO com [favicon-converter.com](https://favicon-converter.com)

---

## Próximos Passos

1. **Wordmark**: Adicionar "FitFlow" styled com Raleway ou Poppins
2. **Tema Escuro**: Versão com cores mais claras para background escuro
3. **Animação**: Logo animado (barras se movem, círculo pulsa) para splash screen
4. **Variantes de Escala**: Simplificar símbolo para 16px (favicon sem perder identidade)

---

## Contato de Design

- **Movement**: Dynamic Structure
- **Design Philosophy**: `mobile/docs/LOGO_PHILOSOPHY.md`
- **Design System**: `mobile/docs/LOGO_DESIGN.html`
- **Última Atualização**: 2026-02-17


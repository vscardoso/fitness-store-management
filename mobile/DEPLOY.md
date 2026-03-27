# Deploy Mobile - Fitness Store

Guia completo para build e deploy do app mobile para Android e iOS.

## Pre-requisitos

### 1. Instalar EAS CLI
```bash
npm install -g eas-cli@latest

# Verificar instalação
eas --version
# Deve mostrar a versão (ex: 18.4.0)
```

> ⚠️ **Erro "eas não reconhecido" (CommandNotFoundException)?**
> Veja a seção [Troubleshooting](#troubleshooting) no final deste arquivo.

### 2. Login no Expo
```bash
eas login
# Conta: vscardoso2005
```

### 3. Verificar configuração
```bash
eas whoami
eas build:configure
```

---

## 🚀 Distribuição Rápida SEM Apple ID (Gratuito)

### Android → Enviar APK para Vendedora/Testadores

Este é o fluxo mais simples e **100% gratuito** para distribuir o app.

```bash
cd mobile

# Gerar APK para Android (sem Apple ID, sem custos)
eas build --platform android --profile preview-android
```

**O que acontece:**
1. Build roda na nuvem (~15-20 min)
2. Você recebe um **link para download do APK**
3. Envia o link para quem precisa instalar
4. A pessoa baixa e instala direto no Android

**O que enviar para a vendedora:**
```
Olá! Para instalar o app no seu celular Android:

1. Acesse este link: [LINK QUE APARECE APÓS O BUILD]
2. Clique em "Download" e baixe o arquivo .apk
3. Nas configurações do Android, habilite "Instalar de fontes desconhecidas"
   (Configurações → Segurança → Fontes desconhecidas)
4. Abra o arquivo APK baixado para instalar
5. Login: [EMAIL] / Senha: [SENHA]
```

### iOS → Usar Expo Go (Sem Apple Developer Account)

Para iPhone sem pagar Apple Developer ($99/ano):

```bash
cd mobile

# Iniciar servidor de desenvolvimento com tunnel
npx expo start --tunnel
```

**O que enviar para a vendedora com iPhone:**
```
Olá! Para testar o app no seu iPhone:

1. Baixe o app "Expo Go" na App Store (gratuito)
2. Abra o Expo Go
3. Escaneie este QR Code: [QR CODE DO TERMINAL]
   OU acesse: exp://[URL DO TUNNEL]
4. O app vai abrir automaticamente
```

> **Nota:** Com Expo Go, o servidor precisa estar rodando enquanto a vendedora usa. Para distribuição permanente no iOS, é necessário Apple Developer Account.

---

## Android

### Build para Teste (APK)

Gera um APK que pode ser instalado diretamente em qualquer Android:

```bash
cd mobile

# Perfil android-only (sem iOS, sem Apple ID)
eas build --platform android --profile preview-android

# OU perfil preview completo (Android + iOS)
eas build --platform android --profile preview
```

**Tempo estimado**: 15-25 minutos

**Resultado**: Link para download do APK

### Build para Google Play (AAB)

Gera um Android App Bundle para upload na Play Store:

```bash
eas build --platform android --profile production
```

### Instalar APK no dispositivo

1. Baixe o APK do link fornecido após o build
2. Transfira para o dispositivo Android
3. Habilite "Fontes desconhecidas" nas configurações
4. Instale o APK

### Submit para Google Play

```bash
# Requer configuração prévia do service account
eas submit --platform android --profile production
```

**Requisitos para Play Store**:
- Conta Google Play Developer ($25 única vez)
- Service Account JSON configurado
- App assinado com upload key

---

## iOS

### Opções sem Apple Developer Account ($99/ano)

#### 1. Expo Go (Mais simples — GRÁTIS)

Use o app Expo Go da App Store para testar:

```bash
cd mobile
npx expo start --tunnel
```

Escaneie o QR code com o app Expo Go.

**Limitações**:
- Não suporta todas as libs nativas
- Não pode distribuir permanentemente para outros usuários
- Servidor precisa estar rodando para funcionar
- Apenas para desenvolvimento/demonstração

#### 2. iOS Simulator (Mac necessário)

```bash
eas build --platform ios --profile development
```

Selecione "iOS Simulator" quando perguntado.

**Requisitos**:
- Mac com Xcode instalado
- Simulador iOS configurado

### Opções com Apple Developer Account

#### Development Build (TestFlight interno)

```bash
eas build --platform ios --profile development
```

#### Preview Build (TestFlight externo)

```bash
eas build --platform ios --profile preview
```

#### Production Build (App Store)

```bash
eas build --platform ios --profile production
```

### Submit para App Store

```bash
eas submit --platform ios --profile production
```

**Requisitos para App Store**:
- Apple Developer Account ($99/ano)
- App Store Connect configurado
- Certificados e provisioning profiles

---

## Profiles de Build (eas.json)

| Profile | Uso | Android | iOS | Apple ID? |
|---------|-----|---------|-----|-----------|
| `development` | Dev com hot reload | APK debug | Simulator | ❌ Não |
| `preview-android` | **Teste sem Apple ID** | APK release | ❌ | ❌ Não |
| `preview` | Teste completo | APK release | TestFlight | ✅ Sim |
| `production` | Lojas | AAB | App Store | ✅ Sim |

### Configuração atual (eas.json)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "ios": { "simulator": true }
    },
    "preview-android": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://fitness-backend-x1qn.onrender.com/api/v1"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "ios": { "simulator": false },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://fitness-backend-x1qn.onrender.com/api/v1"
      }
    },
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://fitness-backend-x1qn.onrender.com/api/v1"
      }
    }
  }
}
```

---

## Updates OTA (Over-The-Air)

Atualiza código JS sem precisar de novo build (não funciona para mudanças em libs nativas).

### Usando EAS Update

```bash
# Criar update para branch preview
eas update --branch preview --message "Descrição da atualização"

# Criar update para production
eas update --branch production --message "Descrição da atualização"
```

### Verificar updates

```bash
eas update:list
```

---

## Comandos Úteis

### Verificar builds

```bash
# Listar todos os builds
eas build:list

# Ver status do último build
eas build:view
```

### Cancelar build

```bash
eas build:cancel
```

### Limpar cache

```bash
# Limpar cache do Expo
npx expo start --clear

# Limpar node_modules e reinstalar
rm -rf node_modules
npm install
```

### Verificar dependências

```bash
# Verificar compatibilidade
npx expo-doctor

# Corrigir versões automaticamente
npx expo install --fix
```

---

## Troubleshooting

### ❌ Erro: 'eas' não é reconhecido (CommandNotFoundException)

Causa: EAS CLI não está instalado ou não está no PATH do sistema.

**Solução 1 — Reinstalar globalmente:**
```bash
npm install -g eas-cli@latest

# No Windows (PowerShell como Admin):
npm install -g eas-cli@latest

# Verificar instalação:
eas --version
```

**Solução 2 — Usar npx (sem instalação global):**
```bash
# No lugar de "eas build ...", use:
npx eas-cli build --platform android --profile preview-android
```

**Solução 3 — Verificar PATH no Windows:**
```powershell
# Verificar onde npm instala pacotes globais
npm config get prefix
# Ex: C:\Users\Victor\AppData\Roaming\npm

# Adicionar ao PATH do sistema:
# Painel de Controle → Sistema → Variáveis de Ambiente
# Adicionar "C:\Users\Victor\AppData\Roaming\npm" ao PATH
```

**Solução 4 — Usar via caminho completo:**
```powershell
# Encontrar o eas.cmd
Get-Command eas -ErrorAction SilentlyContinue
# OU
where.exe eas

# Executar via caminho completo se encontrado:
C:\Users\Victor\AppData\Roaming\npm\eas.cmd build --platform android --profile preview-android
```

### ❌ Erro: Apple ID solicitado ao fazer build iOS

Para evitar prompts de Apple ID, use os perfis que não requerem conta Apple:

```bash
# ✅ Android sem Apple ID
eas build --platform android --profile preview-android

# ✅ iOS apenas com simulador (sem Apple Developer Account)
eas build --platform ios --profile development
# → Selecione "Simulator" quando perguntado
```

### ❌ Erro: react-native-reanimated incompatível

```bash
npx expo install react-native-reanimated
```

### ❌ Erro: Certificados iOS

```bash
eas credentials
# Selecione iOS > Manage credentials
```

### ❌ Erro: Build falhou

1. Verifique os logs no dashboard: https://expo.dev
2. Execute `npx expo-doctor`
3. Limpe cache: `npx expo start --clear`

### ❌ Build travado

```bash
eas build:cancel
# Aguarde alguns minutos e tente novamente
```

---

## Fluxo Recomendado

### Para Desenvolvimento

```bash
# iOS (Expo Go — sem Apple ID)
npx expo start --tunnel

# Android (Expo Go — sem Apple ID)
npx expo start
```

### Para Enviar a Vendedora/Testadores (SEM Apple ID, GRÁTIS)

```bash
# Android — Gerar APK (recomendado, sem custo)
eas build --platform android --profile preview-android

# iOS — Expo Go (a vendedora precisa baixar Expo Go na App Store)
npx expo start --tunnel
```

### Para Teste com Usuários (com Apple Developer Account)

```bash
# Android - Gerar APK
eas build -p android --profile preview

# iOS - TestFlight (requer Apple Developer)
eas build -p ios --profile preview
eas submit -p ios --profile preview
```

### Para Produção

```bash
# Android - Google Play
eas build -p android --profile production
eas submit -p android --profile production

# iOS - App Store
eas build -p ios --profile production
eas submit -p ios --profile production
```

---

## Links Úteis

- **Dashboard EAS**: https://expo.dev
- **Seu projeto EAS**: https://expo.dev/accounts/vscardoso2005/projects/fitness-store-mobile
- **Documentação Expo**: https://docs.expo.dev
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **EAS Submit**: https://docs.expo.dev/submit/introduction/
- **EAS Update**: https://docs.expo.dev/eas-update/introduction/
- **Expo Go (Android)**: https://play.google.com/store/apps/details?id=host.exp.exponent
- **Expo Go (iOS)**: https://apps.apple.com/app/expo-go/id982107779

---

## Variáveis de Ambiente

### Produção
```
EXPO_PUBLIC_API_URL=https://fitness-backend-x1qn.onrender.com/api/v1
```

### Desenvolvimento Local
```
EXPO_PUBLIC_API_URL=http://SEU_IP:8000/api/v1
```

Para device físico com backend local, use tunnel:
```bash
npx localtunnel --port 8000
# Atualize EXPO_PUBLIC_API_URL com a URL gerada
```

---

## Checklist Pré-Deploy

- [ ] Testar todas as funcionalidades no emulador/simulador
- [ ] Verificar se a API de produção está funcionando (URL em `eas.json` → env.EXPO_PUBLIC_API_URL)
- [ ] Executar `npx expo-doctor` para verificar problemas
- [ ] Atualizar versão no `app.config.js` se necessário
- [ ] Commitar todas as alterações no git
- [ ] Verificar se `eas.json` tem as configurações corretas

---

*Última atualização: Março 2026*

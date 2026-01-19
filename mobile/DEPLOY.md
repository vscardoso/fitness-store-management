# Deploy Mobile - Fitness Store

Guia completo para build e deploy do app mobile para Android e iOS.

## Pre-requisitos

### 1. Instalar EAS CLI
```bash
npm install -g eas-cli
```

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

## Android

### Build para Teste (APK)

Gera um APK que pode ser instalado diretamente em qualquer Android:

```bash
cd mobile
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

#### 1. Expo Go (Mais simples)

Use o app Expo Go da App Store para testar:

```bash
cd mobile
npx expo start --tunnel
```

Escaneie o QR code com o app Expo Go.

**Limitações**:
- Não suporta todas as libs nativas
- Não pode distribuir para outros usuários
- Apenas para desenvolvimento

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

| Profile | Uso | Android | iOS |
|---------|-----|---------|-----|
| `development` | Dev com hot reload | APK debug | Simulator |
| `preview` | Teste interno | APK release | TestFlight |
| `production` | Lojas | AAB | App Store |

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
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
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

### Erro: react-native-reanimated incompatível

```bash
npx expo install react-native-reanimated
```

### Erro: Certificados iOS

```bash
eas credentials
# Selecione iOS > Manage credentials
```

### Erro: Build falhou

1. Verifique os logs no dashboard: https://expo.dev
2. Execute `npx expo-doctor`
3. Limpe cache: `npx expo start --clear`

### Build travado

```bash
eas build:cancel
# Aguarde alguns minutos e tente novamente
```

---

## Fluxo Recomendado

### Para Desenvolvimento

```bash
# iOS (Expo Go)
npx expo start --tunnel

# Android (Expo Go)
npx expo start
```

### Para Teste com Usuários

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
- **Documentação Expo**: https://docs.expo.dev
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **EAS Submit**: https://docs.expo.dev/submit/introduction/
- **EAS Update**: https://docs.expo.dev/eas-update/introduction/

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
- [ ] Verificar se a API de produção está funcionando
- [ ] Executar `npx expo-doctor` para verificar problemas
- [ ] Atualizar versão no `app.json` se necessário
- [ ] Commitar todas as alterações no git
- [ ] Verificar se `eas.json` tem as configurações corretas

---

*Última atualização: Janeiro 2026*

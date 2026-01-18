# 📱 Fitness Store - Mobile App

React Native + Expo mobile application for fitness store management.

---

## 🚀 Quick Start

### Iniciar desenvolvimento (RECOMENDADO):

```powershell
cd mobile
.\expo-dev.ps1
```

Este script:
- ✅ Verifica conflitos de processos
- ✅ Limpa cache automaticamente
- ✅ Inicia com proteções anti-travamento
- ✅ Mostra instruções de uso

### Device físico com tunnel:

```powershell
.\expo-dev.ps1 -Tunnel
```

---

## 🆘 Terminal Travando?

### Se o terminal travar:

1. **Feche o terminal** (X ou Alt+F4)
2. **Abra novo terminal** e execute:

```powershell
cd mobile
.\kill-all.ps1
.\expo-dev.ps1
```

### Documentação completa:

📄 **[TERMINAL_FREEZE_FIX.md](./TERMINAL_FREEZE_FIX.md)** - Solução definitiva para travamentos

---

## 🛠️ Scripts Disponíveis

### `expo-dev.ps1` - Iniciar Expo (uso diário)
```powershell
.\expo-dev.ps1                  # Normal
.\expo-dev.ps1 -Tunnel          # Device físico
.\expo-dev.ps1 -NoClear         # Sem limpar cache (mais rápido)
.\expo-dev.ps1 -Verbose         # Logs detalhados
```

### `kill-all.ps1` - Matar processos travados
```powershell
.\kill-all.ps1
```
Mata TODOS os processos Node/Expo/Metro e limpa cache.

---

## 📦 Instalação

### Primeira vez:

```powershell
cd mobile
npm install
.\expo-dev.ps1
```

### Atualizar dependências:

```powershell
npm install
.\kill-all.ps1
.\expo-dev.ps1
```

---

## 🏗️ Stack Tecnológica

- **React Native** - Framework mobile
- **Expo SDK 54** - Toolchain e runtime
- **Expo Router** - File-based navigation
- **React Query** - Server state management
- **Zustand** - Client state management
- **Axios** - API client
- **TypeScript** - Type safety

---

## 📂 Estrutura de Pastas

```
mobile/
├── app/                      # Expo Router (file-based routing)
│   ├── (auth)/              # Auth screens (login, register)
│   ├── (tabs)/              # Main app tabs (home, inventory, etc)
│   ├── products/            # Product screens
│   ├── customers/           # Customer screens
│   ├── entries/             # Stock entry screens
│   └── _layout.tsx          # Root layout
├── components/              # Reusable components
│   ├── ui/                  # UI components (Button, Input, etc)
│   └── ...                  # Feature components
├── services/                # API clients
├── store/                   # Zustand stores
├── hooks/                   # Custom React hooks
├── types/                   # TypeScript types
├── utils/                   # Utilities
├── constants/               # App constants (Config, Colors)
├── docs/                    # Documentation
└── scripts/                 # PowerShell scripts
```

---

## 🔧 Configuração

### API URL

Edite `constants/Config.ts`:

```typescript
// Para emulador Android:
export const API_URL = 'http://10.0.2.2:8000/api/v1';

// Para device físico (use localtunnel):
export const API_URL = 'https://your-tunnel-url.loca.lt/api/v1';
```

### Localtunnel (device físico):

```powershell
# No backend:
npx localtunnel --port 8000

# Copie a URL e atualize Config.ts
```

---

## 🧪 Testing

```powershell
npm test                      # Run tests
npm run lint                  # Lint check
```

---

## 📱 Build e Deploy

### Development build:

```bash
npx eas build --platform android --profile development
```

### Production build:

```bash
npx eas build --platform android --profile production
```

---

## 🐛 Troubleshooting

### Terminal travou
→ **[TERMINAL_FREEZE_FIX.md](./TERMINAL_FREEZE_FIX.md)**

### Expo não inicia
```powershell
.\kill-all.ps1
npm install
.\expo-dev.ps1
```

### App não atualiza
```powershell
# No terminal do Expo:
r + Enter    # Reload manual
```

### Erro de porta em uso
```powershell
.\kill-all.ps1
.\expo-dev.ps1
```

### Mudou branch Git
```powershell
.\kill-all.ps1
npm install
.\expo-dev.ps1
```

### Cache corrompido
```powershell
.\kill-all.ps1
npm cache clean --force
npm install
.\expo-dev.ps1
```

---

## 📚 Documentação Adicional

- 📄 [TERMINAL_FREEZE_FIX.md](./TERMINAL_FREEZE_FIX.md) - Solução definitiva para travamentos
- 📄 [EXPO_HANG_FIX.md](./EXPO_HANG_FIX.md) - Guia de troubleshooting Expo
- 📄 [EXPO_TROUBLESHOOTING.md](./EXPO_TROUBLESHOOTING.md) - Troubleshooting geral
- 📄 [docs/LOADING_SYSTEM.md](./docs/LOADING_SYSTEM.md) - Sistema de loading global
- 📄 [docs/NOTIFICATION_SYSTEM.md](./docs/NOTIFICATION_SYSTEM.md) - Sistema de notificações

---

## 🔗 Links Úteis

- **Backend API**: http://localhost:8000/docs
- **Expo Docs**: https://docs.expo.dev/
- **React Native Docs**: https://reactnative.dev/
- **Expo Router**: https://expo.github.io/router/docs/

---

## 💡 Pro Tips

1. **SEMPRE use `.\expo-dev.ps1`** ao invés de `npx expo start`
2. **Ctrl+C DUAS VEZES** para sair do Expo (se travar)
3. **Execute `.\kill-all.ps1`** antes de mudar branch Git
4. **Use tunnel** (`-Tunnel`) para testar em device físico
5. **Limpe cache** se comportamento estranho: `.\kill-all.ps1`

---

## 👥 Convenções de Código

- **TypeScript**: camelCase para variáveis/funções, PascalCase para componentes
- **Arquivos**: PascalCase.tsx para componentes, kebab-case.ts para utils
- **No Dividers**: Use margin/gap ao invés de componentes Divider
- **React Query**: SEMPRE invalide cache após mutations
- **Loading**: Use sistema de loading global (automático)

---

**Última atualização:** 2025-12-08
**Versão do Expo:** ~54.0.21
**React Native:** 0.76.5

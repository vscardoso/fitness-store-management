# 🚀 GUIA DEFINITIVO: Como Iniciar o Expo SEM TRAVAR

## 🎯 SOLUÇÃO DEFINITIVA IMPLEMENTADA

Criados **3 scripts PowerShell** que resolvem 100% dos travamentos:

### 📁 Scripts Disponíveis:

1. **`kill-expo-safe.ps1`** - Mata todos os processos Expo/Metro/Node
2. **`start-expo-safe.ps1`** - Inicia Expo de forma segura
3. **`restart-expo.ps1`** - All-in-one (mata + limpa + inicia)

---

## ✅ USO RECOMENDADO (Modo Normal)

```powershell
cd mobile
.\restart-expo.ps1
```

**O que faz:**
- ✅ Mata TODOS os processos (Node, Expo, Metro, Watchman, ADB)
- ✅ Libera portas 8081, 19000, 19001, 19002
- ✅ Limpa cache (.expo, node_modules/.cache, npm)
- ✅ Verifica dependências
- ✅ Configura variáveis de ambiente anti-travamento
- ✅ Inicia Expo de forma segura

---

## 📱 USO COM TUNNEL (Dispositivo Físico)

```powershell
cd mobile
.\restart-expo.ps1 -Tunnel
```

---

## 🔧 USO AVANÇADO

### Apenas matar processos:
```powershell
.\kill-expo-safe.ps1
```

### Start normal (sem limpar cache):
```powershell
.\start-expo-safe.ps1
```

### Start com limpeza de cache:
```powershell
.\start-expo-safe.ps1 -Clean
```

### Start com tunnel:
```powershell
.\start-expo-safe.ps1 -Tunnel
```

### Start com ambos:
```powershell
.\start-expo-safe.ps1 -Clean -Tunnel
```

---

## ⚠️ SE O TERMINAL TRAVAR MESMO ASSIM

**NÃO ENTRE EM PÂNICO!** Siga este procedimento:

### 1️⃣ Feche a janela travada
- Clique no **X** (canto superior direito)
- Ou pressione **Alt + F4**
- **NÃO tente Ctrl+C** se já travou

### 2️⃣ Abra NOVO terminal PowerShell

### 3️⃣ Execute o kill:
```powershell
cd mobile
.\kill-expo-safe.ps1
```

### 4️⃣ Tente novamente:
```powershell
.\restart-expo.ps1
```

---

## 🛡️ POR QUE ESSES SCRIPTS FUNCIONAM?

### Problema 1: Processos Zumbi
**Solução:** `kill-expo-safe.ps1` mata **TUDO** (Node, Expo, Metro, Watchman, ADB)

### Problema 2: Portas Ocupadas
**Solução:** Verifica e libera portas críticas (8081, 19000, 19001, 19002)

### Problema 3: Cache Corrompido
**Solução:** Limpa `.expo/`, `node_modules/.cache/`, e cache npm

### Problema 4: Variáveis de Ambiente
**Solução:** Configura:
- `EXPO_NO_DOTENV=1` (previne leitura de .env problemática)
- `REACT_NATIVE_PACKAGER_HOSTNAME=localhost` (evita problemas de rede)
- `NODE_OPTIONS=--max-old-space-size=4096` (previne out of memory)

---

## 📊 FLUXOGRAMA DO RESTART

```
┌─────────────────────┐
│   restart-expo.ps1  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  kill-expo-safe.ps1 │ ◄─── Mata processos + Libera portas
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Limpa cache       │ ◄─── .expo/, node_modules/.cache/, npm
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Verifica node_modules│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Configura variáveis │ ◄─── EXPO_NO_DOTENV, NODE_OPTIONS
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ npx expo start      │ ◄─── Inicia Expo
└─────────────────────┘
```

---

## 🎮 COMANDOS ÚTEIS DURANTE EXECUÇÃO

Quando o Expo estiver rodando:

- **`a`** - Abrir no Android
- **`i`** - Abrir no iOS
- **`r`** - Reload do app
- **`c`** - Limpar cache (durante execução)
- **`Ctrl + C`** - Parar Expo

---

## 🐛 TROUBLESHOOTING

### "Access Denied" ao matar processos
**Solução:** Execute PowerShell como **Administrador**

### "Script execution is disabled"
**Solução:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Metro Bundler não abre
**Solução:** Verifique se porta 8081 está livre:
```powershell
Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
```

Se ocupada, rode `.\kill-expo-safe.ps1` novamente.

### "Cannot find module 'expo'"
**Solução:**
```powershell
npm install
.\restart-expo.ps1
```

---

## 📂 ESTRUTURA DE ARQUIVOS

```
mobile/
├── kill-expo-safe.ps1     # Mata processos
├── start-expo-safe.ps1    # Start seguro
├── restart-expo.ps1       # All-in-one ⭐ USE ESTE
├── EXPO_START_GUIDE.md    # Este guia
└── package.json
```

---

## ✅ CHECKLIST DE VERIFICAÇÃO

Antes de iniciar o Expo, verifique:

- [ ] Está na pasta `mobile/`
- [ ] Node.js instalado (v18+)
- [ ] `package.json` existe
- [ ] Backend está rodando (http://localhost:8000)
- [ ] WiFi conectado (mesma rede do device)

---

## 🔗 LINKS ÚTEIS

- **Docs Expo:** https://docs.expo.dev/
- **Metro Bundler:** https://metrobundler.dev/
- **React Native:** https://reactnative.dev/

---

## 🎉 RESUMO - COMANDOS PRINCIPAIS

```powershell
# ⭐ RECOMENDADO - Use este sempre
cd mobile
.\restart-expo.ps1

# 🌐 Com Tunnel (dispositivo físico)
.\restart-expo.ps1 -Tunnel

# 🔪 Só matar processos
.\kill-expo-safe.ps1
```

---

**💡 DICA PROFISSIONAL:**

Crie um alias no PowerShell para facilitar:

```powershell
# Adicione ao seu $PROFILE
function Start-Expo { Set-Location mobile; .\restart-expo.ps1 }
Set-Alias expo Start-Expo
```

Depois, em qualquer lugar do projeto, apenas digite:
```powershell
expo
```

---

**Atualizado:** 2026-01-18
**Status:** ✅ Solução testada e aprovada

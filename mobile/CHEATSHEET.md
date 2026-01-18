# 📋 Mobile Development Cheatsheet

## 🚀 Iniciar

```powershell
.\expo-dev.ps1
```

## 🔥 Travou? FAÇA ISSO:

```powershell
# 1. Feche terminal (X ou Alt+F4)
# 2. Novo terminal:
.\kill-all.ps1
.\expo-dev.ps1
```

## ⌨️ Comandos no Expo

| Tecla | Ação |
|-------|------|
| `r` | Reload app |
| `j` | Open debugger |
| `m` | Toggle menu |
| `Ctrl+C` × 2 | Sair (DUAS VEZES!) |

## 📦 Scripts Principais

| Script | Quando Usar |
|--------|-------------|
| `.\expo-dev.ps1` | TODO DIA (iniciar desenvolvimento) |
| `.\expo-dev.ps1 -Tunnel` | Device físico |
| `.\kill-all.ps1` | Terminal travou, mudou branch, bugs |
| `npm install` | Após pull, mudou branch |

## 🔧 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Terminal não responde | Feche terminal → `.\kill-all.ps1` |
| Port 8081 in use | `.\kill-all.ps1` |
| App não recarrega | Pressione `r` |
| Metro crashed | `.\kill-all.ps1` → `.\expo-dev.ps1` |
| Mudou branch | `.\kill-all.ps1` → `npm i` → `.\expo-dev.ps1` |
| Tudo quebrou | `.\kill-all.ps1` → `rm -rf node_modules` → `npm i` → `.\expo-dev.ps1` |

## 🎯 Fluxo Diário

### Manhã:
```powershell
# Backend (Terminal 1):
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Mobile (Terminal 2):
cd mobile
.\expo-dev.ps1
```

### Durante:
```powershell
# Se travar:
.\kill-all.ps1
.\expo-dev.ps1
```

### Noite:
```powershell
# Ctrl+C nos dois terminais
.\kill-all.ps1    # Limpa tudo
```

## ❌ NUNCA Faça

- ❌ `npx expo start` (use `.\expo-dev.ps1`)
- ❌ Fechar sem Ctrl+C
- ❌ Ignorar "port in use"
- ❌ Iniciar dois Expo ao mesmo tempo

## ✅ SEMPRE Faça

- ✅ `.\expo-dev.ps1` para iniciar
- ✅ Ctrl+C **× 2** para sair
- ✅ `.\kill-all.ps1` quando travar
- ✅ Limpar após mudar branch

## 🔗 Documentação

- **Quick Start**: `QUICK_START.md`
- **Travamento**: `TERMINAL_FREEZE_FIX.md`
- **Projeto**: `README.md`
- **Expo Fix**: `EXPO_HANG_FIX.md`

## 🆘 Emergência

```powershell
# Nuclear option (quando NADA funciona):
.\kill-all.ps1
Remove-Item node_modules -Recurse -Force
npm cache clean --force
npm install
.\expo-dev.ps1

# Última opção: REINICIAR PC
```

## 📱 Device Físico

```powershell
# 1. Inicie com tunnel:
.\expo-dev.ps1 -Tunnel

# 2. No app Expo Go, escaneie QR code

# 3. Se não conectar, use localtunnel no backend:
cd backend
npx localtunnel --port 8000
# Copie URL para mobile/constants/Config.ts
```

## 🧪 Verificações

```powershell
# Ver processos Node:
Get-Process node

# Ver porta 8081:
Get-NetTCPConnection -LocalPort 8081

# Matar processo específico:
Stop-Process -Id <PID> -Force
```

---

**💡 DICA FINAL:**

Cole este comando no terminal e salve em algum lugar:

```powershell
cd C:\Users\Victor\Desktop\fitness-store-management\mobile; .\kill-all.ps1; .\expo-dev.ps1
```

Um único comando para resolver 99% dos problemas! 🎯

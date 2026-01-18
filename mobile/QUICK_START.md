# ⚡ Quick Start - Mobile Development

## 🚀 Iniciar Desenvolvimento

```powershell
cd mobile
.\expo-dev.ps1
```

**Pronto!** O script faz tudo automaticamente:
- ✅ Verifica conflitos
- ✅ Limpa cache
- ✅ Inicia Expo protegido

---

## 🆘 Terminal Travou?

### Solução em 2 passos:

```powershell
# 1. Feche o terminal (X ou Alt+F4)

# 2. Abra novo terminal:
cd mobile
.\kill-all.ps1
.\expo-dev.ps1
```

**Alternativa rápida:** Ctrl+C **DUAS VEZES** rapidamente

---

## 📋 Comandos Diários

### Iniciar Expo:
```powershell
.\expo-dev.ps1
```

### Device físico:
```powershell
.\expo-dev.ps1 -Tunnel
```

### Matar processos travados:
```powershell
.\kill-all.ps1
```

### Após mudar branch Git:
```powershell
.\kill-all.ps1
npm install
.\expo-dev.ps1
```

### Reinstalar tudo (problemas persistentes):
```powershell
.\kill-all.ps1
Remove-Item node_modules -Recurse -Force
npm install
.\expo-dev.ps1
```

---

## 🎯 Fluxo de Trabalho

### Manhã (iniciar):
```powershell
# Terminal 1 - Backend
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Mobile
cd mobile
.\expo-dev.ps1
```

### Durante o dia (se travar):
```powershell
# Feche terminal → Abra novo:
.\kill-all.ps1
.\expo-dev.ps1
```

### Noite (encerrar):
```powershell
# Ctrl+C no Expo
# Ctrl+C no Backend
.\kill-all.ps1    # Limpa tudo
```

---

## ❌ NÃO Faça

- ❌ `npx expo start` (use `.\expo-dev.ps1`)
- ❌ Fechar terminal sem Ctrl+C antes
- ❌ Ignorar avisos de "port in use"
- ❌ Iniciar Expo se já houver outro rodando

## ✅ SEMPRE Faça

- ✅ Use `.\expo-dev.ps1` para iniciar
- ✅ Ctrl+C **DUAS VEZES** para sair
- ✅ Execute `.\kill-all.ps1` quando travar
- ✅ Limpe cache após mudar branch

---

## 📚 Documentação Completa

- 📘 **[README.md](./README.md)** - Visão geral do projeto
- 🛡️ **[TERMINAL_FREEZE_FIX.md](./TERMINAL_FREEZE_FIX.md)** - Solução definitiva para travamentos
- 🔧 **[EXPO_HANG_FIX.md](./EXPO_HANG_FIX.md)** - Troubleshooting Expo

---

## 🔥 Casos Comuns

| Problema | Solução |
|----------|---------|
| Terminal travou | `.\kill-all.ps1` |
| Port 8081 in use | `.\kill-all.ps1` |
| App não atualiza | Pressione `r` no Expo |
| Metro crashed | `.\kill-all.ps1` → `.\expo-dev.ps1` |
| Mudou branch | `.\kill-all.ps1` → `npm install` → `.\expo-dev.ps1` |
| Cache corrompido | `.\kill-all.ps1` → `.\expo-dev.ps1` |

---

**💡 Dica:** Mantenha este arquivo aberto em outra janela para consulta rápida!

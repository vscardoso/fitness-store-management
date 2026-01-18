# 🛡️ Solução DEFINITIVA para Travamento do Terminal

## 🚨 O Problema

Terminal trava ao rodar Expo (mesmo após Ctrl+C, nada responde). Isso acontece porque:

1. **Processos Node ficam órfãos** (não morrem com Ctrl+C)
2. **Portas ficam ocupadas** (8081, 19000-19006)
3. **Cache corrompido** do Metro Bundler
4. **Watchman em loop** no Windows
5. **Prompts interativos** do Expo (login, confirmações, etc.)

## 🎯 Solução Implementada (ATUALIZADO 2025-12-10)

### 🆕 Problema Resolvido: Prompts Interativos

**Antes:** O terminal ficava "travado" esperando input do usuário:
- ❌ Perguntava se queria limpar processos (S/n)
- ❌ Expo pedia login para obter push token
- ❌ Usuário precisava responder antes do app iniciar

**Agora:** O script `expo-dev.ps1` foi **melhorado** para evitar **TODOS** os prompts:

✅ **Auto-limpeza** - Mata processos automaticamente (sem pedir confirmação)
✅ **Modo Offline** - Flag `--offline` evita prompts de login do Expo
✅ **Zero Interação** - Startup 100% automatizado
✅ **Notificações Locais** - Continuam funcionando normalmente em modo offline

### 🔧 Mudanças Técnicas

1. **expo-dev.ps1 linha 42**: Removido prompt "Deseja limpar tudo antes de continuar?"
   - Antes: `Read-Host` (esperava resposta)
   - Agora: Limpeza automática

2. **expo-dev.ps1 linha 105**: Adicionado `--offline`
   - Evita que Expo tente autenticar
   - Evita prompts de login
   - Push tokens remotos não funcionam (mas notificações locais sim)

---

## ✅ SOLUÇÃO DEFINITIVA

### 1️⃣ **Quando o terminal travar AGORA**

**Feche o terminal forçadamente:**
- Clique no **X** do terminal
- OU pressione **Alt+F4**
- OU **Ctrl+Shift+Esc** → Task Manager → End Task no terminal

**Depois, abra NOVO terminal e execute:**

```powershell
cd mobile
.\kill-all.ps1
```

Este script é EXTREMAMENTE agressivo e mata:
- ✅ Todos os processos Node/Expo/Metro/Watchman
- ✅ Todos os processos usando portas 8081, 19000-19006
- ✅ Todos os nodes rodando código Expo/React Native
- ✅ Limpa TODOS os caches

---

### 2️⃣ **Como iniciar Expo SEM TRAVAR (uso diário)**

**SEMPRE use este comando:**

```powershell
cd mobile
.\expo-dev.ps1
```

**O que este script faz:**
- 🛡️ Verifica se há processos conflitantes
- 🧹 Limpa automaticamente se necessário
- ✅ Inicia Expo com flags otimizados
- 📊 Mostra instruções de uso

**Flags opcionais:**

```powershell
# Device físico (com tunnel):
.\expo-dev.ps1 -Tunnel

# Não limpar cache (início mais rápido):
.\expo-dev.ps1 -NoClear

# Ver logs detalhados:
.\expo-dev.ps1 -Verbose

# Combinar flags:
.\expo-dev.ps1 -Tunnel -Verbose
```

---

### 3️⃣ **Se travar DURANTE o desenvolvimento**

**Opção A: Ctrl+C Duplo (mais rápido)**
```
Pressione Ctrl+C DUAS VEZES rapidamente (< 1 segundo)
```

**Opção B: Fechar e limpar (se Ctrl+C não funcionar)**
1. Feche o terminal (X ou Alt+F4)
2. Abra novo terminal
3. Execute:
```powershell
cd mobile
.\kill-all.ps1
.\expo-dev.ps1
```

---

## 📋 Fluxo de Trabalho Recomendado

### Início do dia:

```powershell
# Terminal 1 - Backend
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Mobile (USE ESTE)
cd mobile
.\expo-dev.ps1
```

### Durante o dia:

- **Travou?** → Feche terminal → `.\kill-all.ps1` → `.\expo-dev.ps1`
- **Mudou branch?** → `.\kill-all.ps1` → `npm install` → `.\expo-dev.ps1`
- **Instalou pacote?** → `.\kill-all.ps1` → `.\expo-dev.ps1`
- **Bug estranho?** → `.\kill-all.ps1` → `.\expo-dev.ps1 -NoClear`

### Final do dia:

```powershell
# Limpe tudo antes de fechar:
.\kill-all.ps1
```

---

## 🔧 Scripts Disponíveis

### `kill-all.ps1` - Mata TUDO
```powershell
.\kill-all.ps1
```
- Mata todos os processos Node/Expo/Metro
- Libera todas as portas (8081, 19000-19006)
- Limpa todos os caches
- Verifica se ficou algum processo órfão
- **Use quando**: Terminal travou, vai mudar branch, bug estranho

### `expo-dev.ps1` - Inicia com segurança (MELHORADO ✨)
```powershell
.\expo-dev.ps1                  # Normal (RECOMENDADO)
.\expo-dev.ps1 -Tunnel          # Device físico
.\expo-dev.ps1 -NoClear         # Sem limpar cache
.\expo-dev.ps1 -Verbose         # Logs detalhados
```
**NOVIDADES (2025-12-10):**
- ✅ **Auto-limpeza SEM PROMPT** - Mata processos automaticamente
- ✅ **Modo offline** - Flag `--offline` evita prompts de login
- ✅ **100% Automatizado** - Zero interação necessária

**O que faz:**
- Verifica processos conflitantes
- Limpa automaticamente se necessário (SEM PEDIR CONFIRMAÇÃO)
- Inicia com flags anti-travamento + modo offline
- Mostra instruções de uso
- **Use quando**: Iniciar desenvolvimento (TODO DIA)

### `kill-expo.ps1` (legado)
```powershell
.\kill-expo.ps1
```
- Versão antiga, menos agressiva
- Use `kill-all.ps1` ao invés deste

### `start-expo-safe.ps1` (legado)
```powershell
.\start-expo-safe.ps1
```
- Versão antiga, menos features
- Use `expo-dev.ps1` ao invés deste

---

## 🆘 Situações Específicas

### Terminal travou e não fecha

```powershell
# Em OUTRO terminal:
cd mobile
.\kill-all.ps1
```

### Erro: "Port 8081 already in use"

```powershell
.\kill-all.ps1
.\expo-dev.ps1
```

### Erro: "Metro bundler crashed"

```powershell
.\kill-all.ps1
.\expo-dev.ps1
```

### App não atualiza (hot reload parou)

```powershell
# No terminal do Expo, pressione:
r + Enter    # Reload manual

# Se não funcionar:
.\kill-all.ps1
.\expo-dev.ps1
```

### "Operation timed out" ao conectar device

```powershell
# Usar tunnel:
.\kill-all.ps1
.\expo-dev.ps1 -Tunnel
```

### Node usando muita memória (>2GB)

```powershell
# Reiniciar do zero:
.\kill-all.ps1
.\expo-dev.ps1 -NoClear
```

### Mudou branch Git

```powershell
# Cache pode estar inconsistente:
.\kill-all.ps1
npm install   # Reinstala dependências
.\expo-dev.ps1
```

---

## 🔍 Diagnóstico Manual

### Ver processos Node rodando:
```powershell
Get-Process node | Select-Object Id, CPU, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet64/1MB,2)}}
```

### Ver o que está usando porta 8081:
```powershell
Get-NetTCPConnection -LocalPort 8081 | Select-Object State, OwningProcess
```

### Matar processo específico por PID:
```powershell
Stop-Process -Id <PID> -Force
```

### Ver linha de comando de todos os Nodes:
```powershell
Get-WmiObject Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId, CommandLine
```

---

## ⚙️ Prevenção

### ✅ SEMPRE:
- Use `.\expo-dev.ps1` para iniciar
- Pressione **Ctrl+C DUAS VEZES** para sair
- Execute `.\kill-all.ps1` antes de fechar o PC

### ❌ NUNCA:
- Não use `npx expo start` diretamente
- Não feche o terminal sem Ctrl+C antes
- Não inicie Expo se já houver outro rodando
- Não ignore avisos de "port in use"

---

## 📊 Comparação dos Scripts

| Script | Uso | Agressividade | Quando Usar |
|--------|-----|---------------|-------------|
| `kill-all.ps1` | Mata processos | 🔥🔥🔥 Máxima | Terminal travou, bugs, mudança de branch |
| `expo-dev.ps1` | Inicia Expo | 🛡️ Preventivo | Todo dia, início de desenvolvimento |
| `kill-expo.ps1` | Mata processos | 🔥🔥 Média | Legado, use `kill-all.ps1` |
| `start-expo-safe.ps1` | Inicia Expo | 🛡️ Básico | Legado, use `expo-dev.ps1` |

---

## 🎯 Checklist de Troubleshooting

Quando o terminal travar, siga esta ordem:

- [ ] **Tentou Ctrl+C duas vezes rápido?**
- [ ] **Fechou o terminal (X ou Alt+F4)?**
- [ ] **Executou `.\kill-all.ps1` em novo terminal?**
- [ ] **Verificou Task Manager para processos Node órfãos?**
- [ ] **Executou `.\expo-dev.ps1`?**
- [ ] **Ainda travando? Execute como ADMINISTRADOR:**
  ```powershell
  Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-Command', 'cd C:\Users\Victor\Desktop\fitness-store-management\mobile; .\kill-all.ps1'
  ```
- [ ] **Última opção: Reiniciar o PC**

---

## 🚀 TL;DR (Resumo Executivo)

### Para iniciar desenvolvimento (100% AUTOMATIZADO):
```powershell
cd mobile
.\expo-dev.ps1
```
**NOVIDADE:** Agora é 100% automatizado! Não pede confirmação, não pede login, não trava!

### Se travar:
```powershell
# Feche o terminal (X ou Alt+F4), depois:
cd mobile
.\kill-all.ps1
.\expo-dev.ps1
```

### Para sair do Expo:
```
Pressione Ctrl+C DUAS VEZES rapidamente
```

### ⚠️ Importante: Modo Offline
O script usa `--offline` para evitar prompts. Isso significa:
- ✅ Notificações locais: Funcionam
- ✅ Notificações agendadas: Funcionam
- ✅ Banners in-app: Funcionam
- ❌ Push notifications remotas: Não funcionam em dev
  (Para testar push remoto, use Expo EAS ou configure projectId real)

---

## 📞 Ajuda Adicional

**Se NADA funcionar:**

1. Reinicie o PC
2. Depois de reiniciar:
```powershell
cd mobile
.\kill-all.ps1
npm cache clean --force
npm install
.\expo-dev.ps1
```

3. Se ainda assim travar, verifique:
- Antivírus bloqueando Node.exe
- Firewall bloqueando portas
- Windows Defender em scan
- Outro projeto Expo rodando em paralelo

---

**Última atualização:** 2025-12-10
**Testado com:** Node 18.x, Expo SDK 54, Windows 10/11
**Status:** ✅ Solução definitiva implementada + Auto-limpeza + Modo Offline

**Changelog:**
- **2025-12-10**: Removido prompt de confirmação + adicionado modo offline
- **2025-12-08**: Versão inicial com kill-all.ps1 e expo-dev.ps1

# Guia de Troubleshooting - Expo CLI

Soluções para problemas comuns do Expo, especialmente travamentos após "Proceed anonymously".

## 🚨 Problema: Expo Trava Após Login/Anonymous

### Sintomas
- Escolheu "Proceed anonymously" → Expo não responde
- Tecla "r" não funciona para reload
- Cursor piscando mas nada acontece
- Precisa fechar o terminal forçadamente

### Causa
Bug conhecido do Expo CLI relacionado a:
- Cache corrompido do Metro Bundler
- Processo Node travado
- Porta 8081 ocupada

---

## ✅ Soluções (em ordem de complexidade)

### **Solução 1: Reinício Rápido (RECOMENDADO)**

```powershell
# 1. Pressionar Ctrl+C no terminal (pode precisar 2x)
# 2. Executar script de restart
cd mobile
.\restart-expo.ps1

# 3. Iniciar novamente
npx expo start --clear
```

---

### **Solução 2: Limpar Cache Manualmente**

```powershell
cd mobile

# Matar processos Node
taskkill /F /IM node.exe

# Limpar cache
Remove-Item -Recurse -Force .expo
Remove-Item -Recurse -Force node_modules\.cache

# Reiniciar
npx expo start --clear
```

---

### **Solução 3: Pular Pergunta de Login**

**Evite a tela de login completamente:**

```powershell
# Opção A: Com --tunnel (mais confiável)
npx expo start --clear --tunnel

# Opção B: Modo developer
npx expo start --clear --no-dev

# Opção C: Usar script otimizado
.\start-expo.ps1
```

---

### **Solução 4: Fazer Login de Uma Vez**

**Se você tem conta Expo, faça login uma vez e evite a pergunta:**

```powershell
# 1. Login (só precisa fazer 1x)
npx expo login

# 2. Iniciar normalmente (não perguntará mais)
npx expo start
```

---

### **Solução 5: Reset Completo**

**Quando nada mais funciona:**

```powershell
cd mobile

# 1. Matar TUDO
taskkill /F /IM node.exe
taskkill /F /IM expo.exe

# 2. Limpar TUDO
Remove-Item -Recurse -Force .expo
Remove-Item -Recurse -Force node_modules\.cache
Remove-Item -Recurse -Force .metro

# 3. Reinstalar dependências (OPCIONAL, só se necessário)
# npm install

# 4. Iniciar limpo
npx expo start --clear --tunnel
```

---

## 🛠️ Scripts PowerShell Criados

### **start-expo.ps1**
Inicia Expo com cache limpo automaticamente.

```powershell
.\start-expo.ps1
```

### **restart-expo.ps1**
Mata processos, limpa cache e prepara para reinício.

```powershell
.\restart-expo.ps1
# Depois: npx expo start --clear
```

---

## 🔍 Diagnóstico

### **Verificar se Node está rodando:**
```powershell
tasklist | findstr node.exe
```

### **Verificar porta 8081:**
```powershell
netstat -ano | findstr :8081
```

### **Ver processos Expo:**
```powershell
Get-Process | Where-Object {$_.ProcessName -like "*expo*" -or $_.ProcessName -like "*node*"}
```

---

## ⚙️ Configurações para Evitar Travamentos

### **1. Usar .expo/settings.json**

Crie o arquivo `mobile/.expo/settings.json`:

```json
{
  "scheme": "fitness-store",
  "hostType": "tunnel",
  "dev": true,
  "minify": false,
  "urlRandomness": null
}
```

### **2. Adicionar script ao package.json**

```json
{
  "scripts": {
    "start": "expo start --clear",
    "start:tunnel": "expo start --clear --tunnel",
    "start:safe": "expo start --clear --no-dev --tunnel"
  }
}
```

**Usar:**
```bash
npm run start:safe
```

---

## 🚀 Workflow Recomendado

### **Inicialização Diária:**

```powershell
# Terminal 1 - Backend
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Mobile (USE ESTE COMANDO)
cd mobile
npx expo start --clear --tunnel
```

### **Se Travar Durante o Dia:**

```powershell
# 1. Ctrl+C (fechar Expo)
# 2. Executar
.\restart-expo.ps1

# 3. Reiniciar
npx expo start --clear --tunnel
```

---

## 📱 Alternativas ao Expo Go

Se os problemas persistirem, considere:

### **Opção 1: Development Build**
```bash
npx eas build --platform android --profile development
```

### **Opção 2: Android Studio Emulator**
```bash
npx expo start --android
```

---

## 🔧 Comandos Úteis

### **Limpar tudo (hard reset):**
```powershell
taskkill /F /IM node.exe; `
Remove-Item -Recurse -Force .expo; `
Remove-Item -Recurse -Force node_modules\.cache; `
npx expo start --clear
```

### **Forçar reload do app:**
```bash
# No terminal do Expo:
r + Enter  # Reload
Shift + M  # Abrir menu developer
```

### **Ver logs detalhados:**
```bash
npx expo start --clear --verbose
```

---

## ❓ FAQ

### **P: Por que o Expo trava após "Proceed anonymously"?**
R: Bug conhecido relacionado a cache e processos Node. Use `--clear --tunnel` para evitar.

### **P: Preciso fazer login no Expo?**
R: Não para desenvolvimento local. Só precisa para:
- Fazer builds com EAS
- Push notifications remotas
- Publicar app

### **P: O que faz `--tunnel`?**
R: Cria um túnel via ngrok, permitindo testar em qualquer rede. Mais estável que LAN.

### **P: Posso usar em produção sem login?**
R: Não. Para produção (builds, push notifications), precisa de conta Expo.

### **P: Quanto tempo demora o `--clear`?**
R: 10-30 segundos na primeira vez, depois é rápido.

---

## 📊 Checklist de Troubleshooting

Quando o Expo travar:

- [ ] Tentou Ctrl+C?
- [ ] Tentou `.\restart-expo.ps1`?
- [ ] Tentou `npx expo start --clear --tunnel`?
- [ ] Verificou se Node está rodando (tasklist)?
- [ ] Limpou cache (.expo, node_modules\.cache)?
- [ ] Reiniciou o computador (última opção)?

---

## 🆘 Último Recurso

Se absolutamente NADA funcionar:

```powershell
# 1. Fechar TUDO
taskkill /F /IM node.exe
taskkill /F /IM expo.exe
taskkill /F /IM watchman.exe

# 2. Deletar node_modules completo
cd mobile
Remove-Item -Recurse -Force node_modules

# 3. Reinstalar TUDO
npm install

# 4. Limpar cache global do npm
npm cache clean --force

# 5. Iniciar do zero
npx expo start --clear --tunnel
```

---

## 📞 Suporte

**Se o problema persistir:**

1. Verifique versões:
   ```bash
   node --version  # Deve ser 18.x ou superior
   npm --version   # Deve ser 9.x ou superior
   npx expo --version
   ```

2. Procure erros específicos:
   ```bash
   npx expo start --clear --verbose 2>&1 | Out-File -FilePath expo-debug.log
   ```

3. Reporte issue com log:
   - https://github.com/expo/expo/issues

---

**Última atualização:** 2025-12-08
**Versão do Expo:** ~54.0.21

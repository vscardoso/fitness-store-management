# 🛠️ Expo Hang/Freeze Fix - Windows

## 🚨 Problema: Expo trava e não responde ao Ctrl+C

Isso acontece frequentemente no Windows devido ao Metro bundler/Watchman ficarem em estados inconsistentes.

---

## ✅ Soluções Rápidas

### 1️⃣ **Matar processo travado imediatamente**
```powershell
# Execute este script quando travar:
.\kill-expo.ps1
```

**O que faz:**
- Mata TODOS os processos Node/Expo/Metro forçadamente
- Libera as portas 8081, 19000-19006
- Limpa cache do Metro e React Native
- Permite reiniciar limpo

---

### 2️⃣ **Reiniciar Expo completamente limpo**
```powershell
# Reinício completo com limpeza de cache:
.\restart-expo-clean.ps1
```

**O que faz:**
- Executa kill-expo.ps1
- Remove `.expo/` folder
- Remove `node_modules/.cache/`
- Limpa watchman (se instalado)
- Reinicia Expo com `--clear`

---

### 3️⃣ **Iniciar Expo com proteção contra travamento**
```powershell
# Uso recomendado no dia-a-dia:
.\start-expo-safe.ps1
```

**O que faz:**
- Verifica se portas já estão em uso
- Limpa automaticamente se necessário
- Inicia com flags otimizados (`--clear`, `--max-workers 2`)

---

## 🔧 Técnicas de Emergência

### Se Ctrl+C não funciona:

#### Opção 1: Ctrl+C DUAS vezes rápido
```
Press Ctrl+C twice quickly (within 1 second)
```

#### Opção 2: Fechar terminal forçadamente
```
Click no "X" do terminal
OU
Alt+F4
```

#### Opção 3: Matar via Task Manager
```
1. Ctrl+Shift+Esc
2. Busque por "node.exe" ou "expo"
3. Botão direito → End Task
```

#### Opção 4: PowerShell em outro terminal
```powershell
# Em um NOVO terminal PowerShell:
Get-Process node | Stop-Process -Force
Get-Process expo | Stop-Process -Force
```

---

## 🎯 Prevenção: Evitar travamentos futuros

### 1. **SEMPRE use start-expo-safe.ps1**
```powershell
# Em vez de:
npx expo start

# Use:
.\start-expo-safe.ps1
```

### 2. **Limpe cache regularmente**
```powershell
# Uma vez por semana ou ao encontrar bugs estranhos:
npx expo start --clear
```

### 3. **Restart limpo após muitas mudanças**
```powershell
# Depois de instalar pacotes, mudar config, etc:
.\restart-expo-clean.ps1
```

### 4. **Evite hot reload excessivo**
- Faça mudanças incrementais
- Salve arquivos de uma vez em vez de salvar a cada linha
- Se fizer muitas mudanças, reinicie manualmente

### 5. **Monitore uso de memória**
```powershell
# Se node.exe estiver usando >2GB RAM, reinicie:
.\restart-expo-clean.ps1
```

---

## 🧪 Casos Específicos

### **Travou durante npm install**
```powershell
# 1. Matar processos
.\kill-expo.ps1

# 2. Limpar node_modules
Remove-Item node_modules -Recurse -Force

# 3. Reinstalar
npm install

# 4. Iniciar limpo
.\start-expo-safe.ps1
```

### **Travou após mudança de branch git**
```powershell
# Cache pode estar inconsistente:
.\restart-expo-clean.ps1
```

### **Travou ao conectar device físico**
```powershell
# Portas podem estar bloqueadas:
.\kill-expo.ps1
# Depois reconecte o device e:
.\start-expo-safe.ps1
```

---

## 📊 Diagnóstico

### Verificar se Expo está realmente travado:
```powershell
# Checar se portas estão em uso:
Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 19000 -ErrorAction SilentlyContinue

# Ver processos Node rodando:
Get-Process node | Select-Object Id, CPU, WorkingSet, CommandLine
```

### Ver o que está usando as portas:
```powershell
# Ver PID usando porta 8081:
Get-NetTCPConnection -LocalPort 8081 | Select-Object OwningProcess

# Ver detalhes do processo:
Get-Process -Id <PID_AQUI>
```

---

## ⚙️ Configurações Avançadas

### Reduzir uso de memória do Metro:
```powershell
# Adicione ao package.json:
"scripts": {
  "start": "expo start --max-workers 2"
}
```

### Desabilitar watchman (pode ajudar no Windows):
```bash
# Crie .watchmanconfig na raiz do mobile/:
echo {} > .watchmanconfig
```

---

## 🆘 Último Recurso

Se NADA funcionar:

```powershell
# 1. Reiniciar o PC (libera tudo)
Restart-Computer

# 2. Após reiniciar:
cd mobile
.\restart-expo-clean.ps1
```

---

## 📞 Comandos Úteis de Referência

```powershell
# Matar tudo e recomeçar (uso mais comum):
.\kill-expo.ps1 && .\start-expo-safe.ps1

# Ver se algo está rodando:
Get-Process node, expo -ErrorAction SilentlyContinue

# Ver uso de portas:
Get-NetTCPConnection -LocalPort 8081,19000,19001,19006 -ErrorAction SilentlyContinue

# Limpar TUDO (nuclear option):
.\kill-expo.ps1
Remove-Item .expo, node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
npx expo start --clear
```

---

## ✅ Checklist de Resolução Rápida

Quando Expo travar:
- [ ] Tentou Ctrl+C duas vezes rápido?
- [ ] Executou `.\kill-expo.ps1`?
- [ ] Fechou o terminal e abriu novo?
- [ ] Executou `.\restart-expo-clean.ps1`?
- [ ] Verificou Task Manager para processos Node órfãos?
- [ ] Última opção: reiniciar PC?

---

**🎯 TL;DR: Use `.\start-expo-safe.ps1` sempre. Se travar, execute `.\kill-expo.ps1`.**

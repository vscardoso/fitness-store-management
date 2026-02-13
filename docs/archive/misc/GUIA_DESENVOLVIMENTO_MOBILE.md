# 📱 Guia de Desenvolvimento Mobile

## 🎯 Configuração Automática de Ambiente

O app agora detecta automaticamente o ambiente:

- **Desenvolvimento** (`npx expo start`): Usa backend local (`http://192.168.200.52:8000`)
- **Produção** (`eas update`): Usa Render.com (`https://fitness-backend-x1qn.onrender.com`)

## 🚀 Como Testar com QR Code

### 1️⃣ Inicie o Backend Local
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
⚠️ **IMPORTANTE**: Use `--host 0.0.0.0` para aceitar conexões externas!

### 2️⃣ Inicie o Expo
```powershell
cd mobile
npx expo start --clear
```

### 3️⃣ Escaneie o QR Code
- Abra o **Expo Go** no celular
- Escaneie o QR Code que aparece no terminal
- **Celular e computador DEVEM estar na mesma rede Wi-Fi**

### 4️⃣ Verifique a Conexão
- Se aparecer tela de login → ✅ Funcionando!
- Se der erro de conexão → Veja "Troubleshooting" abaixo

---

## 🧪 Como Testar em Produção (Preview)

```powershell
cd mobile
eas update --branch preview --message "Seu teste aqui"
```

✅ **Vai usar automaticamente o servidor de produção (Render.com)**

---

## 🔧 Troubleshooting

### ❌ "Network request failed" ao escanear QR Code

**Causa**: Celular não consegue acessar o backend local

**Soluções**:

1. **Verifique se backend está rodando com `--host 0.0.0.0`**
   ```powershell
   # ❌ Errado (só aceita localhost)
   uvicorn app.main:app --reload
   
   # ✅ Correto (aceita conexões externas)
   uvicorn app.main:app --reload --host 0.0.0.0
   ```

2. **Verifique se celular e PC estão na mesma rede Wi-Fi**
   - No celular: Configurações → Wi-Fi → Nome da rede
   - No PC: ipconfig → Nome do adaptador deve ser o mesmo

3. **Teste se o backend está acessível**
   - No navegador do celular, acesse: `http://192.168.200.52:8000/docs`
   - Se abrir o Swagger → Backend OK
   - Se der timeout → Problema de rede/firewall

4. **Firewall do Windows pode estar bloqueando**
   ```powershell
   # Adicionar regra para permitir porta 8000
   New-NetFirewallRule -DisplayName "FastAPI Dev Server" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```

### ❌ "CORS error" no console

**Causa**: Backend não está permitindo o IP do seu celular

**Solução**: Atualize o arquivo `backend/.env`:
```env
CORS_ORIGINS=["http://192.168.200.52:8081","exp://192.168.200.52:8081"]
```

### ❌ IP mudou (rede diferente, Wi-Fi reiniciou)

**Solução rápida**:

1. Descubra o novo IP:
   ```powershell
   ipconfig | Select-String -Pattern "IPv4"
   ```

2. Atualize em **2 lugares**:
   - `mobile/constants/Config.ts` → `LOCAL_API_URL`
   - `backend/.env` → `CORS_ORIGINS`

3. Reinicie o backend

---

## 📊 Checklist de Desenvolvimento

### Antes de Testar no Celular:
- [ ] Backend rodando com `--host 0.0.0.0`
- [ ] Swagger acessível em `http://192.168.200.52:8000/docs`
- [ ] Celular na mesma rede Wi-Fi
- [ ] CORS atualizado com IP correto

### Antes de Fazer `eas update`:
- [ ] Código testado localmente
- [ ] Sem erros no console
- [ ] Backend de produção online (Render.com)
- [ ] Mensagem descritiva no update

---

## 🎨 Diferença entre os Ambientes

| Aspecto | Desenvolvimento (`npx expo start`) | Produção (`eas update`) |
|---------|-----------------------------------|-------------------------|
| Backend | Local (`http://192.168.200.52:8000`) | Render.com (https) |
| Hot Reload | ✅ Sim (instantâneo) | ❌ Não (precisa novo update) |
| Debug | ✅ Chrome DevTools | ❌ Sentry apenas |
| Requer Rede | ✅ Mesma Wi-Fi | ❌ Qualquer (usa internet) |
| Velocidade | 🚀 Muito rápida | 🐢 Depende do Render |
| Ideal para | Desenvolvimento/Teste | Homologação/Demo |

---

## 💡 Dicas Pro

### 1. Usar Túnel (Sem precisar mesma rede Wi-Fi)

Se não conseguir colocar celular na mesma rede:

```powershell
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload --host 0.0.0.0

# Terminal 2: Túnel
npx localtunnel --port 8000
```

Copie a URL gerada (ex: `https://happy-zebras-brush.loca.lt`) e atualize:
- `mobile/constants/Config.ts` → `LOCAL_API_URL`
- `backend/.env` → `CORS_ORIGINS`

⚠️ **Desvantagem**: Mais lento e instável

### 2. Modo "Produção Local"

Para testar exatamente como vai funcionar em produção:

1. Mude temporariamente em `Config.ts`:
   ```typescript
   BASE_URL: PRODUCTION_URL, // Força usar Render mesmo em dev
   ```

2. Teste com `npx expo start`

3. **Não esqueça de reverter!**

### 3. Ver Logs do Backend em Tempo Real

```powershell
# Backend mostra todas as requisições
uvicorn app.main:app --reload --host 0.0.0.0 --log-level debug
```

Útil para ver se o celular está chegando no backend.

---

## 🆘 Ajuda Rápida

**Celular não conecta?**
→ `http://192.168.200.52:8000/docs` abre no navegador do celular?

**Backend rodando mas dá timeout?**
→ Firewall do Windows! Execute o comando de firewall acima.

**IP mudou toda hora?**
→ Configure IP estático no roteador para seu PC.

**QR Code não aparece?**
→ `npx expo start --clear` e reabra o terminal.

**Tela branca após escanear?**
→ Backend está rodando? Veja console do Expo para erros.

---

**Configuração atualizada em**: 21/01/2026  
**IP atual**: 192.168.200.52

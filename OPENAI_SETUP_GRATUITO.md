# 🆓 Como Obter API Key Gratuita do OpenAI

## ✅ $5 USD Grátis por 3 Meses!

A OpenAI oferece **$5 dólares de créditos gratuitos** para contas novas, válidos por **3 meses**.

---

## 📝 Passo a Passo

### 1️⃣ Criar Conta OpenAI

1. Acesse: https://platform.openai.com/signup
2. Cadastre-se com:
   - Email
   - Ou login com Google/Microsoft
3. Confirme seu email

---

### 2️⃣ Gerar API Key

1. Faça login em: https://platform.openai.com/
2. Clique no seu perfil (canto superior direito)
3. Vá em **"API keys"**
4. Clique **"Create new secret key"**
5. Escolha um nome: `fitness-store-ai-scanner`
6. **⚠️ IMPORTANTE:** Copie a chave agora (não dá pra ver depois!)
7. Formato: `sk-proj-...` (começa com `sk-proj-`)

---

### 3️⃣ Verificar Créditos Grátis

1. Acesse: https://platform.openai.com/settings/organization/billing/overview
2. Você deve ver: **$5.00 free trial credit**
3. Válido por 3 meses a partir da criação da conta

---

### 4️⃣ Configurar no Projeto

1. Abra: `backend/.env`
2. Cole sua API key:

```env
# AI Configuration (OpenAI GPT-4o Vision)
OPENAI_API_KEY=sk-proj-SEU_TOKEN_AQUI
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=2048
AI_SCAN_ENABLED=True
AI_DEFAULT_MARKUP=100.0
```

3. Salve o arquivo
4. Reinicie o backend (ele recarrega automaticamente com `--reload`)

---

### 5️⃣ Testar

```powershell
# 1. Login
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" -Method Post -Body '{"email":"admin@fitness.com","password":"admin123"}' -ContentType "application/json"
$token = $loginResponse.access_token

# 2. Testar status
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/ai/status" -Headers $headers

# 3. Testar scan (substitua por sua imagem)
curl.exe -X POST "http://localhost:8000/api/v1/ai/scan-product?check_duplicates=true&suggest_price=true" -H "Authorization: Bearer $token" -F "image=@test_product.jpg"
```

---

## 💰 Quanto Dá pra Usar?

### Preço do GPT-4o Vision
- **Input (texto):** $2.50 / 1M tokens (~$0.0025 / request)
- **Input (imagem):** $10.00 / 1M tokens (~$0.01 / imagem média)
- **Output:** $10.00 / 1M tokens (~$0.002 / resposta)

### Com $5 USD você consegue:
- **~250-500 análises de produtos** com imagem
- Suficiente para testar e validar o sistema
- Se precisar mais, pode adicionar cartão (pay-as-you-go)

---

## 🔒 Segurança da API Key

### ✅ FAÇA:
- Mantenha a chave no `.env` (já está no `.gitignore`)
- Nunca commite a chave no Git
- Use uma chave diferente para produção
- Rotacione chaves regularmente

### ❌ NÃO FAÇA:
- Não compartilhe a chave
- Não publique em repositórios públicos
- Não use no frontend (só backend)

---

## 🆚 OpenAI vs Anthropic

| Feature | OpenAI GPT-4o | Anthropic Claude |
|---------|---------------|------------------|
| **Free Tier** | ✅ $5 grátis (3 meses) | ❌ Sem free tier |
| **Análise de Imagem** | ✅ Excelente | ✅ Excelente |
| **Velocidade** | ⚡ Mais rápido | 🐢 Um pouco mais lento |
| **Preço** | 💰 Mais barato | 💰 Mais caro |
| **Para este projeto** | ✅ Perfeito | ✅ Perfeito |

---

## 🎯 Próximos Passos

1. ✅ Criar conta OpenAI
2. ✅ Gerar API key
3. ✅ Configurar no `.env`
4. ✅ Reiniciar backend (já reinicia sozinho)
5. ✅ Testar com `curl` ou pelo app mobile
6. 🎉 Pronto! AI Scanner funcionando!

---

## 🆘 Problemas Comuns

### "Invalid API key"
- Verifique se copiou a chave completa
- Formato correto: `sk-proj-...`
- Chave ativa no painel da OpenAI

### "Insufficient credits"
- Verifica saldo em: https://platform.openai.com/settings/organization/billing/overview
- Free trial pode ter expirado (3 meses)
- Adicione cartão para pay-as-you-go

### "Model not found"
- Verifique se `OPENAI_MODEL=gpt-4o` está correto
- GPT-4o com visão já vem por padrão

---

## 📚 Links Úteis

- **Dashboard:** https://platform.openai.com/
- **API Keys:** https://platform.openai.com/api-keys
- **Billing:** https://platform.openai.com/settings/organization/billing/overview
- **Docs:** https://platform.openai.com/docs/guides/vision
- **Pricing:** https://openai.com/api/pricing/

---

**Pronto! Agora você tem IA grátis para testar o scanner! 🎉**

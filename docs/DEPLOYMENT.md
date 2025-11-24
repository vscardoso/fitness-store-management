# Deploy de Produção (MVP)

Este guia cobre um caminho simples e gratuito para colocar o backend (FastAPI) no ar e gerar builds do app (Expo) para publicar nas lojas.

## Visão geral
- Backend: Render (Web Service grátis) + Postgres grátis (Neon) — alternativa: Railway/Koyeb
- Mobile: Expo EAS Build (cloud). Publicação nas lojas exige contas pagas (ver abaixo)

## Pré‑requisitos
- Repositório GitHub atualizado
- Cartões (para contas das lojas)
- Variáveis de ambiente (.env) disponíveis para produção

---

## 1) Banco de Dados gratuito (Neon)
1. Crie uma conta em https://neon.tech (free tier)
2. Crie um projeto Postgres → copie a string `DATABASE_URL` (formato: `postgresql+asyncpg://user:pass@host/db`)
3. Opcional: crie um banco separado para produção (`prod`)

Anote:
- DATABASE_URL (use driver async `+asyncpg`)

---

## 2) Backend no Render (gratuito)
O repositório já contém `backend/Dockerfile` e `render.yaml` na raiz, prontos para deploy.

Passo a passo:
1. Faça login no https://render.com e conecte seu GitHub
2. New → Blueprint → selecione este repositório (usa `render.yaml`)
3. Configure env vars solicitadas:
   - SECRET_KEY: deixe "Generate" (Render gera automaticamente)
   - DATABASE_URL: cole a URL do Neon (com `+asyncpg`)
   - CORS_ORIGINS: inclua domínios do app (ex.: `https://expo.dev,https://*.expo.dev,https://seu-dominio.com`)
   - ACCESS_TOKEN_EXPIRE_MINUTES: `60` (ou outro)
4. Deploy → aguarde o serviço ficar Healthy (healthcheck em `/health`)

Migrações (Alemic):
- Abra Shell no serviço do Render e rode:
  - `alembic upgrade head`
- Opcional: criar admin e seeds (se necessário) executando os scripts do diretório `backend/`:
  - `python create_user.py` ou `python create_admin_simple.py`
  - `python create_categories.py`

URLs:
- API base: `https://<seu-servico>.onrender.com/api/v1`

---

## 3) Configurar o app mobile para produção
No arquivo `mobile/constants/Config.ts`, ajuste a BASE_URL de produção:
- `API_CONFIG.BASE_URL` já usa `'https://api.sualoja.com/api/v1'` em produção; troque para o domínio real do Render.
- Em desenvolvimento, siga as opções comentadas (emulador, localhost, tunnel)

Opcional via .env:
- Você pode migrar para `EXPO_PUBLIC_API_URL` e ler via `process.env.EXPO_PUBLIC_API_URL`.

---

## 4) Builds com Expo EAS
Pré‑requisitos:
- `mobile/eas.json` já incluso com perfis `preview` e `production`
- Conta Expo (grátis) — `npx expo login`

Comandos principais (na pasta `mobile/`):
- Build de preview (Android APK para testers):
  - `npx expo run:android` (local) ou `npx eas build -p android --profile preview`
- Build de produção:
  - Android (AAB): `npx eas build -p android --profile production`
  - iOS (IPA): `npx eas build -p ios --profile production`
- Submissão (após build concluído):
  - Android: `npx eas submit -p android --latest`
  - iOS: `npx eas submit -p ios --latest`

Notas:
- EAS pode gerenciar certificados automaticamente ao conectar sua conta Apple
- Para iOS você não precisa de Mac para build — EAS usa a nuvem

---

## 5) Publicar nas lojas
- Apple App Store (iOS):
  - Requer Apple Developer Program (US$ 99/ano)
  - Fluxo: criar App em App Store Connect → usar TestFlight para testes internos → enviar para revisão
- Google Play (Android):
  - Requer conta Google Play Console (US$ 25, uma vez)
  - Fluxo: criar app → faixa de teste interno/fechado → promover para produção

Checklist de publicação:
- Atualizar `app.json` (nome, ícones, telas de splash, bundle ids):
  - iOS `ios.bundleIdentifier` e Android `android.package` já definidos
- Versões:
  - `expo.version` (semver) e versionCode (Android)/buildNumber (iOS) quando fizer novos envios
- Políticas e privacidade:
  - Links de política de privacidade e termos (ex.: GitHub Pages, seu domínio)

---

## 6) Segurança e Prod Readiness (MVP)
- SECRET_KEY forte e rotacionável
- `CORS_ORIGINS` restrito aos domínios do app
- Banco: prefira Postgres (Neon/Supabase) em vez de SQLite
- Logs: mantenha sem emojis (Windows/CP1252 quebra)
- Backups do DB (Neon oferece)

---

## 7) Pós‑deploy
- Configure no mobile `API_CONFIG.BASE_URL` para a URL do Render
- Abra o app → login → teste básico (produtos, clientes, inventário)
- Use Expo Updates (opcional) para entregar atualizações OTA

---

## Alternativas de hospedagem grátis
- Railway.app: web service + Postgres (limites por workspace)
- Koyeb.com: deploy com Docker, camada gratuita
- Fly.io: pode exigir cartão; configurações mais avançadas
- Deta.space: Python serverless (ajustes para FastAPI)

Se quiser, posso automatizar os pipelines (CI/CD) com GitHub Actions para deploy automático no Render e build EAS.

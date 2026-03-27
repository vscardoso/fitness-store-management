# CLAUDE.md — web (Landing Page)

Landing page do sistema fitness-store-management. **Next.js** com foco em conversão para download do app mobile.

## Stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **Animações:** Framer Motion
- **Icons:** Lucide React
- **Deploy:** Vercel (planejado)

## Estrutura de Pastas

```
web/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout (fonts, metadata)
│   ├── page.tsx           # Home / landing page
│   └── globals.css        # Global styles + Tailwind
├── components/
│   ├── sections/          # Seções da landing page
│   │   ├── Hero.tsx       # Hero com CTA principal
│   │   ├── Features.tsx   # Funcionalidades do app
│   │   ├── Screenshots.tsx # Screenshots do app mobile
│   │   ├── Testimonials.tsx
│   │   ├── Pricing.tsx    # Planos (se aplicável)
│   │   └── CTA.tsx        # Call-to-action final
│   └── ui/                # Componentes reutilizáveis
├── public/
│   ├── images/            # Screenshots do app, logos
│   └── fonts/             # Fontes locais (se necessário)
├── design-system/         # Gerado pelo ui-ux-pro-max skill
│   ├── MASTER.md          # Regras globais de design
│   └── pages/             # Overrides por página
├── _opensquad/            # OpenSquad para planejamento
│   ├── squads/            # Squads criados
│   └── core/              # Engine do OpenSquad
├── .claude/
│   └── skills/
│       └── ui-ux-pro-max/ # Skill de UI/UX
└── package.json
```

## Ferramentas Disponíveis

### 1. UI UX Pro Max Skill (`.claude/skills/ui-ux-pro-max/`)

Skill de inteligência de design. Ativa automaticamente ao pedir qualquer coisa de UI/UX.

**Para gerar o design system do projeto:**
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "fitness store ecommerce landing" --design-system --persist -p "FitnessStore"
```

**Para instalar os scripts Python completos:**
```bash
npm install -g uipro-cli
uipro init --ai claude
```

### 2. OpenSquad (`_opensquad/`)

Framework de agentes para planejamento e criação de conteúdo.

```bash
/opensquad create    # Criar novo squad (ex: squad para copywriting da landing)
/opensquad run nome  # Executar squad
/opensquad list      # Listar squads
```

**Squads sugeridos para a landing page:**
- `landing-copywriter` — Pesquisa + escreve hero, features, CTA com base em referências
- `landing-ui-planner` — Planeja estrutura visual, paleta, tipografia com base no app mobile

## Objetivo da Landing Page

Converter visitantes em usuários do app mobile fitness-store-management.

**Público-alvo:** Lojistas de fitness/suplementos que precisam de um sistema de gestão.

**CTA Principal:** Download / acesso ao app

**Seções planejadas:**
1. Hero — Proposta de valor + screenshot do app + CTA
2. Problema → Solução — Dor do lojista → como o app resolve
3. Funcionalidades — PDV, estoque, relatórios, remessas
4. Screenshots — Galeria do app em uso
5. Depoimentos (quando disponível)
6. CTA Final — Cadastro / contato

## Padrões de UI

Seguir os padrões do skill ui-ux-pro-max. Regras principais:
- Mobile-first (375px baseline)
- Sem emojis como ícones (usar Lucide React)
- Contraste mínimo 4.5:1
- Animações 150–300ms
- Tokens semânticos (nunca hex hardcoded nos componentes)

# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2025-10-29

### ✨ Adicionado
- Sistema completo de gestão de produtos (CRUD)
- Controle de estoque com movimentações (entrada/saída)
- Dashboard com métricas financeiras e estatísticas
- Gestão de categorias de produtos
- Gestão de clientes
- Sistema de vendas (PDV)
- Autenticação JWT com refresh tokens
- Pull-to-refresh em todas as telas
- Tela de edição de produtos com validação
- Soft delete para produtos
- Alertas de estoque baixo
- Cálculo automático de margem de lucro
- Exportação de relatórios

### 🎨 Interface
- Dashboard moderno com cards gradientes
- Headers com gradiente nas telas de detalhes e edição
- Badges de status (Disponível, Estoque Baixo, Sem Estoque)
- Design Material Design 3 com React Native Paper
- Navegação por tabs intuitiva
- Ícones do Ionicons
- Tema consistente em todo o aplicativo

### 🔧 Técnico
- Backend: FastAPI + SQLAlchemy 2.0 (async)
- Mobile: React Native + Expo SDK 54
- State Management: React Query v5
- Database: SQLite (desenvolvimento)
- Repository Pattern no backend
- TypeScript no mobile
- Validação com Pydantic
- Testes unitários e de integração
- Docker Compose para desenvolvimento
- Localtunnel para testes em dispositivos físicos

### 🐛 Correções
- Corrigido filtro de produtos inativos em todas as queries
- Corrigido calls do método `update()` com parâmetros nomeados
- Corrigido cálculo de estoque e lucros potenciais
- Corrigido layout do header do dashboard (fixo no topo)
- Corrigido fechamento de modals e navegação

### 📚 Documentação
- Documentação técnica completa
- Relatórios de implementação
- Guias de setup e arquitetura
- Documentação da API

## [Unreleased]

### 🚧 Em Desenvolvimento
- Sistema completo de vendas (checkout)
- Relatórios avançados com gráficos
- Sincronização offline
- Impressão de cupom fiscal
- Backup automático
- Multi-warehouse (múltiplos estoques)
- Integração com pagamentos online
- Notificações push
- Exportação de dados (PDF, Excel)

### 💡 Planejado
- Versão web administrativa
- App para iOS
- API para integrações externas
- Sistema de fidelidade
- Gestão de fornecedores
- Controle de compras
- Fluxo de caixa
- Inteligência artificial para previsão de demanda

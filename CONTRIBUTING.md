# Guia de Contribuição

Obrigado por considerar contribuir com o Fitness Store Management! Este documento fornece diretrizes para contribuir com o projeto.

## 📋 Código de Conduta

Este projeto e todos os participantes são regidos pelo código de conduta. Ao participar, você concorda em manter este código.

## 🤝 Como Contribuir

### Reportando Bugs

Antes de criar um issue, verifique se o bug já não foi reportado. Ao criar um issue, inclua:

- **Descrição clara** do problema
- **Passos para reproduzir** o comportamento
- **Comportamento esperado** vs **comportamento atual**
- **Screenshots** (se aplicável)
- **Ambiente**: SO, versão do Node.js, Python, etc.

### Sugerindo Melhorias

Issues para melhorias são bem-vindos! Inclua:

- **Descrição detalhada** da melhoria
- **Casos de uso** que justifiquem a mudança
- **Alternativas consideradas**

### Pull Requests

1. **Fork** o repositório
2. **Clone** seu fork: `git clone https://github.com/seu-usuario/fitness-store-management.git`
3. **Crie uma branch**: `git checkout -b feature/nova-funcionalidade`
4. **Faça suas alterações** seguindo os padrões do projeto
5. **Teste suas alterações**
6. **Commit** suas mudanças seguindo o padrão de commits
7. **Push** para sua branch: `git push origin feature/nova-funcionalidade`
8. **Abra um Pull Request**

## 📝 Padrão de Commits

Seguimos o [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>[escopo opcional]: <descrição>

[corpo opcional]

[rodapé opcional]
```

### Tipos de Commit

- **feat**: Nova funcionalidade
- **fix**: Correção de bug
- **docs**: Mudanças na documentação
- **style**: Formatação, ponto e vírgula, etc (sem mudança de código)
- **refactor**: Refatoração de código
- **test**: Adição ou correção de testes
- **chore**: Tarefas de build, configurações, etc

### Exemplos

```bash
feat(mobile): adicionar tela de relatórios
fix(backend): corrigir validação de estoque negativo
docs: atualizar README com instruções de deploy
style(mobile): formatar código com prettier
refactor(backend): simplificar lógica de vendas
test(backend): adicionar testes para ProductService
chore: atualizar dependências
```

## 🏗️ Estrutura do Projeto

```
fitness-store-management/
├── backend/          # API FastAPI
├── mobile/           # App React Native
├── docs/             # Documentação
├── scripts/          # Scripts utilitários
└── .github/          # CI/CD workflows
```

## 💻 Configuração de Desenvolvimento

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
.\venv\Scripts\Activate.ps1  # Windows
pip install -r requirements.txt
python recreate_db.py
python create_user.py
python -m uvicorn app.main:app --reload
```

### Mobile

```bash
cd mobile
npm install
cp .env.example .env
# Edite o .env com seu IP
npx expo start
```

## ✅ Checklist antes de enviar PR

- [ ] O código segue os padrões do projeto
- [ ] Os testes passam (`pytest` no backend, `npm test` no mobile)
- [ ] A documentação foi atualizada (se necessário)
- [ ] O commit segue o padrão Conventional Commits
- [ ] Não há conflitos com a branch principal
- [ ] O código foi testado localmente

## 🧪 Testes

### Backend
```bash
cd backend
pytest
pytest --cov=app tests/
```

### Mobile
```bash
cd mobile
npm test
npm run lint
```

## 📖 Guias de Estilo

### Python (Backend)

- Seguir [PEP 8](https://pep8.org/)
- Usar `black` para formatação
- Usar `flake8` para linting
- Docstrings em funções públicas
- Type hints onde apropriado

```python
from typing import Optional, List
from pydantic import BaseModel

async def get_products(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None
) -> List[Product]:
    """
    Busca produtos com paginação.
    
    Args:
        skip: Número de registros a pular
        limit: Número máximo de registros
        search: Termo de busca opcional
        
    Returns:
        Lista de produtos
    """
    # Implementação
    pass
```

### TypeScript (Mobile)

- Usar TypeScript em vez de JavaScript
- Seguir [Airbnb Style Guide](https://github.com/airbnb/javascript)
- Usar ESLint e Prettier
- Componentes funcionais com hooks
- Props tipadas com interfaces

```typescript
interface ProductCardProps {
  product: Product;
  onPress: (id: number) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ 
  product, 
  onPress 
}) => {
  return (
    <Card onPress={() => onPress(product.id)}>
      <Card.Title>{product.name}</Card.Title>
      <Card.Content>
        <Text>{formatCurrency(product.sale_price)}</Text>
      </Card.Content>
    </Card>
  );
};
```

## 📚 Recursos

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Documentation](https://docs.expo.dev/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [React Query Documentation](https://tanstack.com/query/latest)

## 🐛 Debugging

### Backend

```python
# Adicionar logs
import logging
logger = logging.getLogger(__name__)

logger.info("Processando produto %s", product_id)
logger.error("Erro ao salvar: %s", str(e))
```

### Mobile

```typescript
// Console logs
console.log('Product:', product);
console.error('API Error:', error);

// React Native Debugger
import Reactotron from 'reactotron-react-native';
Reactotron.log('Debug info');
```

## 📞 Contato

- Issues: [GitHub Issues](https://github.com/seu-usuario/fitness-store-management/issues)
- Email: seu-email@exemplo.com
- Discord: [Link do servidor]

## 📄 Licença

Ao contribuir, você concorda que suas contribuições serão licenciadas sob a Licença MIT.

---

**Obrigado por contribuir! 🚀**

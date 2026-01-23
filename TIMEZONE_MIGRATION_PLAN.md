# 🚨 PLANO DE MIGRAÇÃO DE TIMEZONE - ANÁLISE DE RISCO

## ⚠️ PERIGOS IDENTIFICADOS

### 1. Dados Históricos em UTC
**Problema:** Banco já tem registros com timestamps em UTC
- `created_at`, `updated_at` de TODOS os modelos
- Datas de vendas, entradas de estoque, movimentações
- Deadlines de envios condicionais
- Histórico de notificações

**Impacto:** Se mudarmos para BRT agora:
```python
# Registro antigo (UTC): 2025-01-23 03:00:00
# Sistema novo (BRT): lê como 2025-01-23 03:00:00 BRT
# Diferença: 3 horas de erro retroativo! ❌
```

### 2. Queries de Período Quebradas
**Problema:** Dashboard e relatórios filtram por data
```python
# Código atual
start = date.today()  # UTC 00:00
# Em SP às 21h, ainda é dia anterior em UTC

# Query pega vendas do "dia", mas:
# - Vendas de 21h-00h não aparecem (dia seguinte em UTC)
# - Vendas de 00h-03h aparecem erradas (dia anterior em UTC)
```

### 3. Comparações de Data/Hora
**Problema:** Código compara datetimes misturados
```python
# shipment.deadline: salvo em UTC
# datetime.utcnow(): UTC
# now_brazil(): BRT com tzinfo

if shipment.deadline > datetime.utcnow():  # ✅ Funciona
if shipment.deadline > now_brazil():       # ❌ Comparação inválida (naive vs aware)
```

### 4. Serialização JSON/API
**Problema:** Frontend espera formato específico
```python
# Atual: "2025-01-23T03:00:00" (naive, interpretado como UTC pelo JS)
# Novo: "2025-01-23T00:00:00-03:00" (aware, timezone explícito)
# Frontend pode quebrar formatações!
```

---

## 🎯 ESTRATÉGIA SEGURA

### Opção 1: Correção Pontual (RECOMENDADO) ⭐
**O que fazer:** Corrigir apenas onde o bug aparece (dashboard, relatórios)

```python
# Em vez de mudar tudo, ajustar queries específicas
def get_period_dates(period: PeriodFilter) -> tuple[date, date]:
    # Usar timezone local apenas para cálculo de "hoje"
    from datetime import datetime
    from zoneinfo import ZoneInfo
    
    # Pegar "hoje" em horário brasileiro
    today_br = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    
    # Mas continuar salvando em UTC (compatibilidade)
    ...
```

**Vantagens:**
- ✅ Não quebra dados históricos
- ✅ Não precisa migração
- ✅ Compatível com código existente
- ✅ Fácil de reverter

**Desvantagens:**
- ⚠️ Timezone permanece inconsistente no código

---

### Opção 2: Migração Completa (ARRISCADO)
**O que fazer:** Converter todo sistema para BRT

**Passos necessários:**
1. **Backup completo do banco** 🔴
2. **Script de conversão:**
   ```sql
   -- Converter TODOS os timestamps UTC -> BRT
   UPDATE sales SET created_at = created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo';
   UPDATE products SET created_at = created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo';
   -- ... repetir para TODAS as tabelas
   ```
3. **Atualizar SQLAlchemy models:**
   ```python
   # Em base.py
   created_at: Mapped[datetime] = mapped_column(
       DateTime(timezone=False),  # Mudar para sem timezone
       server_default=func.now(),  # PostgreSQL: now() em timezone local
   )
   ```
4. **Configurar PostgreSQL timezone:**
   ```sql
   ALTER DATABASE fitness_store SET timezone TO 'America/Sao_Paulo';
   ```
5. **Testar TUDO:**
   - Dashboard (períodos)
   - Vendas (relatórios)
   - Entradas (histórico)
   - Envios (deadlines)
   - Notificações (agendamentos)

**Vantagens:**
- ✅ Sistema 100% consistente
- ✅ Timestamps corretos

**Desvantagens:**
- 🔴 RISCO ALTÍSSIMO de quebrar dados
- 🔴 Precisa downtime
- 🔴 Difícil de reverter
- 🔴 Pode quebrar integrações externas

---

## 📋 DECISÃO: O QUE FAZER AGORA?

### Passo 1: Identificar o Problema Real
**Onde o bug aparece exatamente?**
- [ ] Dashboard (métricas do dia)?
- [ ] Relatório de vendas (filtra dia errado)?
- [ ] Envios (deadline calculado errado)?
- [ ] Outro: _______________

### Passo 2: Escolher Estratégia

#### Se bug é APENAS em filtros de data (dashboard/relatórios):
→ **Opção 1: Correção Pontual**
- Ajustar apenas `get_period_dates()` 
- Ajustar queries de "hoje" em sales/entries
- **NÃO mexer em timestamps do banco**

#### Se bug afeta lógica de negócio crítica (deadlines, notificações):
→ **Opção 2: Migração Completa**
- Fazer em ambiente de teste primeiro
- Documentar todos os riscos
- Ter plano de rollback

---

## 🔍 PRÓXIMOS PASSOS

1. **PARAR:** Não aplicar mudanças ainda
2. **DIAGNOSTICAR:** Onde exatamente o sistema "vira" antes das 00h?
   - Testar: criar venda às 23h → aparece em qual dia no dashboard?
   - Testar: criar entrada às 22h → data está correta?
3. **DECIDIR:** Correção pontual ou migração completa?
4. **TESTAR:** Ambiente isolado (banco de teste)
5. **VALIDAR:** Conferir dados históricos não foram afetados
6. **APLICAR:** Prod apenas após testes completos

---

## ⚠️ CHECKLIST DE SEGURANÇA

Antes de aplicar QUALQUER mudança de timezone:

### Backup
- [ ] Backup completo do banco de produção
- [ ] Export de dados críticos (vendas, estoque)
- [ ] Backup do código atual (git commit)

### Testes
- [ ] Testar em banco SQLite local
- [ ] Testar criação de registros novos
- [ ] Testar leitura de registros antigos
- [ ] Testar queries de período (hoje, mês, ano)
- [ ] Testar comparações de data/hora
- [ ] Testar serialização JSON (API)

### Validação
- [ ] Dashboard mostra métricas corretas?
- [ ] Relatórios filtram período correto?
- [ ] Histórico não foi alterado?
- [ ] Deadlines calculam certo?
- [ ] Frontend continua funcionando?

### Rollback
- [ ] Script de reversão pronto
- [ ] Procedimento documentado
- [ ] Tempo estimado para reverter

---

## 🎯 RECOMENDAÇÃO FINAL

**NÃO APLICAR MUDANÇA GLOBAL AGORA.**

Primeiro, me diga:
1. **Onde você percebeu que vira antes das 00h?** (dashboard, vendas, onde?)
2. **Tem dados em produção?** (clientes reais usando?)
3. **Pode testar em ambiente local primeiro?**

Vou criar uma solução **conservadora e segura** baseado nas respostas.

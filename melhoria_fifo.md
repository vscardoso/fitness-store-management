4. Pontos de Melhoria Identificados

  🔴 Críticos (impactam operação diária)

  1. ✅ OK — Campo status explícito na entrada
  O estado atual é inferido por 3 campos distintos. Operacionalmente confuso.
  Adicionar: enum EntryStatus { OPEN, PARTIAL, SOLD_OUT, ARCHIVED }
  Permite filtros na tela de entradas ("Mostrar apenas abertas"), alertas de lote esgotando, e relatórios por estado.

  2. ✅ OK (parcial) — Entrada reutilizável com janela de tempo
  Hoje a entrada trava no primeiro item vendido. O modelo real de varejo é: o lojista compra 50 pares de tênis numa viagem, vai vendendo ao longo de semanas, e às vezes
  encontra mais 5 pares do mesmo fornecedor.

  Melhoria: permitir adicionar itens a entradas "parcialmente vendidas" desde que o produto não tenha vendas (apenas o produto específico trava, não a entrada toda).
  → Implementado: correção auditada por item; adição de itens ainda requer entrada aberta (sem vendas).

  3. ✅ OK — Correção de entrada com auditoria (item específico em vez de bloquear tudo)
  (Implementado como: correção auditada de item — o produto específico pode ser corrigido mesmo após vendas)

  4. Alerta de estoque mínimo vinculado à entrada
  Quando quantity_remaining < min_stock, o FITO deveria sugerir "Criar nova entrada de reposição" com o fornecedor pré-preenchido da última entrada daquele produto.

  4. Produto órfão após abandono do wizard (is_catalog=true sem entrada)

  O wizard de cadastro salva o produto no backend logo no passo 1 (name, category, variants). Se o usuário sair ou fechar o app antes de concluir o passo 3
  (criação da StockEntry), o produto existe no banco com is_catalog=true mas sem nenhum EntryItem vinculado.

  Isso não é falha técnica — o rollback só protege contra erros de servidor. O abandono intencional (fechar o app, navegar para trás, perder conexão) cria um
  produto "fantasma": aparece na lista, mas sem estoque, sem custo, sem entrada rastreável. O lojista não sabe se deve continuar de onde parou ou recadastrar.

  Cenário concreto:
    Passo 1 ✅ → Product criado (id: 42, is_catalog=true)
    Passo 2 ✅ → ProductVariants criados (P/M/G)
    Passo 3 ❌ → usuário fecha o app → StockEntry nunca criada
    Resultado: produto id:42 existe, Inventory.quantity = 0, sem histórico de custo

  Impacto:
  - FIFO não tem origem para calcular custo real → venda registra custo R$0
  - Produto aparece no catálogo com estoque zero, causando confusão na venda
  - Lojista pode criar entrada duplicada (produto cadastrado duas vezes)

  Solução proposta — três camadas complementares:
  1. Badge "Incompleto" na listagem de produtos (is_catalog=true + sem EntryItem)
  2. Ao abrir produto incompleto → oferecer "Continuar cadastro" ou "Excluir rascunho"
  3. Banner na aba Estoque: "Você tem X produtos sem entrada — clique para completar"

  Alternativa mais radical: salvar produto apenas no final (commit único como na PARTE 1).
  Requer reestruturar o wizard para guardar os passos 1-2 localmente (AsyncStorage) e
  só enviar ao backend quando a entrada for confirmada. Elimina o problema na raiz.

  ---
  🟡 Importantes (diferenciam do mercado)

  5. NF-e / XML de nota fiscal
  Todo ERPzinho BR tem. O usuário importa o XML da nota de compra e o FITO popula automaticamente: fornecedor, CNPJ, produtos, quantidades, custos.
  - Elimina digitação manual de entrada
  - Integra com a fiscalização brasileira
  - Diferencial enorme para compras de distribuidores

  6. ROI por entrada (viagem/lote) - Aqui precisa incluir na conta o custo da viagem
  O dado está lá (FIFO com custo por origem), mas não tem relatório visual. Implementar:
  Entrada ENTRY-2025-007 (Viagem São Paulo - 15/03)
  ├── Investimento: R$ 4.200,00
  ├── Vendido até hoje: R$ 6.100,00 (43 de 60 itens)
  ├── Estoque restante: R$ 1.980,00
  ├── ROI realizado: 45.2%
  └── ROI projetado (se vender tudo): 68.4%
  Nenhum app simples do mercado entrega isso. É o killer feature para quem compra em viagem.

  7. Agrupamento por fornecedor
  Hoje as entradas são isoladas. Lojistas que compram do mesmo fornecedor repetidamente precisam ver:
  - Histórico de preços por produto/fornecedor
  - "Último custo pago" ao criar nova entrada
  - Ranking de fornecedores por margem

  8. Devolução parcial a fornecedor
  Produto com defeito vai de volta ao fornecedor. Hoje não existe esse fluxo. Precisaria:
  - EntryType.RETURN_TO_SUPPLIER
  - Deduzir do quantity_remaining do EntryItem original
  - Gerar crédito ou nota de débito

  9. Compartilhamento de entrada entre dispositivos
  Compra em viagem com 2 funcionários: cada um registra parte dos produtos no celular. Hoje é sequencial. Sugestão: entrada "colaborativa" onde múltiplos usuários
  adicionam itens simultaneamente antes do primeiro commit.

  10. Etiquetas com QR Code vinculadas à entrada
  O FITO já tem geração de etiqueta. O próximo passo: QR Code da etiqueta contém entry_id + product_id, permitindo rastrear a origem de qualquer peça física no estoque
  com uma leitura — útil para conferência de inventário.

  ---
  🟢 Diferenciadores futuros (posicionamento premium)

  11. Precificação automática por margem alvo
  Ao cadastrar uma entrada, o usuário informa margem desejada (ex: 60%). O FITO sugere o preço de venda automaticamente: sale_price = unit_cost / (1 - 0.60).

  12. Análise de giro de estoque por entrada
  Qual lote vende mais rápido? Qual fica parado? Integrar dias em estoque com a data da entrada:
  EntryItem criado em: 01/01
  Todos vendidos em:   15/02
  Giro médio: 45 dias

  13. Push notification de esgotamento
  Quando quantity_remaining zera em um EntryItem, notificar o lojista: "Lote X de Whey Protein esgotado — deseja criar reposição?"

  ---
  5. Resumo Executivo

  FITO hoje:                          Gap crítico:
  ✅ FIFO robusto                     ❌ Sem status explícito de entrada
  ✅ Rastreabilidade perpétua         ❌ Sem NF-e / XML
  ✅ Atomicidade total (rollback)     ❌ Sem ROI visual por viagem
  ✅ Reaproveitamento de entrada*     ❌ Sem alerta de reposição inteligente
  ✅ Scanner IA                       ❌ Sem colaboração multi-usuário
  ✅ Variantes com grade              ❌ Sem devolução a fornecedor

  * apenas antes de qualquer venda no lote

  O maior diferencial que o FITO pode explorar frente ao Bling/Tiny/Omie: mobile-first com FIFO real. Nenhum concorrente simples tem rastreabilidade de custo por origem
  de forma acessível. Isso deveria ser o principal argumento de marketing.

✻ Churned for 1m 20s · 1 local agent still running
                                                                                          
● Agent "Pesquisar apps concorrentes no mercado" completed                                                                                                               
                                                                                                                                                                         
● A pesquisa de mercado chegou. Vou compilar tudo em um relatório executivo completo.                                                                                    
                                                                                                                                                                         
  ---                                                                                                                                                                    
  Relatório Técnico + Estratégico: FITO — Entradas & Mercado                                                                                                             
                                                                                                                                                                         
  Como Engenheiro de Software Sênior especializado no sistema                                                                                                            
                                                         
  ---                                    
  PARTE 1 — Comportamento das Entradas

  Se der erro, tudo é perdido?

  Não. O sistema usa transação única com rollback automático.

  Wizard → Cadastrar produto + entrada:

  1. Criar Product             ─┐
  2. Criar ProductVariant       │
  3. Criar StockEntry           ├── Um único db.commit()
  4. Criar EntryItem            │   Se qualquer passo falha:
  5. Rebuild Inventory (FIFO)  ─┘   db.rollback() → banco limpo

  Nenhum dado parcial sobrevive a uma falha. O banco permanece consistente.

  ---
  Ciclo de vida de uma entrada

  Não existe campo status. O estado é inferido por comportamento:

  ┌──────────┬────────────────────────────────────┬───────────────────────┬───────────────┐
  │  Estado  │              Condição              │ Pode adicionar itens? │ Pode deletar? │
  ├──────────┼────────────────────────────────────┼───────────────────────┼───────────────┤
  │ Aberta   │ is_active=True + sem vendas        │ ✅ Sim                │ ✅ Sim        │
  ├──────────┼────────────────────────────────────┼───────────────────────┼───────────────┤
  │ Parcial  │ has_sales=True + qty_remaining > 0 │ ❌ Não                │ ❌ Não        │
  ├──────────┼────────────────────────────────────┼───────────────────────┼───────────────┤
  │ Esgotada │ qty_remaining = 0 + has_sales=True │ ❌ Não                │ ❌ Não        │
  ├──────────┼────────────────────────────────────┼───────────────────────┼───────────────┤
  │ Deletada │ is_active=False                    │ ❌ Não                │ —             │
  └──────────┴────────────────────────────────────┴───────────────────────┴───────────────┘

  Entradas nunca "fecham" automaticamente. Elas existem para sempre como histórico imutável de rastreabilidade — o FIFO depende disso para calcular o custo real de cada
  venda.

  ---
  São reaproveitadas ou únicas?

  Reaproveitadas — mas apenas antes da primeira venda. Existe addItemToEntry() que permite adicionar mais produtos a uma entrada existente:

  ENTRY-2025-007 "Viagem SP"
  ├── Whey Protein 1kg (10 un × R$45)   ← criado na entrada
  └── Creatina 300g (5 un × R$30)       ← adicionado depois, mesma entrada

  Assim que qualquer item é vendido, a entrada trava completamente. Não é possível adicionar novos itens nem editar quantidades. Faz sentido: um lote distribuído no
  mercado não pode mudar retroativamente.

  ---
  O que acontece quando todos os produtos são vendidos?

  quantity_remaining = 0 em todos os EntryItem. A entrada vira esgotada mas permanente — ela é o registro definitivo de "comprei X do fornecedor Y na data Z por tal
  preço". O sistema usa esse histórico para:

  - Calcular ROI por viagem
  - Rastrear custo FIFO de cada venda
  - Identificar qual fornecedor tem melhor margem
  - Auditar qualquer divergência de inventário

  ---
  Como o FIFO consome os itens

  Entrada Jan/15  [■■■■■░░░░░]  5 vendidos, 5 restantes
  Entrada Jan/20  [░░░░░░░░░░]  10 disponíveis

  VENDA de 8 unidades:
  → Consome 5 de Jan/15 (mais antigo) → remaining = 0
  → Consome 3 de Jan/20              → remaining = 7

  SaleItem registra:
    sale_sources: [
      { entry_id: 1, qty_taken: 5, unit_cost: R$45 },
      { entry_id: 2, qty_taken: 3, unit_cost: R$50 }
    ]
    unit_cost: R$46,87  ← custo médio ponderado real

  ---
  PARTE 2 — Análise de Mercado

  Panorama dos concorrentes

  ┌───────────────┬───────────────────┬──────────┬────────────────┬──────────────┬────────────┬─────────────┐
  │      App      │        DNA        │ NF-e XML │   FIFO real    │ Mobile-first │ Grade moda │ IA cadastro │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ Bling         │ ERP e-commerce    │ ✅       │ ❌ Custo médio │ Parcial      │ ✅         │ ❌          │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ Tiny/Olist    │ ERP multicanal    │ ✅       │ ❌ Custo médio │ Parcial      │ ✅         │ Parcial     │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ Omie          │ ERP financeiro    │ ✅       │ ✅ PEPS        │ ❌           │ Parcial    │ ❌          │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ InfinitePay   │ Fintech PDV       │ ❌       │ ❌             │ ✅           │ ❌         │ ✅ foto     │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ Linx Microvix │ Enterprise varejo │ ✅       │ Não doc.       │ PDV móvel    │ ✅ melhor  │ ❌          │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ GestãoClick   │ PME varejo        │ ✅       │ ❌             │ ❌           │ ✅         │ ❌          │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ Kyte          │ Micro negócio     │ ❌       │ ❌             │ ✅           │ Sim        │ ✅ melhor   │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ Nuvemshop     │ E-commerce        │ ❌       │ ❌             │ Parcial      │ ✅         │ ❌          │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ Stone/Ton     │ Fintech           │ ❌       │ ❌             │ Sim          │ ❌         │ ❌          │
  ├───────────────┼───────────────────┼──────────┼────────────────┼──────────────┼────────────┼─────────────┤
  │ FITO atual    │ Varejo fitness    │ ❌       │ ✅ FIFO real   │ ✅           │ ✅         │ ✅          │
  └───────────────┴───────────────────┴──────────┴────────────────┴──────────────┴────────────┴─────────────┘

  Conclusão imediata: O FITO já tem FIFO real + mobile-first + IA + grade. Nenhum concorrente tem essa combinação. O gap está em NF-e e algumas features de UX.

  ---
  PARTE 3 — 10 Pontos de Melhoria Priorizados

  🔴 Urgentes (barreiras de adoção)

  ---
  #1 — Importação de XML de NF-e do fornecedor

  Todos os ERPs sérios oferecem. Lojistas que compram de distribuidores com nota não aceitam digitar manualmente.

  Fluxo proposto:
    Fornecedor emite NF-e → lojista importa XML →
    FITO lê: produtos, quantidades, custo unitário, CNPJ fornecedor →
    Pré-popula EntryItems (produtos novos entram em fila de revisão) →
    Lojista confirma e cria a entrada em 30 segundos

  Impacto: Remove a maior barreira de adoção para quem compra formalmente.

  ---
  ✅ OK — #2 — Status explícito na entrada (OPEN → PARTIAL → SOLD_OUT)

  O estado atual é inferido por 3 campos diferentes — operacionalmente confuso para quem gerencia múltiplas entradas.

  # Adicionar ao modelo
  class EntryStatus(str, enum.Enum):
      OPEN      = "open"      # sem vendas, editável
      PARTIAL   = "partial"   # tem vendas, qty_remaining > 0
      SOLD_OUT  = "sold_out"  # qty_remaining = 0, fechado
      ARCHIVED  = "archived"  # encerrado manualmente

  Permite filtros na tela ("Mostrar apenas abertas"), alertas de lote esgotando, e relatórios por estado. Diferencia o que o lojista pode e não pode fazer em cada
  entrada.

  ---
  ✅ OK — #3 — Correção de entrada com auditoria (vs. bloqueio total)

  Erros acontecem: o lojista recebeu 10 mas a nota diz 12. Hoje a entrada trava após a primeira venda — o lojista fica sem opção. Tiny exige extensão instalada. Omie
  exige estorno formal burocrático. O FITO pode ser mais elegante:

  Fluxo proposto:
    "Corrigir entrada" →
    Cria entrada corretiva (ENTRY-2025-007-COR) com diff +2 ou -2 →
    Auditoria preserva: "Corrigido em DD/MM por [usuário]: motivo X" →
    FIFO recalculado automaticamente

  Impacto: UX muito superior — não bloqueia nem apaga histórico.

  ---
  🟡 Importantes (diferenciadores de mercado)

  ---
  #4 — FEFO para suplementos (First Expired, First Out)

  O FITO tem FIFO, mas suplementos precisam de FEFO — vender o que vence primeiro. Nenhum app mobile-first implementa isso com boa UX. O Omie suporta via lote, o Bling
  via lote também, mas nos celulares é péssimo.

  Campo novo em EntryItem: expiry_date (nullable)
  Categorias "Suplementos" exigem preenchimento obrigatório
  FIFO vira FEFO: ordena por expiry_date, não entry_date
  Dashboard: "3 produtos vencem em 30 dias"
  Venda sugere o lote mais próximo do vencimento

  Impacto: Diferencial absoluto no nicho fitness — nenhum concorrente mobile entrega isso.

  ---
  ✅ OK — #5 — ROI por viagem/entrada (análise de lucratividade)

  A estrutura já existe (StockEntry + FIFO + sale_sources). Falta a tela de análise:

  ENTRY-2025-007 "Viagem São Paulo — 15/Mar"
  ├── Investimento total:      R$ 4.200,00
  ├── Receita gerada até hoje: R$ 6.100,00
  ├── Estoque restante:        R$ 1.980,00 (estimado a custo)
  ├── ROI realizado:           45,2%
  ├── ROI projetado (100%):    68,4%
  ├── Giro médio:              23 dias
  └── Melhor produto:          Whey Protein (margem 72%)

  Nenhum concorrente de PME entrega isso com essa granularidade. É o killer feature para quem compra em viagem.

  ---
  #6 — Grade inteligente com matriz visual

  Para moda fitness (legging em P/M/G/GG × 5 cores = 20 SKUs), os ERPs atuais são um pesadelo. Linx é o melhor em grade mas é enterprise. Bling/Tiny têm grade mas o
  fluxo é verboso.

  Proposta no WizardStep2:
    ┌────────┬───┬───┬───┬────┐
    │        │ P │ M │ G │ GG │
    ├────────┼───┼───┼───┼────┤
    │ Preta  │ ✓ │ ✓ │ ✓ │ ✓  │
    │ Rosa   │ ✓ │ ✓ │ ✓ │    │  ← toque para incluir/excluir
    │ Branca │   │ ✓ │ ✓ │    │
    └────────┴───┴───┴───┴────┘
    → FITO gera os 9 SKUs automaticamente

  Cadastro de grade de 20 SKUs em ~45 segundos vs. ~10 minutos no Bling.

  ---
  #7 — Alerta de ruptura por variante (não por produto)

  ERPs alertam quando o estoque total cai abaixo do mínimo. Para moda, o problema é: o tamanho M acabou, mas P e G ainda têm — o alerta não dispara. Você perde vendas
  silenciosamente.

  Estoque mínimo configurável por variante:
    Legging Preta G → min: 2 → alerta push quando < 2

  Dashboard "Grade incompleta":
    Legging Preta [P:3 | M:0⚠️  | G:5 | GG:2]
    → Botão "Repor tamanho M" abre entrada direta

  ---
  #8 — Catálogo digital com link de compartilhamento

  Kyte oferece catálogo para WhatsApp/Instagram. InfinitePay tem loja online. Para o revendedor fitness que vende no WhatsApp (perfil comum no nicho), isso é essencial.

  /catalog/:store_slug
  → Produtos ativos com foto, preço, disponibilidade por cor/tamanho
  → Cliente escolhe e manda pedido → vira venda no FITO automaticamente
  → Lojista compartilha no status do WhatsApp

  Sem custo de plataforma adicional, sem integração de marketplace.

  ---
  #9 — Modo Rápido de Recebimento (scan em série)

  O fluxo atual em qualquer ERP para receber 50 produtos: abrir sistema → criar entrada → selecionar fornecedor → adicionar produto por produto. Lento.

  Botão "Receber Mercadoria" na tela principal
  → Câmera abre direto para scanner de código de barras
  → Cada scan adiciona 1 unidade ao lote temporário
  → Scan duplo = editar quantidade
  → Finalizar: preenche fornecedor, data, custo médio
  → Entrada criada com 1 tela vs. 5 telas nos ERPs

  Recebimento de 50 produtos: de ~20 minutos para ~3 minutos.

  ---
  #10 — Dashboard vertical para fitness (não relatórios genéricos)

  O mercado fitness tem sazonalidade clara (janeiro = pico), produtos complementares e métricas específicas. Nenhum ERP generalista fala essa linguagem.

  Relatórios pré-configurados para fitness:
  ├── "Pico de Janeiro": comparação Jan vs. Dez, produtos que explodiram
  ├── "Vendidos juntos": quem compra legging, compra o que mais?
  ├── "Ruptura por tamanho": qual tamanho mais falta por categoria
  ├── "Giro de suplemento": dias em estoque vs. validade
  └── "Fornecedor do mês": ranking por margem entregue

  ---
  PARTE 4 — Posicionamento Estratégico

  O FITO deve ser:
  "O Kyte com inteligência de estoque profissional
   para quem vende fitness e moda esportiva"

  Simples o suficiente para o dono de loja usar no celular.
  Robusto o suficiente para nenhum centavo de custo ser perdido.

  Onde o FITO já lidera:
  - FIFO real (nenhum concorrente mobile-first tem)
  - Rastreabilidade de origem (trip/local/online)
  - Wizard de cadastro guiado
  - Scanner com IA

  Próximos 3 movimentos de maior impacto:
  1. NF-e XML → remove barreira de adoção para lojistas formais
  2. FEFO + Validade → diferencial absoluto no nicho suplementos
  3. ROI por viagem → a ferramenta de decisão de compra que nenhum concorrente tem

  O segmento fitness cresceu 88% em PMEs online em 2024. A creatina sozinha: 346%. O mercado está em expansão acelerada e sem um app vertical de gestão que combine
  mobile-first + rastreabilidade real. O FITO está posicionado para ocupar esse espaço.
  
  
  
Melhorias Propostas — FITO                                                                                                                                            
                                                         
  🔴 Urgentes                                                                                                                                                             
  1. Importação XML NF-e — importar nota fiscal do fornecedor para preencher entrada automaticamente
  2. ✅ OK — Status explícito de entrada — OPEN / PARTIAL / SOLD_OUT / ARCHIVED visível na UI
  3. ✅ OK — Correção de entrada com auditoria — criar entrada corretiva em vez de bloquear erro após venda                                                                     
                                                                                                                                                                         
  🟡 Diferenciadoras

  4. FEFO para suplementos — vender o que vence primeiro; alerta de validade próxima
  5. ✅ OK — ROI por viagem/entrada — investimento × receita gerada × margem por lote de compra
  6. Matriz visual de grade — tabela cor × tamanho com tap para incluir/excluir combinações
  7. Alerta de ruptura por variante — estoque mínimo por tamanho específico, não só por produto
  8. Catálogo digital compartilhável — link público do estoque para vender pelo WhatsApp
  9. Modo rápido de recebimento — scan em série na câmera, entrada criada em 1 tela
  10. Dashboard vertical fitness — relatórios por sazonalidade, produtos vendidos juntos, giro de suplemento

  🟢 Futuras

  11. Precificação automática por margem alvo — define margem desejada, FITO sugere preço de venda
  12. Reabertura parcial de entrada — liberar adição de itens por produto (não pela entrada toda)
  13. Notificação de lote esgotado — push quando quantity_remaining = 0 com sugestão de reposição
  14. Ranking de fornecedores — histórico de preços e margem entregue por fornecedor
  15. QR Code na etiqueta vinculado à entrada — leitura física rastreia origem do produto no estoque
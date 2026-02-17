"""
Serviço de AI Scan para análise de imagens de produtos.
Utiliza OpenAI GPT-4o Vision API.
"""
import base64
import json
import logging
import re
import time
from typing import Optional, List, Dict, Any
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from app.core.config import settings
from app.models.product import Product
from app.models.category import Category
from app.schemas.ai import ProductScanResult, DuplicateMatch

logger = logging.getLogger(__name__)


class AIScanService:
    """Serviço para análise de imagens de produtos com IA."""

    # Prompt otimizado para loja fitness (foco em roupas femininas)
    SCAN_PROMPT_TEMPLATE = """Você é um especialista em produtos fitness, com especialização em moda fitness feminina.
Analise esta imagem de produto e extraia TODAS as informações visíveis com MÁXIMA PRECISÃO.

## CATEGORIAS DISPONÍVEIS:
{categories}

## CONTEXTO DA LOJA:
Esta é uma loja FITNESS com foco principal em **roupas femininas**, mas também vende:
- Roupas masculinas e unissex
- Suplementos alimentares
- Acessórios de treino
- Calçados esportivos
- Perfumaria e cosméticos

## INSTRUÇÕES DETALHADAS:

### 1. **Identificação do Produto**
   - **Nome:** Nome do tipo/modelo SEM cor e tamanho (ex: "Legging Fitness com Recortes Laterais", não "Legging Fitness Preta M")
   - **IMPORTANTE**: Cor e tamanho vão em campos separados, NÃO no nome!
   - **Marca:** Leia logos, etiquetas, tags, bordados
   - **Modelo/Linha:** Se visível (ex: "Essential", "Pro", "Seamless")
   - **Descrição:** Destaque características únicas (recortes, transparências, estampas, tecnologias)

### 2. **Características de Roupas Fitness** (PRIORIDADE)
   - **Tipo:** Top/Cropped/Legging/Short/Conjunto/Sports Bra/Maiô
   - **Cor Principal:** Nome comercial (Preto, Rosa Millennial, Verde Militar)
   - **Cores Secundárias:** Detalhes, costuras, estampas
   - **Tamanho:** PP/P/M/G/GG/XGG (roupas) ou 34-44 (calçados). Se NÃO conseguir identificar, retorne null (não use "Desconhecido")
   - **Material:** Leia etiquetas! (Poliamida, Elastano, Suplex, Dry Fit, Cotton)
   - **Composição:** % se visível (ex: "87% Poliamida, 13% Elastano")
   - **Tecnologia:** Anti-celulite, Modelador, Seamless, UV50+
   - **Gênero:** feminino, masculino, unissex (SEMPRE especifique!)
   - **Estilo:** Fitness, Casual, Yoga, Crossfit, Corrida

### 3. **Características de Suplementos** (se aplicável)
   - **Tipo:** Whey/BCAA/Pre-treino/Vitamina/Barra
   - **Sabor:** Se visível
   - **Quantidade:** Gramas, porções
   - **Marca:** Sempre importante em suplementos

### 4. **Código de Barras**
   - Procure em etiquetas, embalagens, tags
   - Extraia TODOS os dígitos visíveis

### 5. **Categorização Inteligente**
   - Escolha a categoria MAIS ESPECÍFICA da lista
   - Para roupas femininas, seja preciso: "Tops e Blusas Femininas" > "Roupas Femininas"
   - Use hierarquia: específico > genérico

### 6. **Qualidade da Imagem**
   - **excellent:** Nítida, bem iluminada, detalhes legíveis, etiquetas visíveis
   - **good:** Aceitável, consegue identificar produto mas falta alguns detalhes
   - **poor:** Borrada, mal iluminada, difícil identificar
   - **Feedback:** Se poor/good, diga EXATAMENTE o que melhorar

### 7. **Estimativa de Preço** ⚡ NOVO
   - **Preço de Custo Estimado (cost_price):** Analise o tipo de produto, marca, qualidade aparente, material
     - Legging fitness básica sem marca: R$ 25-35
     - Legging fitness marca nacional (Lupo, Live, Labellamafia): R$ 40-70
     - Legging fitness marca importada (Nike, Adidas): R$ 80-150
     - Whey proteína 900g marca conhecida: R$ 60-100
     - Top/Sports Bra marca nacional: R$ 25-45
     - Tênis fitness: R$ 100-250
   - **Preço de Venda Sugerido (sale_price):** Aplique markup de 80-120% sobre o custo
     - Produtos sem marca: 80-100% markup
     - Marcas nacionais: 90-110% markup
     - Marcas importadas/premium: 100-120% markup
   - **Justificativa (price_reasoning):** Explique brevemente o raciocínio

## FORMATO DE RESPOSTA (JSON válido):

```json
{{
  "name": "[Tipo] [Marca] [Modelo]",
  "description": "Descrição detalhada destacando características únicas",
  "brand": "Marca exata ou 'Desconhecida'",
  "color": "Nome comercial da cor principal ou null",
  "size": "PP|P|M|G|GG|XGG ou 34-44 ou null se não identificável",
  "gender": "feminino|masculino|unissex",
  "material": "Material principal ou composição completa",
  "suggested_category": "Nome EXATO da categoria da lista acima",
  "detected_barcode": "código ou null",
  "estimated_cost_price": 45.00,
  "estimated_sale_price": 89.90,
  "price_reasoning": "Legging marca nacional de boa qualidade, material premium",
  "is_supplement": false,
  "is_clothing": true,
  "is_footwear": false,
  "is_accessory": false,
  "is_equipment": false,
  "confidence": 0.0-1.0,
  "image_quality": "excellent|good|poor",
  "image_feedback": "Sugestão específica ou null",
  "warnings": ["Lista de avisos importantes"]
}}
```

## EXEMPLOS DE BOAS RESPOSTAS:

**Exemplo 1 - Legging:**
```json
{{
  "name": "Legging Fitness Cintura Alta com Recortes Laterais",
  "description": "Legging fitness de cintura alta com recortes laterais em tela, tecnologia anti-celulite, costuras reforçadas",
  "brand": "Labellamafia",
  "color": "Preta",
  "size": "M",
  "gender": "feminino",
  "material": "87% Poliamida, 13% Elastano - Suplex",
  "suggested_category": "Leggings e Calças Femininas",
  "detected_barcode": null,
  "estimated_cost_price": 55.00,
  "estimated_sale_price": 109.90,
  "price_reasoning": "Marca nacional premium (Labellamafia), tecnologia anti-celulite, material de qualidade (Suplex). Markup 100%",
  "is_clothing": true,
  "confidence": 0.95,
  "image_quality": "excellent"
}}
```

**Exemplo 2 - Whey:**
```json
{{
  "name": "Whey Protein Concentrado Chocolate 900g",
  "description": "Suplemento proteico concentrado sabor chocolate, 25g de proteína por dose",
  "brand": "Integral Médica",
  "color": "Marrom",
  "size": null,
  "gender": "unissex",
  "material": "Proteína do soro do leite",
  "suggested_category": "Proteínas",
  "estimated_cost_price": 75.00,
  "estimated_sale_price": 149.90,
  "price_reasoning": "Marca conhecida (Integral Médica), porção 900g, suplemento premium. Markup 100%",
  "is_supplement": true,
  "confidence": 0.90
}}
```

## REGRAS CRÍTICAS:
✅ Seja ESPECÍFICO no nome (não genérico)
✅ Identifique gênero SEMPRE (feminino é prioridade)
✅ Use categorias EXATAS da lista
✅ Leia etiquetas quando visível
✅ Destaque características únicas na descrição
✅ **SEMPRE estime preços** baseado no tipo/marca/qualidade do produto
✅ **Justifique o preço** brevemente (marca, qualidade, material)
❌ NÃO invente informações que não vê
❌ NÃO seja genérico ("Roupa" → "Legging Fitness Cintura Alta")
❌ NÃO use preços genéricos - ANALISE o produto específico

Responda APENAS com o JSON, sem texto adicional."""

    def __init__(self, db: AsyncSession):
        """
        Inicializa o serviço.

        Args:
            db: Sessão assíncrona do banco de dados
        """
        self.db = db
        self._client = None

    @property
    def client(self):
        """Lazy initialization do cliente OpenAI."""
        if self._client is None:
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
            except ImportError:
                raise RuntimeError("openai package not installed. Run: pip install openai")
        return self._client

    async def analyze_image(
        self,
        image_bytes: bytes,
        media_type: str,
        *,
        tenant_id: int,
        check_duplicates: bool = True,
        suggest_price: bool = True,
        context: Optional[str] = None,
    ) -> ProductScanResult:
        """
        Analisa uma imagem de produto usando Claude Vision.

        Args:
            image_bytes: Bytes da imagem
            media_type: MIME type (image/jpeg, image/png, etc.)
            tenant_id: ID do tenant para buscar categorias e duplicados
            check_duplicates: Se deve verificar duplicados
            suggest_price: Se deve sugerir preço
            context: Contexto adicional opcional

        Returns:
            ProductScanResult: Resultado da análise

        Raises:
            ValueError: Se a API key não estiver configurada
            RuntimeError: Se ocorrer erro na chamada da API
        """
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY não configurada")

        if not settings.AI_SCAN_ENABLED:
            raise ValueError("AI Scan está desabilitado")

        start_time = time.time()

        # Buscar categorias disponíveis
        categories = await self._get_categories()
        categories_text = ", ".join([c.name for c in categories])

        # Montar prompt
        prompt = self._build_prompt(categories_text, context)

        # Codificar imagem em base64
        image_data = base64.standard_b64encode(image_bytes).decode("utf-8")

        try:
            # Chamada à API OpenAI GPT-4o Vision
            response = self.client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                max_tokens=settings.OPENAI_MAX_TOKENS,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt,
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{image_data}",
                                    "detail": "high"
                                },
                            },
                        ],
                    }
                ],
            )

            # Extrair resposta
            response_text = response.choices[0].message.content
            logger.info(f"OpenAI response: {response_text[:500]}...")

            # Parsear JSON da resposta
            ai_data = self._parse_response(response_text)

            # Enriquecer resultado
            result = await self._enrich_result(
                ai_data,
                categories,
                tenant_id,
                check_duplicates,
                suggest_price,
            )

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.info(f"AI Scan completed in {elapsed_ms}ms")

            return result

        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}", exc_info=True)
            raise RuntimeError(f"Erro ao analisar imagem: {str(e)}")

    def _build_prompt(self, categories_text: str, context: Optional[str] = None) -> str:
        """Constrói o prompt para a API."""
        prompt = self.SCAN_PROMPT_TEMPLATE.format(categories=categories_text)
        if context:
            prompt += f"\n\n## CONTEXTO ADICIONAL:\n{context}"
        return prompt

    def _parse_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parseia a resposta JSON do Claude.

        Args:
            response_text: Texto da resposta

        Returns:
            Dict com os dados parseados
        """
        # Tentar extrair JSON do texto
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if not json_match:
            raise ValueError("Resposta da IA não contém JSON válido")

        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON: {e}")
            raise ValueError(f"Erro ao parsear resposta da IA: {e}")

    async def _get_categories(self) -> List[Category]:
        """Busca todas as categorias ativas."""
        stmt = select(Category).where(Category.is_active == True).order_by(Category.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _enrich_result(
        self,
        ai_data: Dict[str, Any],
        categories: List[Category],
        tenant_id: int,
        check_duplicates: bool,
        suggest_price: bool,
    ) -> ProductScanResult:
        """
        Enriquece o resultado da IA com dados adicionais.

        Args:
            ai_data: Dados brutos da IA
            categories: Lista de categorias disponíveis
            tenant_id: ID do tenant
            check_duplicates: Se deve buscar duplicados
            suggest_price: Se deve sugerir preço

        Returns:
            ProductScanResult completo
        """
        # Match de categoria
        category_id, category_name = self._match_category(
            ai_data.get("suggested_category", ""),
            categories
        )

        # Gerar SKU único
        suggested_sku = await self._generate_sku(
            ai_data.get("brand"),
            ai_data.get("name", "PRODUTO"),
            ai_data.get("color"),
            ai_data.get("size"),
            tenant_id,
        )

        # Buscar duplicados
        duplicates: List[DuplicateMatch] = []
        if check_duplicates:
            duplicates = await self._find_duplicates(
                ai_data.get("name", ""),
                ai_data.get("brand"),
                ai_data.get("color"),
                ai_data.get("size"),
                ai_data.get("detected_barcode"),
                tenant_id,
            )

        # Sugerir preço
        cost_price = None
        sale_price = None
        markup = None
        price_reasoning = None

        if suggest_price:
            pricing = await self._suggest_pricing(
                category_name,
                ai_data.get("brand"),
                ai_data.get("is_supplement", False),
                tenant_id,
                ai_estimated_cost=ai_data.get("estimated_cost_price"),
                ai_estimated_sale=ai_data.get("estimated_sale_price"),
                ai_reasoning=ai_data.get("price_reasoning"),
            )
            cost_price = pricing.get("cost_price")
            sale_price = pricing.get("sale_price")
            markup = pricing.get("markup")
            price_reasoning = pricing.get("reasoning")

        # Construir warnings
        warnings = ai_data.get("warnings", [])
        if ai_data.get("image_quality") == "poor":
            warnings.append("Qualidade da imagem baixa - resultados podem ser imprecisos")
        if duplicates:
            warnings.append(f"Encontrados {len(duplicates)} produtos similares")

        return ProductScanResult(
            name=ai_data.get("name", "Produto sem nome"),
            description=ai_data.get("description"),
            brand=ai_data.get("brand"),
            color=ai_data.get("color"),
            size=ai_data.get("size"),
            gender=ai_data.get("gender"),
            material=ai_data.get("material"),
            suggested_category=category_name,
            suggested_category_id=category_id,
            suggested_sku=suggested_sku,
            detected_barcode=ai_data.get("detected_barcode"),
            suggested_cost_price=cost_price,
            suggested_sale_price=sale_price,
            markup_percentage=markup,
            price_reasoning=price_reasoning,
            is_supplement=ai_data.get("is_supplement", False),
            is_clothing=ai_data.get("is_clothing", False),
            is_footwear=ai_data.get("is_footwear", False),
            is_accessory=ai_data.get("is_accessory", False),
            is_equipment=ai_data.get("is_equipment", False),
            confidence=ai_data.get("confidence", 0.5),
            image_quality=ai_data.get("image_quality", "good"),
            image_feedback=ai_data.get("image_feedback"),
            possible_duplicates=duplicates,
            warnings=warnings,
        )

    def _match_category(
        self,
        suggested_name: str,
        categories: List[Category]
    ) -> tuple[Optional[int], str]:
        """
        Casa a categoria sugerida com uma categoria existente.

        Args:
            suggested_name: Nome sugerido pela IA
            categories: Lista de categorias disponíveis

        Returns:
            Tupla (category_id, category_name)
        """
        if not suggested_name or not categories:
            return None, suggested_name or "Sem categoria"

        suggested_lower = suggested_name.lower().strip()

        # Match exato
        for cat in categories:
            if cat.name.lower() == suggested_lower:
                return cat.id, cat.name

        # Match parcial
        for cat in categories:
            if suggested_lower in cat.name.lower() or cat.name.lower() in suggested_lower:
                return cat.id, cat.name

        # Sem match - retorna sugestão original
        return None, suggested_name

    async def _generate_sku(
        self,
        brand: Optional[str],
        name: str,
        color: Optional[str],
        size: Optional[str],
        tenant_id: int,
    ) -> str:
        """
        Gera um SKU único para o produto.

        Formato: MARCA-NOME-COR-TAM-XXX

        Args:
            brand: Marca do produto
            name: Nome do produto
            color: Cor do produto
            size: Tamanho do produto
            tenant_id: ID do tenant

        Returns:
            SKU único gerado
        """
        # Limpar e formatar componentes
        def clean(s: str) -> str:
            if not s:
                return ""
            # Remove acentos e caracteres especiais
            import unicodedata
            s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('ASCII')
            # Remove espaços e caracteres não alfanuméricos
            s = re.sub(r'[^A-Za-z0-9]', '', s)
            return s.upper()[:6]

        parts = []

        if brand:
            parts.append(clean(brand)[:4])

        parts.append(clean(name)[:6])

        if color:
            parts.append(clean(color)[:3])

        if size:
            parts.append(clean(size)[:3])

        base_sku = "-".join(parts) if parts else "PROD"

        # Verificar unicidade e adicionar contador
        counter = 1
        candidate = f"{base_sku}-{counter:03d}"

        stmt = select(func.count(Product.id)).where(
            Product.sku == candidate,
            Product.tenant_id == tenant_id,
        )

        while True:
            result = await self.db.execute(stmt)
            count = result.scalar() or 0

            if count == 0:
                return candidate

            counter += 1
            candidate = f"{base_sku}-{counter:03d}"
            stmt = select(func.count(Product.id)).where(
                Product.sku == candidate,
                Product.tenant_id == tenant_id,
            )

            if counter > 999:
                # Fallback com timestamp
                import time
                return f"{base_sku}-{int(time.time()) % 10000}"

    async def _find_duplicates(
        self,
        name: str,
        brand: Optional[str],
        color: Optional[str],
        size: Optional[str],
        barcode: Optional[str],
        tenant_id: int,
    ) -> List[DuplicateMatch]:
        """
        Busca produtos similares no banco.

        Args:
            name: Nome do produto
            brand: Marca
            color: Cor
            size: Tamanho
            barcode: Código de barras
            tenant_id: ID do tenant

        Returns:
            Lista de possíveis duplicados
        """
        duplicates: List[DuplicateMatch] = []

        # Se tem barcode, verificar match exato
        if barcode:
            stmt = select(Product).where(
                Product.barcode == barcode,
                Product.tenant_id == tenant_id,
                Product.is_active == True,
            )
            result = await self.db.execute(stmt)
            exact = result.scalar_one_or_none()

            if exact:
                duplicates.append(DuplicateMatch(
                    product_id=exact.id,
                    product_name=exact.name,
                    sku=exact.sku,
                    similarity_score=1.0,
                    reason="Código de barras idêntico",
                ))
                return duplicates  # Match exato, não precisa buscar mais

        # Busca por nome similar
        if name:
            search_pattern = f"%{name[:20]}%"
            stmt = select(Product).where(
                Product.name.ilike(search_pattern),
                Product.tenant_id == tenant_id,
                Product.is_active == True,
            ).limit(5)

            result = await self.db.execute(stmt)
            similar = result.scalars().all()

            for product in similar:
                # Calcular similaridade simples
                score = self._calculate_similarity(
                    name, brand, color, size,
                    product.name, product.brand, product.color, product.size,
                )

                if score >= 0.6:  # Threshold de similaridade
                    reason_parts = []
                    if name.lower() in product.name.lower() or product.name.lower() in name.lower():
                        reason_parts.append("Nome similar")
                    if brand and product.brand and brand.lower() == product.brand.lower():
                        reason_parts.append("Mesma marca")
                    if color and product.color and color.lower() == product.color.lower():
                        reason_parts.append("Mesma cor")
                    if size and product.size and size.lower() == product.size.lower():
                        reason_parts.append("Mesmo tamanho")

                    duplicates.append(DuplicateMatch(
                        product_id=product.id,
                        product_name=product.name,
                        sku=product.sku,
                        similarity_score=score,
                        reason=", ".join(reason_parts) or "Produto similar",
                    ))

        # Ordenar por score
        duplicates.sort(key=lambda d: d.similarity_score, reverse=True)
        return duplicates[:5]

    def _calculate_similarity(
        self,
        name1: str, brand1: Optional[str], color1: Optional[str], size1: Optional[str],
        name2: str, brand2: Optional[str], color2: Optional[str], size2: Optional[str],
    ) -> float:
        """Calcula score de similaridade entre dois produtos."""
        score = 0.0
        weights = {"name": 0.4, "brand": 0.3, "color": 0.15, "size": 0.15}

        # Nome (40%)
        if name1 and name2:
            name1_lower = name1.lower()
            name2_lower = name2.lower()
            if name1_lower == name2_lower:
                score += weights["name"]
            elif name1_lower in name2_lower or name2_lower in name1_lower:
                score += weights["name"] * 0.8

        # Marca (30%)
        if brand1 and brand2:
            if brand1.lower() == brand2.lower():
                score += weights["brand"]

        # Cor (15%)
        if color1 and color2:
            if color1.lower() == color2.lower():
                score += weights["color"]

        # Tamanho (15%)
        if size1 and size2:
            if size1.upper() == size2.upper():
                score += weights["size"]

        return min(score, 1.0)

    async def _suggest_pricing(
        self,
        category_name: str,
        brand: Optional[str],
        is_supplement: bool,
        tenant_id: int,
        ai_estimated_cost: Optional[float] = None,
        ai_estimated_sale: Optional[float] = None,
        ai_reasoning: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sugere preço baseado em estimativa da IA + histórico da loja.

        Prioridade:
        1. Se IA sugeriu preços → usar como base
        2. Se há produtos similares na loja → calcular média
        3. Fallback → markup padrão sobre estimativa da IA
        4. Último caso → valores padrão do sistema

        Args:
            category_name: Nome da categoria
            brand: Marca do produto
            is_supplement: Se é suplemento
            tenant_id: ID do tenant
            ai_estimated_cost: Preço de custo estimado pela IA
            ai_estimated_sale: Preço de venda estimado pela IA
            ai_reasoning: Justificativa da IA para os preços

        Returns:
            Dict com cost_price, sale_price, markup, reasoning
        """
        # PRIORIDADE 1: IA sugeriu preços → usar como base
        if ai_estimated_cost and ai_estimated_sale:
            markup = ((ai_estimated_sale - ai_estimated_cost) / ai_estimated_cost) * 100 if ai_estimated_cost > 0 else 0
            reasoning = ai_reasoning or "Estimativa baseada em análise visual da IA"
            
            # Tentar ajustar com histórico da loja
            similar_prices = await self._get_similar_prices(brand, tenant_id)
            if similar_prices:
                avg_cost, avg_sale = similar_prices
                # Ponderar: 70% IA + 30% histórico
                adjusted_cost = (ai_estimated_cost * 0.7) + (avg_cost * 0.3)
                adjusted_sale = (ai_estimated_sale * 0.7) + (avg_sale * 0.3)
                markup = ((adjusted_sale - adjusted_cost) / adjusted_cost) * 100 if adjusted_cost > 0 else 0
                
                return {
                    "cost_price": round(adjusted_cost, 2),
                    "sale_price": round(adjusted_sale, 2),
                    "markup": round(markup, 1),
                    "reasoning": f"{reasoning}. Ajustado com média da sua loja (70% IA + 30% histórico)",
                }
            
            return {
                "cost_price": round(ai_estimated_cost, 2),
                "sale_price": round(ai_estimated_sale, 2),
                "markup": round(markup, 1),
                "reasoning": reasoning,
            }

        # PRIORIDADE 2: Buscar produtos similares na loja
        similar_prices = await self._get_similar_prices(brand, tenant_id)
        if similar_prices:
            avg_cost, avg_sale = similar_prices
            markup = ((avg_sale - avg_cost) / avg_cost) * 100 if avg_cost > 0 else 0
            return {
                "cost_price": round(avg_cost, 2),
                "sale_price": round(avg_sale, 2),
                "markup": round(markup, 1),
                "reasoning": "Baseado em produtos similares da sua loja",
            }

        # PRIORIDADE 3: Usar apenas uma estimativa da IA (sem par completo)
        if ai_estimated_cost or ai_estimated_sale:
            default_markup = settings.AI_DEFAULT_MARKUP
            
            if ai_estimated_cost:
                cost = ai_estimated_cost
                sale = cost * (1 + default_markup / 100)
                reasoning = f"Custo estimado pela IA, markup padrão {default_markup}%"
            else:
                sale = ai_estimated_sale
                cost = sale / (1 + default_markup / 100)
                reasoning = f"Preço de venda estimado pela IA, markup padrão {default_markup}%"
            
            markup = ((sale - cost) / cost) * 100 if cost > 0 else 0
            return {
                "cost_price": round(cost, 2),
                "sale_price": round(sale, 2),
                "markup": round(markup, 1),
                "reasoning": reasoning,
            }

        # FALLBACK FINAL: Valores padrão do sistema (último recurso)
        default_markup = settings.AI_DEFAULT_MARKUP
        base_cost = 45.00 if is_supplement else 35.00
        sale_price = base_cost * (1 + default_markup / 100)

        return {
            "cost_price": base_cost,
            "sale_price": round(sale_price, 2),
            "markup": default_markup,
            "reasoning": f"⚠️ Valores padrão do sistema (markup {default_markup}%) - sem estimativa da IA ou histórico",
        }

    async def _get_similar_prices(
        self,
        brand: Optional[str],
        tenant_id: int,
    ) -> Optional[tuple[float, float]]:
        """
        Busca preços médios de produtos similares na loja.

        Args:
            brand: Marca do produto
            tenant_id: ID do tenant

        Returns:
            Tuple (avg_cost, avg_sale) ou None se não encontrar
        """
        conditions = [
            Product.tenant_id == tenant_id,
            Product.is_active == True,
            Product.is_catalog == False,
            Product.price.isnot(None),
            Product.cost_price.isnot(None),
        ]

        if brand:
            conditions.append(Product.brand.ilike(f"%{brand}%"))

        stmt = select(Product.cost_price, Product.price).where(*conditions).limit(20)
        result = await self.db.execute(stmt)
        similar_products = result.all()

        if not similar_products:
            return None

        costs = [float(p[0]) for p in similar_products if p[0]]
        prices = [float(p[1]) for p in similar_products if p[1]]

        if not costs or not prices:
            return None

        avg_cost = sum(costs) / len(costs)
        avg_price = sum(prices) / len(prices)

        return (avg_cost, avg_price)

    async def check_status(self) -> Dict[str, Any]:
        """Verifica status do serviço de IA."""
        return {
            "enabled": settings.AI_SCAN_ENABLED,
            "model": settings.OPENAI_MODEL,
            "has_api_key": bool(settings.OPENAI_API_KEY),
        }

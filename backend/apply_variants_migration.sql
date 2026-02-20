-- Migração para o sistema de variantes de produto
-- Execute este script no banco de dados PostgreSQL

-- 1. Criar tabela product_variants
CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(50) NOT NULL,
    size VARCHAR(20),
    color VARCHAR(50),
    price NUMERIC(10, 2) NOT NULL,
    cost_price NUMERIC(10, 2),
    image_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP
);

-- Índices para product_variants
CREATE INDEX IF NOT EXISTS ix_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS ix_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS ix_product_variants_tenant_id ON product_variants(tenant_id);

-- Constraints únicas para product_variants
ALTER TABLE product_variants 
ADD CONSTRAINT uq_variant_product_size_color 
UNIQUE (product_id, size, color);

ALTER TABLE product_variants 
ADD CONSTRAINT uq_variants_tenant_sku 
UNIQUE (tenant_id, sku);

-- 2. Adicionar coluna variant_id em entry_items
ALTER TABLE entry_items ADD COLUMN IF NOT EXISTS variant_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_entry_items_variant_id ON entry_items(variant_id);
ALTER TABLE entry_items 
ADD CONSTRAINT fk_entry_items_variant_id 
FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;

-- 3. Adicionar coluna variant_id em inventory
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_inventory_variant_id ON inventory(variant_id);
ALTER TABLE inventory 
ADD CONSTRAINT fk_inventory_variant_id 
FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;

-- 4. Adicionar coluna variant_id em sale_items
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS variant_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_sale_items_variant_id ON sale_items(variant_id);
ALTER TABLE sale_items 
ADD CONSTRAINT fk_sale_items_variant_id 
FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;

-- 5. Adicionar coluna variant_id em return_items
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS variant_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_return_items_variant_id ON return_items(variant_id);
ALTER TABLE return_items 
ADD CONSTRAINT fk_return_items_variant_id 
FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;

-- 6. Adicionar coluna base_price em products
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price NUMERIC(10, 2);

-- 7. Tornar product_id nullable nas tabelas relacionadas
ALTER TABLE entry_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE inventory ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE return_items ALTER COLUMN product_id DROP NOT NULL;

-- 8. Remover constraints únicas antigas de products (se existirem)
-- Nota: Execute manualmente se houver erro
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_tenant_sku;
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_tenant_barcode;

-- Log
SELECT 'Migração de variantes aplicada com sucesso!' AS status;
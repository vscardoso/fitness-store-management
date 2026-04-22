export interface ProductMedia {
  id: number;
  product_id: number;
  variant_id: number | null;
  url: string;
  position: number;
  is_cover: boolean;
  media_type: 'photo' | 'gif';
  created_at: string;
}

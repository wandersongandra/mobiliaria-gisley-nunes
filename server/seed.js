export const demoProperties = [
  { title: 'Apartamento Solar', slug: 'apartamento-solar', location: 'Lourdes · Belo Horizonte', city: 'Belo Horizonte', purpose: 'Comprar', type: 'Apartamento', price: 2480000, priceLabel: 'R$ 2.480.000', bedrooms: 3, bathrooms: 3, areaM2: 148, description: 'Apartamento com luz natural, marcenaria sob medida e rua arborizada em Lourdes.', status: 'published', featured: 1, coverUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85' },
  { title: 'Casa Ipê', slug: 'casa-ipe', location: 'Belvedere · Belo Horizonte', city: 'Belo Horizonte', purpose: 'Comprar', type: 'Casa', price: 4950000, priceLabel: 'R$ 4.950.000', bedrooms: 4, bathrooms: 5, areaM2: 320, description: 'Casa contemporânea com jardim e ambientes para receber no Belvedere.', status: 'published', featured: 1, coverUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85' },
  { title: 'Cobertura Horizonte', slug: 'cobertura-horizonte', location: 'Savassi · Belo Horizonte', city: 'Belo Horizonte', purpose: 'Alugar', type: 'Cobertura', price: 18500, priceLabel: 'R$ 18.500 / mês', bedrooms: 3, bathrooms: 4, areaM2: 210, description: 'Cobertura com vista aberta e terraço na Savassi.', status: 'published', featured: 1, coverUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85' },
  { title: 'Loft Harmonia', slug: 'loft-harmonia', location: 'Buritis · Belo Horizonte', city: 'Belo Horizonte', purpose: 'Alugar', type: 'Apartamento', price: 7200, priceLabel: 'R$ 7.200 / mês', bedrooms: 1, bathrooms: 2, areaM2: 82, description: 'Loft com planta aberta, concreto aparente e varanda no Buritis.', status: 'published', featured: 0, coverUrl: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1200&q=85' },
  { title: 'Casa Cedro', slug: 'casa-cedro', location: 'Lourdes · Belo Horizonte', city: 'Belo Horizonte', purpose: 'Comprar', type: 'Casa', price: 2980000, priceLabel: 'R$ 2.980.000', bedrooms: 3, bathrooms: 3, areaM2: 198, description: 'Casa urbana com área verde e ambientes integrados em Lourdes.', status: 'published', featured: 1, coverUrl: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85' },
  { title: 'Apartamento Mirante', slug: 'apartamento-mirante', location: 'Savassi · Belo Horizonte', city: 'Belo Horizonte', purpose: 'Comprar', type: 'Apartamento', price: 1280000, priceLabel: 'R$ 1.280.000', bedrooms: 2, bathrooms: 2, areaM2: 76, description: 'Apartamento com planta funcional e vista para a cidade na Savassi.', status: 'published', featured: 0, coverUrl: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85' }
];

export function priceBand(price) {
  const value = Number(price || 0);
  if (value < 1500000) return 1;
  if (value <= 3000000) return 2;
  return 3;
}

// Retorna os imóveis demo no mesmo formato das linhas retornadas pelo banco,
// para que o catálogo público funcione de forma idêntica com ou sem MySQL.
export function seedRows() {
  return demoProperties.map((item, index) => {
    const id = `demo-${index + 1}`;
    return {
      id,
      title: item.title,
      slug: item.slug,
      location: item.location,
      city: item.city,
      purpose: item.purpose,
      type: item.type,
      price: item.price,
      price_label: item.priceLabel,
      bedrooms: item.bedrooms,
      bathrooms: item.bathrooms,
      area_m2: item.areaM2,
      suites: 0,
      parking_spots: 0,
      condo_fee: 0,
      iptu: 0,
      description: item.description,
      status: item.status,
      is_featured: item.featured,
      created_at: null,
      updated_at: null,
      price_band: priceBand(item.price),
      cover_url: item.coverUrl,
      photos: [{
        id: `demo-photo-${index + 1}`,
        property_id: id,
        storage_path: `demo/${item.slug}`,
        url: item.coverUrl,
        alt_text: item.title,
        sort_order: 0,
        is_cover: 1,
        created_at: null
      }]
    };
  });
}

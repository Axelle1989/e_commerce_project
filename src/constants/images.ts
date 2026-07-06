/**
 * Centralized image mapping for authentic Beninese context.
 * Using high-quality remote URLs that match the local reality of Cotonou and Benin.
 */

export const BENIN_IMAGES = {
  // Products
  products: {
    tomatoes: "/images/marche/marche-dantokpa.jpg", // Pas de photo dédiée fournie : on réutilise la scène de marché (tomates visibles au 1er plan)
    onions: "/images/produits/oignons.jpg", // Oignons rouges
    peppers: "/images/produits/piments.jpg", // Piments rouges séchés
    rice: "/images/produits/riz.jpg", // Riz
    fish: "https://images.unsplash.com/photo-1534604973900-c41ab4c5e636?auto=format&fit=crop&q=80&w=800", // Pas de photo fournie, on garde le placeholder
    gari: "/images/produits/gari.jpg", // Gari (semoule de manioc)
    palmOil: "https://images.unsplash.com/photo-1590779033100-9f60705a2f3b?auto=format&fit=crop&q=80&w=800", // Pas de photo fournie, on garde le placeholder
    leafyVegetables: "/images/produits/legumes-feuilles.jpg", // Feuilles amères / légumes verts
  },
  
  // Market Scenes
  market: {
    dantokpa: "/images/marche/marche-dantokpa.jpg", // Marché coloré
    vendeuse: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&q=80&w=800", // Pas de photo fournie, on garde le placeholder
    tas_produits: "/images/marche/marche-dantokpa.jpg", // Piles de produits
  },
  
  // Delivery & Zémidjan
  delivery: {
    zemidjan: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&q=80&w=1200", // Pas de photo fournie, on garde le placeholder
    deliveryMan: "/images/livraison/livreur.jpg", // Illustration livreur scooter
    client_door: "https://images.unsplash.com/photo-1586769852836-bc069f19e1b6?auto=format&fit=crop&q=80&w=800", // Pas de photo fournie, on garde le placeholder
    tracking: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=1200", // Pas de photo fournie, on garde le placeholder
    package: "/images/livraison/livreur.jpg",
  },
  
  // Gains & Money (FCFA vibe)
  gains: {
    cash: "/images/gains/billets-fcfa.jpg", // Billets FCFA
    billets_fcfa: "/images/gains/billets-fcfa.jpg", // Billets FCFA
  },

  // Hero & Backgrounds
  hero: {
    cotonou: "https://images.unsplash.com/photo-1591024304252-094186f9f243?auto=format&fit=crop&q=80&w=1200", // Pas de photo fournie, on garde le placeholder
    market_wide: "/images/marche/marche-dantokpa.jpg", // Marché coloré grand format
  }
};

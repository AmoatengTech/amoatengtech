/**
 * store.js — Single Responsibility: localStorage persistence for morbi.shop
 *
 * Data model (single vendor — Morcenzs):
 *   - landing: { section_key: content }  — editable landing page sections
 *   - categories[]: { id, name, slug, description, sortOrder }
 *   - products[]: { id, name, scent, description, price, categoryId, imagePath, available }
 *
 * Sync API, no backend. Same KISS pattern as ChowMenu Community Edition.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'morbi:shop:v1';
  const DEFAULT_CURRENCY = 'GHS';

  /* ---- Default data -------------------------------------------------- */

  function defaults() {
    return {
      currency: DEFAULT_CURRENCY,
      landing: {
        hero_title: 'Luxury Scents, Redefined.',
        hero_subtitle: 'Morcenzs is curated collection of luxury perfumes and accessories for those who want to leave an impression.',
        about_heading: 'About Morbi',
        about_text_1: 'Morbi is a creative entrepreneur and the founder of Morcenzs, a homegrown fragrance brand born from a passion for self-expression through scent.',
        about_text_2: 'Every Morcenzs bottle is curated with care from bold, attention-grabbing perfume signatures to subtle everyday essentials.',
        featured_heading: 'Featured Scents',
        featured_sub: 'A selection from the Morcenzs collection. Visit the store for the full range.',
        footer_text: 'Morcenzs by Morbi. All rights reserved.'
      },
      categories: [
        { id: 'cat_1', name: 'Eau de Parfum', slug: 'eau-de-parfum', description: 'Long-lasting signature scents', sortOrder: 0 },
        { id: 'cat_2', name: 'Body Mist', slug: 'body-mist', description: 'Light, everyday freshness', sortOrder: 1 },
        { id: 'cat_3', name: 'Accessories', slug: 'accessories', description: 'Perume accessories and gift sets', sortOrder: 2 }
      ],
      products: []
    };
  }

  /* ---- Internal read/write -------------------------------------------- */

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      // Merge with defaults so new fields appear on old data.
      return mergeDeep(defaults(), parsed);
    } catch (e) {
      console.warn('[morbi] store read failed, resetting.', e);
      return defaults();
    }
  }

  function write(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[morbi] store write failed:', e);
      return false;
    }
  }

  /** Simple deep merge (objects only, no arrays). Arrays are replaced. */
  function mergeDeep(target, source) {
    const out = Object.assign({}, target);
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
          && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        out[key] = mergeDeep(target[key], source[key]);
      } else {
        out[key] = source[key];
      }
    }
    return out;
  }

  /* ---- Public API: Landing content ------------------------------------ */

  function getLanding() {
    return Object.assign({}, read().landing);
  }

  function saveLanding(patch) {
    const data = read();
    data.landing = Object.assign({}, data.landing, patch);
    return write(data) ? data.landing : null;
  }

  /* ---- Public API: Categories ----------------------------------------- */

  function getCategories() {
    return read().categories.slice();
  }

  function getCategory(id) {
    return read().categories.find(function (c) { return c.id === id; }) || null;
  }

  function addCategory(cat) {
    const data = read();
    const newCat = Object.assign({
      id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      slug: slugify(cat.name),
      sortOrder: data.categories.length
    }, cat);
    data.categories.push(newCat);
    return write(data) ? newCat : null;
  }

  function updateCategory(id, patch) {
    const data = read();
    const idx = data.categories.findIndex(function (c) { return c.id === id; });
    if (idx === -1) return null;
    if (patch.name) patch.slug = slugify(patch.name);
    data.categories[idx] = Object.assign({}, data.categories[idx], patch);
    return write(data) ? data.categories[idx] : null;
  }

  function deleteCategory(id) {
    var data = read();
    data.categories = data.categories.filter(function (c) { return c.id !== id; });
    // Also unset categoryId on products that belonged to this category.
    data.products.forEach(function (p) {
      if (p.categoryId === id) p.categoryId = null;
    });
    return write(data);
  }

  /* ---- Public API: Products ------------------------------------------- */

  function getProducts() {
    return read().products.slice();
  }

  function getAvailableProducts() {
    return read().products.filter(function (p) { return p.available; });
  }

  function getProduct(id) {
    return read().products.find(function (p) { return p.id === id; }) || null;
  }

  function addProduct(product) {
    var data = read();
    var newProduct = Object.assign({
      id: 'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      available: true
    }, product);
    data.products.push(newProduct);
    return write(data) ? newProduct : null;
  }

  function updateProduct(id, patch) {
    var data = read();
    var idx = data.products.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return null;
    data.products[idx] = Object.assign({}, data.products[idx], patch);
    return write(data) ? data.products[idx] : null;
  }

  function deleteProduct(id) {
    var data = read();
    data.products = data.products.filter(function (p) { return p.id !== id; });
    return write(data);
  }

  /* ---- Public API: Utility -------------------------------------------- */

  function getCurrency() {
    return read().currency || DEFAULT_CURRENCY;
  }

  function saveCurrency(currency) {
    var data = read();
    data.currency = currency || DEFAULT_CURRENCY;
    return write(data);
  }

  function getFeaturedProducts() {
    // Return first 6 available products for the landing page.
    return getAvailableProducts().slice(0, 6);
  }

  function exportJSON() {
    return JSON.stringify(read(), null, 2);
  }

  function importJSON(jsonString) {
    try {
      var parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') return false;
      if (parsed.products !== undefined && !Array.isArray(parsed.products)) return false;
      if (parsed.categories !== undefined && !Array.isArray(parsed.categories)) return false;
      var merged = mergeDeep(defaults(), parsed);
      return write(merged);
    } catch (e) {
      console.error('[morbi] importJSON failed:', e);
      return false;
    }
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /* ---- Demo data for preview ------------------------------------------ */

  function getDemoProducts() {
    return [
      { id: 'demo-1', name: 'Oud Royale', scent: 'Woody, Spicy', description: 'A bold oriental blend of oud, amber, and black pepper. For the unapologetic.', price: 180, categoryId: 'cat_1', imagePath: '', available: true },
      { id: 'demo-2', name: 'Velvet Bloom', scent: 'Floral, Sweet', description: 'Rose, jasmine, and vanilla. Soft power in a bottle.', price: 150, categoryId: 'cat_1', imagePath: '', available: true },
      { id: 'demo-3', name: 'Citrus Pulse', scent: 'Fresh, Citrus', description: 'Bergamot, lemon zest, and green tea. Your morning ritual.', price: 120, categoryId: 'cat_1', imagePath: '', available: true },
      { id: 'demo-4', name: 'Ocean Breeze Mist', scent: 'Aquatic, Light', description: 'Sea salt, cucumber, and white musk. Fresh all day.', price: 65, categoryId: 'cat_2', imagePath: '', available: true },
      { id: 'demo-5', name: 'Midnight Jasmine Mist', scent: 'Floral, Musky', description: 'Night-blooming jasmine with sandalwood undertones.', price: 60, categoryId: 'cat_2', imagePath: '', available: true },
      { id: 'demo-6', name: 'Luxury Gift Set', scent: 'Assorted', description: '3 mini fragrances in a handcrafted box. The perfect gift.', price: 250, categoryId: 'cat_3', imagePath: '', available: true }
    ];
  }

  /* ---- Expose --------------------------------------------------------- */

  global.MorbiStore = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_CURRENCY: DEFAULT_CURRENCY,
    defaults: defaults,
    getLanding: getLanding,
    saveLanding: saveLanding,
    getCategories: getCategories,
    getCategory: getCategory,
    addCategory: addCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,
    getProducts: getProducts,
    getAvailableProducts: getAvailableProducts,
    getProduct: getProduct,
    addProduct: addProduct,
    updateProduct: updateProduct,
    deleteProduct: deleteProduct,
    getCurrency: getCurrency,
    saveCurrency: saveCurrency,
    getFeaturedProducts: getFeaturedProducts,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    getDemoProducts: getDemoProducts
  };
})(window);

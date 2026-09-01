/**
 * dashboard.js — Admin panel for morbi.shop
 *
 * Three tabs:
 *   1. Products CRUD (name, scent, price, category, image, description, available)
 *   2. Categories CRUD (name, description, sort order)
 *   3. Landing Content (editable sections)
 *
 * Tabbed interface — only one panel visible at a time.
 */
(function (global) {
  'use strict';

  var ui = global.ChowMenuUI;
  var el = ui.el, clear = ui.clear, formatPrice = ui.formatPrice, fileToDataURL = ui.fileToDataURL;
  var store = global.MorbiStore;
  var router = global.ChowMenuRouter;

  var ROOT_ID = 'app-root';
  var activeTab = 'products';

  /* ---- Main render -------------------------------------------------- */

  function render() {
    doRender();
  }

  function doRender() {
    var root = document.getElementById(ROOT_ID);
    clear(root);

    root.appendChild(
      el('div', { class: 'container dashboard' }, [
        el('div', { class: 'main-body' }, [
          renderHeader(),
          el('div', { class: 'dash-content' }, [
            renderTabs(),
            activeTab === 'products' ? renderProductsPanel() : null,
            activeTab === 'categories' ? renderCategoriesPanel() : null,
            activeTab === 'landing' ? renderLandingPanel() : null
          ])
        ])
      ])
    );

    if (activeTab === 'products') bindProductForm();
    if (activeTab === 'categories') bindCategoryForm();
    if (activeTab === 'landing') bindLandingForm();
  }

  /* ---- Header ------------------------------------------------------- */

  function renderHeader() {
    return el('header', { class: 'header' }, [
      el('div', { class: 'logo' }, [
        el('h1', { class: 'wordmark' }, 'morbi.shop'),
        el('p', { class: 'header-subtitle' }, 'Admin Panel')
      ]),
      el('div', { class: 'usr-toggle' }, [
        el('ul', { class: 'nav-links header' }, [
          el('li', {}, [
            el('button', {
              class: 'nav-item',
              title: 'Storefront',
              onclick: function () { router.navigate('#/morcenzs'); }
            }, [el('i', { class: 'fas fa-store' })])
          ]),
          el('li', {}, [
            el('button', {
              class: 'nav-item',
              title: 'Landing page',
              onclick: function () { router.navigate('#/'); }
            }, [el('i', { class: 'fas fa-home' })])
          ])
        ])
      ])
    ]);
  }

  /* ---- Tabs --------------------------------------------------------- */

  function renderTabs() {
    var tabs = [
      { key: 'products', label: 'Products', icon: 'fas fa-flask' },
      { key: 'categories', label: 'Categories', icon: 'fas fa-tags' },
      { key: 'landing', label: 'Landing Page', icon: 'fas fa-pen-fancy' }
    ];
    return el('div', { class: 'dash-tabs' }, tabs.map(function (t) {
      return el('button', {
        class: 'dash-tab' + (activeTab === t.key ? ' active' : ''),
        onclick: function () { activeTab = t.key; doRender(); }
      }, [el('i', { class: t.icon, style: { marginRight: '8px' } }), t.label]);
    }));
  }

  /* ====================================================================
     PRODUCTS TAB
     ==================================================================== */

  function renderProductsPanel() {
    var products = store.getProducts();
    var categories = store.getCategories();
    var currency = store.getCurrency();

    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel-title', id: 'products-panel-title' }, 'Products (' + products.length + ')'),
      el('div', { class: 'panel-body' }, [
        renderProductEditor(categories),
        el('div', { id: 'products-list', class: 'items-list' },
          products.length
            ? products.map(function (p) { return renderProductRow(p, currency); })
            : [el('p', { class: 'muted' }, 'No products yet. Add your first perfume above.')]
        )
      ])
    ]);
  }

  function renderProductEditor(categories) {
    return el('form', { id: 'product-form', class: 'item-editor', onsubmit: function (e) { e.preventDefault(); } }, [
      el('input', { type: 'hidden', id: 'p-id' }),
      el('div', { class: 'editor-grid' }, [
        el('div', { class: 'form-row' }, [
          el('label', { for: 'p-name' }, 'Product Name'),
          el('input', { id: 'p-name', type: 'text', placeholder: 'Oud Royale' }),
          el('p', { class: 'form-error', id: 'p-name-error' }, 'Name is required (min 2 characters)')
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { for: 'p-scent' }, 'Scent Profile'),
          el('input', { id: 'p-scent', type: 'text', placeholder: 'Woody, Spicy' })
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { for: 'p-price' }, 'Price (numbers only)'),
          el('input', { id: 'p-price', type: 'number', step: '0.01', min: '0', placeholder: '150' }),
          el('p', { class: 'form-error', id: 'p-price-error' }, 'Valid price required')
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { for: 'p-category' }, 'Category'),
          el('select', { id: 'p-category' },
            [el('option', { value: '' }, 'None')].concat(
              categories.map(function (c) { return el('option', { value: c.id }, c.name); })
            )
          )
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { for: 'p-photo' }, 'Photo (from device)'),
          el('div', { class: 'photo-row' }, [
            el('input', { id: 'p-photo', type: 'file', accept: 'image/*' }),
            el('img', { id: 'p-photo-preview', class: 'photo-preview', alt: 'Preview', style: { display: 'none' } })
          ])
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { for: 'p-currency' }, 'Currency Symbol'),
          el('input', { id: 'p-currency', type: 'text', value: store.getCurrency(), maxlength: 5 })
        ])
      ]),
      el('div', { class: 'form-row' }, [
        el('label', { for: 'p-desc' }, 'Description'),
        el('textarea', { id: 'p-desc', rows: 2, placeholder: 'A bold oriental blend of oud and amber.' })
      ]),
      el('div', { class: 'form-row' }, [
        el('label', { class: 'checkbox-row' }, [
          el('input', { id: 'p-available', type: 'checkbox', checked: true }),
          el('span', {}, 'Available (show in store)')
        ])
      ]),
      el('div', { class: 'form-actions' }, [
        el('button', { id: 'p-save', type: 'button', class: 'btn-md fill' }, 'Save Product'),
        el('button', { id: 'p-clear', type: 'button', class: 'btn-md outline' }, 'Clear'),
        el('button', {
          id: 'p-load-demo', type: 'button', class: 'btn-md outline',
          style: { marginLeft: 'auto', borderColor: '#2D8B4E', color: '#2D8B4E' }
        }, 'Load Demo Products')
      ])
    ]);
  }

  function renderProductRow(p, currency) {
    var cat = p.categoryId ? store.getCategory(p.categoryId) : null;
    return el('div', { class: 'item-row', dataset: { id: p.id } }, [
      p.imagePath
        ? el('img', { src: p.imagePath, alt: p.name, class: 'item-thumb' })
        : el('div', {
          class: 'item-thumb', style: {
            background: 'linear-gradient(135deg, #1a1a1a, #222222)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '8px'
          }
        }, [el('i', { class: 'fas fa-flask', style: { color: '#333' } })]),
      el('div', { class: 'item-info' }, [
        el('h4', {}, p.name),
        el('p', { class: 'muted' }, [
          formatPrice(p.price, currency),
          p.scent ? ' · ' + p.scent : '',
          cat ? ' · ' + cat.name : '',
          p.available ? '' : ' · hidden'
        ])
      ]),
      el('div', { class: 'item-actions' }, [
        el('button', { class: 'btn-sm outline', onclick: function () { fillProductEditor(p.id); } }, 'Edit'),
        el('button', { class: 'btn-sm outline', style: { borderColor: '#dc2626', color: '#dc2626' }, onclick: function () { deleteProduct(p.id); } }, 'Del')
      ])
    ]);
  }

  function bindProductForm() {
    var saveBtn = document.getElementById('p-save');
    if (saveBtn) saveBtn.addEventListener('click', handleProductSave);
    var clearBtn = document.getElementById('p-clear');
    if (clearBtn) clearBtn.addEventListener('click', clearProductEditor);
    var demoBtn = document.getElementById('p-load-demo');
    if (demoBtn) demoBtn.addEventListener('click', loadDemoProducts);
  }

  function handleProductSave() {
    var id = document.getElementById('p-id').value;
    var name = document.getElementById('p-name').value.trim();
    var scent = document.getElementById('p-scent').value.trim();
    var price = Number(document.getElementById('p-price').value);
    var categoryId = document.getElementById('p-category').value || null;
    var photoFile = document.getElementById('p-photo').files[0];
    var currencyVal = document.getElementById('p-currency').value.trim();
    var valid = true;

    if (!name || name.length < 2) {
      showFormError('p-name', 'p-name-error', 'Name is required (min 2 characters)');
      valid = false;
    } else { hideFormError('p-name', 'p-name-error'); }

    if (isNaN(price) || price < 0) {
      showFormError('p-price', 'p-price-error', 'Valid price required');
      valid = false;
    } else { hideFormError('p-price', 'p-price-error'); }

    if (!valid) return;

    // Save currency if changed.
    if (currencyVal) store.saveCurrency(currencyVal);

    var persist = function (photoData) {
      var payload = {
        name: name,
        scent: scent,
        price: price,
        categoryId: categoryId,
        description: document.getElementById('p-desc').value.trim(),
        available: document.getElementById('p-available').checked
      };
      if (photoData) payload.imagePath = photoData;

      var saved;
      if (id) {
        var existing = store.getProduct(id);
        if (!photoData && existing && existing.imagePath) payload.imagePath = existing.imagePath;
        saved = store.updateProduct(id, payload);
      } else {
        saved = store.addProduct(payload);
      }

      if (saved) {
        clearProductEditor();
        doRender();
      } else {
        flashStatus('Save failed. Storage full?');
      }
    };

    if (photoFile) {
      fileToDataURL(photoFile)
        .then(function (dataUrl) { return compressImage(dataUrl, 400); })
        .then(persist)
        .catch(function () { flashStatus('Could not read image.'); });
    } else {
      persist(null);
    }
  }

  function fillProductEditor(id) {
    var p = store.getProduct(id);
    if (!p) return;
    document.getElementById('p-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-scent').value = p.scent || '';
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-category').value = p.categoryId || '';
    document.getElementById('p-desc').value = p.description || '';
    document.getElementById('p-available').checked = !!p.available;
    document.getElementById('p-photo').value = '';

    var preview = document.getElementById('p-photo-preview');
    if (preview) {
      if (p.imagePath) { preview.src = p.imagePath; preview.style.display = 'block'; }
      else { preview.style.display = 'none'; }
    }
    document.getElementById('p-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearProductEditor() {
    ['p-id', 'p-name', 'p-scent', 'p-price', 'p-desc', 'p-photo'].forEach(function (idEl) {
      var node = document.getElementById(idEl);
      if (node) node.value = '';
    });
    var cb = document.getElementById('p-available');
    if (cb) cb.checked = true;
    var cat = document.getElementById('p-category');
    if (cat) cat.value = '';
    var preview = document.getElementById('p-photo-preview');
    if (preview) preview.style.display = 'none';
  }

  function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    store.deleteProduct(id);
    doRender();
  }

  function loadDemoProducts() {
    if (!confirm('This will add 6 demo products. Continue?')) return;
    var demos = store.getDemoProducts();
    var existing = store.getProducts();
    if (existing.length > 0) {
      if (!confirm('You already have ' + existing.length + ' product(s). Add 6 more demos alongside them?')) return;
    }
    demos.forEach(function (d) { store.addProduct(d); });
    doRender();
  }

  function compressImage(dataUrl, maxDim) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { reject(new Error('Image load failed')); };
      img.src = dataUrl;
    });
  }

  /* ====================================================================
     CATEGORIES TAB
     ==================================================================== */

  function renderCategoriesPanel() {
    var categories = store.getCategories();
    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel-title' }, 'Categories (' + categories.length + ')'),
      el('div', { class: 'panel-body' }, [
        renderCategoryEditor(),
        el('div', { id: 'categories-list', class: 'items-list' },
          categories.length
            ? categories.map(function (c) { return renderCategoryRow(c); })
            : [el('p', { class: 'muted' }, 'No categories yet.')]
        )
      ])
    ]);
  }

  function renderCategoryEditor() {
    return el('form', { id: 'cat-form', class: 'item-editor', onsubmit: function (e) { e.preventDefault(); } }, [
      el('input', { type: 'hidden', id: 'c-id' }),
      el('div', { class: 'editor-grid' }, [
        el('div', { class: 'form-row' }, [
          el('label', { for: 'c-name' }, 'Category Name'),
          el('input', { id: 'c-name', type: 'text', placeholder: 'Eau de Parfum' }),
          el('p', { class: 'form-error', id: 'c-name-error' }, 'Name is required')
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { for: 'c-sort' }, 'Sort Order (lower = first)'),
          el('input', { id: 'c-sort', type: 'number', min: '0', value: '0' })
        ])
      ]),
      el('div', { class: 'form-row' }, [
        el('label', { for: 'c-desc' }, 'Description'),
        el('input', { id: 'c-desc', type: 'text', placeholder: 'Long-lasting signature scents' })
      ]),
      el('div', { class: 'form-actions' }, [
        el('button', { id: 'c-save', type: 'button', class: 'btn-md fill' }, 'Save Category'),
        el('button', { id: 'c-clear', type: 'button', class: 'btn-md outline' }, 'Clear')
      ])
    ]);
  }

  function renderCategoryRow(c) {
    return el('div', { class: 'category-row', dataset: { id: c.id } }, [
      el('div', {}, [
        el('h4', {}, c.name),
        el('p', { class: 'muted' }, (c.description || 'No description') + ' · Order: ' + c.sortOrder)
      ]),
      el('div', { class: 'item-actions' }, [
        el('button', { class: 'btn-sm outline', onclick: function () { fillCategoryEditor(c.id); } }, 'Edit'),
        el('button', { class: 'btn-sm outline', style: { borderColor: '#dc2626', color: '#dc2626' }, onclick: function () { deleteCategory(c.id); } }, 'Del')
      ])
    ]);
  }

  function bindCategoryForm() {
    var saveBtn = document.getElementById('c-save');
    if (saveBtn) saveBtn.addEventListener('click', handleCategorySave);
    var clearBtn = document.getElementById('c-clear');
    if (clearBtn) clearBtn.addEventListener('click', clearCategoryEditor);
  }

  function handleCategorySave() {
    var id = document.getElementById('c-id').value;
    var name = document.getElementById('c-name').value.trim();
    var valid = true;

    if (!name || name.length < 2) {
      showFormError('c-name', 'c-name-error', 'Name is required');
      valid = false;
    } else { hideFormError('c-name', 'c-name-error'); }

    if (!valid) return;

    var payload = {
      name: name,
      description: document.getElementById('c-desc').value.trim(),
      sortOrder: parseInt(document.getElementById('c-sort').value) || 0
    };

    var saved;
    if (id) {
      saved = store.updateCategory(id, payload);
    } else {
      saved = store.addCategory(payload);
    }

    if (saved) { clearCategoryEditor(); doRender(); }
    else { flashStatus('Save failed.'); }
  }

  function fillCategoryEditor(id) {
    var c = store.getCategory(id);
    if (!c) return;
    document.getElementById('c-id').value = c.id;
    document.getElementById('c-name').value = c.name;
    document.getElementById('c-desc').value = c.description || '';
    document.getElementById('c-sort').value = c.sortOrder || 0;
    document.getElementById('c-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearCategoryEditor() {
    ['c-id', 'c-name', 'c-desc', 'c-sort'].forEach(function (idEl) {
      var node = document.getElementById(idEl);
      if (node) node.value = '';
    });
    var sort = document.getElementById('c-sort');
    if (sort) sort.value = '0';
  }

  function deleteCategory(id) {
    if (!confirm('Delete this category? Products in this category will become uncategorized.')) return;
    store.deleteCategory(id);
    doRender();
  }

  /* ====================================================================
     LANDING CONTENT TAB
     ==================================================================== */

  var LANDING_FIELDS = [
    { key: 'hero_title', label: 'Hero Title', type: 'text', placeholder: 'Luxury Scents, Redefined.' },
    { key: 'hero_subtitle', label: 'Hero Subtitle', type: 'text', placeholder: 'Handcrafted perfumes and accessories...' },
    { key: 'about_heading', label: 'About Heading', type: 'text', placeholder: 'About Morbi' },
    { key: 'about_text_1', label: 'About Paragraph 1', type: 'textarea', placeholder: 'Morbi is a creative entrepreneur...' },
    { key: 'about_text_2', label: 'About Paragraph 2', type: 'textarea', placeholder: 'Every Morcenzs bottle is curated...' },
    { key: 'featured_heading', label: 'Featured Section Heading', type: 'text', placeholder: 'Featured Scents' },
    { key: 'featured_sub', label: 'Featured Section Subtitle', type: 'text', placeholder: 'A selection from the Morcenzs collection.' },
    { key: 'footer_text', label: 'Footer Text', type: 'text', placeholder: 'All rights reserved.' }
  ];

  function renderLandingPanel() {
    var landing = store.getLanding();
    return el('section', { class: 'panel' }, [
      el('h3', { class: 'panel-title' }, 'Landing Page Content'),
      el('div', { class: 'panel-body' }, [
        el('p', { class: 'muted' }, 'Edit the text that appears on the homepage. Changes are saved individually.'),
        LANDING_FIELDS.map(function (f) {
          var input = f.type === 'textarea'
            ? el('textarea', { id: 'lc-' + f.key, rows: 3, placeholder: f.placeholder }, landing[f.key] || '')
            : el('input', { id: 'lc-' + f.key, type: 'text', placeholder: f.placeholder, value: landing[f.key] || '' });
          return el('div', { class: 'landing-section-editor' }, [
            el('h4', {}, f.label),
            input,
            el('button', {
              class: 'btn-md outline', style: { marginTop: '8px', fontSize: '13px', padding: '6px 16px' },
              onclick: function () { saveLandingField(f.key); }
            }, 'Save')
          ]);
        }),
        el('div', { class: 'form-actions', style: { marginTop: '20px' } }, [
          el('button', {
            class: 'btn-md outline', style: { borderColor: '#dc2626', color: '#dc2626' },
            onclick: function () { if (confirm('Reset ALL data to defaults?')) { store.resetAll(); doRender(); } }
          }, 'Reset Everything')
        ])
      ])
    ]);
  }

  function bindLandingForm() {
    // Each field has its own save button bound inline via onclick.
  }

  function saveLandingField(key) {
    var input = document.getElementById('lc-' + key);
    if (!input) return;
    var patch = {};
    patch[key] = input.value.trim();
    var result = store.saveLanding(patch);
    if (result) {
      flashStatus('Saved.');
    } else {
      flashStatus('Save failed.');
    }
  }

  /* ====================================================================
     SHARED HELPERS
     ==================================================================== */

  function showFormError(inputId, errorId, message) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) input.classList.add('invalid');
    if (error) { error.textContent = message; error.classList.add('show'); }
  }

  function hideFormError(inputId, errorId) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) input.classList.remove('invalid');
    if (error) { error.classList.remove('show'); }
  }

  function flashStatus(msg) {
    // Find any visible status text element or fall back to alert.
    var statusEls = document.querySelectorAll('.status-text');
    var span = statusEls.length ? statusEls[0] : null;
    if (span) {
      span.textContent = msg;
      span.style.color = msg.startsWith('Saved') ? '#2D8B4E' : '#dc2626';
      setTimeout(function () { if (span.textContent === msg) span.textContent = ''; }, 3000);
    } else {
      alert(msg);
    }
  }

  global.MorbiDashboard = { render: render };
})(window);

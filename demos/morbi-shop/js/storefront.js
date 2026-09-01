/**
 * storefront.js — Morcenzs storefront at #/morcenzs
 *
 * Product grid with category filter, cart, and checkout UI shell.
 * Cart is page-scoped (not persisted across page loads — KISS for pre-phase).
 */
(function (global) {
  'use strict';

  var ui = global.ChowMenuUI;
  var el = ui.el, clear = ui.clear, formatPrice = ui.formatPrice;
  var store = global.MorbiStore;
  var router = global.ChowMenuRouter;

  var ROOT_ID = 'app-root';
  var cart = []; // [{ id, name, price, qty, scent }]
  var activeCategory = 'all';

  /* ---- Public render ------------------------------------------------- */

  function render() {
    var root = document.getElementById(ROOT_ID);
    clear(root);
    cart = [];
    activeCategory = 'all';

    var products = store.getAvailableProducts();
    var categories = store.getCategories();
    var currency = store.getCurrency();

    doRender(products, categories, currency);
  }

  function doRender(products, categories, currency) {
    var root = document.getElementById(ROOT_ID);
    clear(root);

    // Filter products by active category.
    var filtered = activeCategory === 'all'
      ? products
      : products.filter(function (p) { return p.categoryId === activeCategory; });

    root.appendChild(
      el('div', { class: 'container' }, [
        renderStoreHeader(),
        el('div', { class: 'main-body' }, [
          el('div', { class: 'main-menu' }, [
            renderCategoryBar(categories),
            renderProductGrid(filtered, currency)
          ]),
          el('div', { class: 'order' }, [
            renderCartSidebar(currency)
          ])
        ]),
        // Mobile cart FAB + popup
        el('button', {
          class: 'cart-fab', id: 'cart-fab',
          onclick: function () { toggleMobileCart(true); }
        }, [
          el('i', { class: 'fas fa-shopping-bag' }),
          el('span', { class: 'cart-fab-badge', id: 'cart-fab-badge' }, '0')
        ]),
        el('div', { class: 'cart-overlay', id: 'cart-overlay', onclick: function () { toggleMobileCart(false); } }),
        el('div', { class: 'cart-popup', id: 'cart-popup' }, [
          renderCartPopupContent(currency)
        ]),
        // Checkout modal (UI shell only — no Paystack yet)
        el('div', { class: 'checkout-modal', id: 'checkout-modal' }, [
          renderCheckoutCard(currency)
        ])
      ])
    );

    bindGridButtons(filtered, currency);
  }

  /* ---- Store header -------------------------------------------------- */

  function renderStoreHeader() {
    return el('header', { class: 'storefront-header' }, [
      el('div', {}, [
        el('div', { class: 'storefront-brand' }, 'Morcenzs'),
        el('div', { class: 'storefront-tagline' }, 'Luxury Scents, Redefined.')
      ]),
      el('div', {}, [
        el('button', {
          class: 'btn-sm outline', style: { fontSize: '13px', padding: '6px 12px', width: 'auto', height: 'auto' },
          onclick: function () { router.navigate('#/'); }
        }, 'morbi.shop'),
        el('button', {
          class: 'btn-sm outline', style: { fontSize: '13px', padding: '6px 12px', width: 'auto', height: 'auto', marginLeft: '8px' },
          onclick: function () { router.navigate('#/dashboard'); }
        }, 'Admin')
      ])
    ]);
  }

  /* ---- Category filter bar ------------------------------------------- */

  function renderCategoryBar(categories) {
    var items = [el('li', {}, [
      el('button', {
        class: 'nav-item' + (activeCategory === 'all' ? ' active' : ''),
        onclick: function () { activeCategory = 'all'; refreshView(); }
      }, 'All')
    ])].concat(categories.map(function (cat) {
      return el('li', {}, [
        el('button', {
          class: 'nav-item' + (activeCategory === cat.id ? ' active' : ''),
          onclick: function () { activeCategory = cat.id; refreshView(); }
        }, cat.name)
      ]);
    }));
    return el('nav', { class: 'category' }, [el('ul', { class: 'nav-links category' }, items)]);
  }

  function refreshView() {
    var products = store.getAvailableProducts();
    var categories = store.getCategories();
    var currency = store.getCurrency();
    doRender(products, categories, currency);
  }

  /* ---- Product grid -------------------------------------------------- */

  function renderProductGrid(products, currency) {
    if (!products.length) {
      return el('div', { class: 'storefront-empty' }, [
        el('i', { class: 'fas fa-flask' }),
        el('h3', {}, 'No products available'),
        el('p', {}, 'Check back soon or browse our featured collection on the homepage.')
      ]);
    }
    return el('div', { class: 'menus' }, products.map(function (p) {
      var inCart = cart.find(function (c) { return c.id === p.id; });
      var cat = p.categoryId ? store.getCategory(p.categoryId) : null;
      return el('div', { class: 'menu', dataset: { id: p.id } }, [
        el('div', {
          style: {
            width: '100%', height: '200px', overflow: 'hidden'
          }
        }, [
          p.imagePath
            ? el('img', { src: p.imagePath, alt: p.name })
            : el('div', {
              style: {
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, #1a1a1a, #222222)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }
            }, [el('i', { class: 'fas fa-flask', style: { fontSize: '48px', color: '#333' } })])
        ]),
        el('div', { class: 'desc-item' }, [
          el('h3', { class: 'card-name' }, p.name),
          p.scent ? el('p', { class: 'card-scent' }, p.scent) : null,
          cat ? el('p', { class: 'small', style: { color: '#666' } }, cat.name) : null,
          el('p', { class: 'card-desc' }, p.description || ''),
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' } }, [
            el('p', { class: 'card-price' }, formatPrice(p.price, currency)),
            el('button', {
              class: 'card-add-btn' + (inCart ? ' active' : ''),
              dataset: { id: p.id },
              onclick: function () { addToCart(p.id); }
            }, inCart ? '\u2713' : '+')
          ])
        ])
      ]);
    }));
  }

  function bindGridButtons(products, currency) {
    // Grid buttons are bound via inline onclick in renderProductGrid.
    // Nothing extra needed here.
  }

  /* ---- Cart logic ---------------------------------------------------- */

  function addToCart(productId) {
    var product = store.getProduct(productId);
    if (!product) return;
    var existing = cart.find(function (c) { return c.id === productId; });
    if (existing) {
      existing.qty++;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        scent: product.scent || '',
        price: product.price,
        qty: 1
      });
    }
    refreshView();
  }

  function updateQty(productId, delta) {
    var item = cart.find(function (c) { return c.id === productId; });
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(function (c) { return c.id !== productId; });
    }
    refreshView();
  }

  function removeFromCart(productId) {
    cart = cart.filter(function (c) { return c.id !== productId; });
    refreshView();
  }

  function cartTotal() {
    return cart.reduce(function (sum, c) { return sum + c.price * c.qty; }, 0);
  }

  function cartCount() {
    return cart.reduce(function (sum, c) { return sum + c.qty; }, 0);
  }

  /* ---- Cart sidebar (desktop) ---------------------------------------- */

  function renderCartSidebar(currency) {
    var count = cartCount();
    var total = cartTotal();
    return el('div', { class: 'order-list' }, [
      el('h3', {}, 'Cart (' + count + ')'),
      el('div', { class: 'order-inner' },
        cart.length
          ? cart.map(function (c) {
              return el('div', { class: 'order-item' }, [
                el('div', {}, [
                  el('strong', {}, c.name),
                  c.scent ? el('br') : null,
                  c.scent ? el('span', { class: 'small' }, c.scent) : null
                ]),
                el('div', {}, [
                  el('button', { class: 'btn-sm min', onclick: function () { updateQty(c.id, -1); } }),
                  el('span', { class: 'price', style: { margin: '0 8px' } }, c.qty + ' x ' + formatPrice(c.price, currency)),
                  el('button', { class: 'btn-sm max', onclick: function () { updateQty(c.id, 1); } }),
                  el('span', { class: 'remove', onclick: function () { removeFromCart(c.id); } }, 'remove')
                ])
              ]);
            })
          : [el('div', { class: 'order-null' }, [
              el('i', { class: 'fas fa-shopping-bag' }),
              el('p', {}, 'Your cart is empty')
            ])]
      ),
      el('hr'),
      el('div', { class: 'checkout' }, [
        el('div', { class: 'checkout-detail', id: 'total' }, [
          el('h3', {}, 'Total'),
          el('h3', {}, formatPrice(total, currency))
        ]),
        el('button', {
          class: 'btn-md fill', style: { width: '100%', marginTop: '12px' },
          disabled: count === 0,
          onclick: function () { openCheckout(); }
        }, 'Checkout')
      ])
    ]);
  }

  /* ---- Mobile cart popup --------------------------------------------- */

  function toggleMobileCart(open) {
    var overlay = document.getElementById('cart-overlay');
    var popup = document.getElementById('cart-popup');
    if (!overlay || !popup) return;
    if (open) {
      overlay.classList.add('open');
      popup.classList.add('open');
    } else {
      overlay.classList.remove('open');
      popup.classList.remove('open');
    }
  }

  function renderCartPopupContent(currency) {
    var count = cartCount();
    var total = cartTotal();
    return [
      el('div', { class: 'cart-popup-header' }, [
        el('h3', {}, 'Cart (' + count + ')'),
        el('button', { class: 'cart-popup-close', onclick: function () { toggleMobileCart(false); } }, '\u00D7')
      ]),
      el('div', { class: 'cart-popup-body' },
        cart.length
          ? cart.map(function (c) {
              return el('div', { class: 'order-item' }, [
                el('div', {}, [
                  el('strong', {}, c.name),
                  c.scent ? el('br') : null,
                  c.scent ? el('span', { class: 'small' }, c.scent) : null
                ]),
                el('div', {}, [
                  el('button', { class: 'btn-sm min', onclick: function () { updateQty(c.id, -1); } }),
                  el('span', { class: 'price', style: { margin: '0 8px' } }, c.qty + ' x ' + formatPrice(c.price, currency)),
                  el('button', { class: 'btn-sm max', onclick: function () { updateQty(c.id, 1); } }),
                  el('span', { class: 'remove', onclick: function () { removeFromCart(c.id); } }, 'remove')
                ])
              ]);
            })
          : [el('p', { class: 'muted', style: { textAlign: 'center', padding: '40px 0' } }, 'Your cart is empty.')]
      ),
      el('div', { class: 'cart-popup-footer' }, [
        el('div', { class: 'cart-popup-total' }, [
          el('span', {}, 'Total'),
          el('span', {}, formatPrice(total, currency))
        ]),
        el('button', {
          class: 'btn-md fill',
          disabled: count === 0,
          onclick: function () { openCheckout(); }
        }, 'Checkout')
      ])
    ];
  }

  /* ---- Checkout modal (UI shell — no Paystack yet) ------------------- */

  function openCheckout() {
    var modal = document.getElementById('checkout-modal');
    if (modal) modal.classList.add('open');
    // Close mobile cart if open.
    toggleMobileCart(false);
  }

  function renderCheckoutCard(currency) {
    var count = cartCount();
    var total = cartTotal();
    return el('div', { class: 'checkout-card' }, [
      el('h3', {}, 'Complete Your Order'),
      el('div', { class: 'checkout-summary' }, [
        el('p', {}, count + ' item' + (count !== 1 ? 's' : '') + ' in your cart'),
        el('p', {}, ['Total: ', el('strong', {}, formatPrice(total, currency))])
      ]),
      el('div', { class: 'form-row' }, [
        el('label', { for: 'co-name' }, 'Full Name'),
        el('input', { id: 'co-name', type: 'text', placeholder: 'Morbi' })
      ]),
      el('div', { class: 'form-row' }, [
        el('label', { for: 'co-phone' }, 'Phone (MoMo number)'),
        el('input', { id: 'co-phone', type: 'tel', placeholder: '233XXXXXXXXX' })
      ]),
      el('div', { class: 'form-row' }, [
        el('label', { for: 'co-email' }, 'Email (optional)'),
        el('input', { id: 'co-email', type: 'email', placeholder: 'you@email.com' })
      ]),
      el('p', { class: 'muted', style: { marginTop: '12px', fontSize: '12px' } },
        'Payment via Mobile Money (MoMo) will be available soon.'),
      el('div', { class: 'checkout-actions' }, [
        el('button', {
          class: 'btn-md outline',
          onclick: function () { closeCheckout(); }
        }, 'Cancel'),
        el('button', {
          class: 'btn-md fill',
          disabled: true,
          style: { opacity: 0.5 }
        }, 'Pay with MoMo (Coming Soon)')
      ])
    ]);
  }

  function closeCheckout() {
    var modal = document.getElementById('checkout-modal');
    if (modal) modal.classList.remove('open');
  }

  global.MorbiStorefront = { render: render };
})(window);

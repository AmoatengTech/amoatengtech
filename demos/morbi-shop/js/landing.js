/**
 * landing.js — Morbi's personal landing page with Morcenzs hero.
 *
 * Sections:
 *   1. Header (nav: logo, links to store + admin)
 *   2. Hero (black bg, gold text, green wave bottom) — Morcenzs featured
 *   3. About Morbi (white bg, black text)
 *   4. Featured Scents (black bg, product cards from store)
 *   5. Footer (black bg)
 *
 * No pricing table — single vendor site.
 */
(function (global) {
  'use strict';

  var ui = global.ChowMenuUI;
  var el = ui.el, clear = ui.clear;
  var router = global.ChowMenuRouter;
  var store = global.MorbiStore;

  function render() {
    var root = document.getElementById('app-root');
    clear(root);

    var landing = store.getLanding();
    var featured = store.getFeaturedProducts() || [];
    var currency = store.getCurrency();

    root.appendChild(
      el('div', { class: 'landing' }, [
        renderHeader(),
        renderHero(landing),
        el('div', { class: 'wave-green-bottom' }),
        renderAbout(landing),
        el('div', { style: { height: '60px', backgroundColor: '#2D8B4E' } }),
        renderFeatured(landing, featured, currency),
        renderFooter(landing)
      ])
    );
  }

  /* ---- Header ------------------------------------------------------- */

  function renderHeader() {
    return el('header', { class: 'landing-header' }, [
      el('div', { class: 'landing-logo' }, 'morbi.shop'),
      el('div', { class: 'landing-nav' }, [
        el('button', {
          class: 'btn-md outline',
          onclick: function () { router.navigate('#/morcenzs'); }
        }, 'Shop Morcenzs'),
        el('button', {
          class: 'btn-md outline',
          style: { borderColor: '#333', color: '#a0a0a0' },
          onclick: function () { router.navigate('#/dashboard'); }
        }, 'Admin')
      ])
    ]);
  }

  /* ---- Hero section ------------------------------------------------- */

  function renderHero(landing) {
    return el('section', { class: 'landing-hero' }, [
      el('div', { class: 'hero-copy' }, [
        el('p', {
          class: 'muted',
          style: {
            fontSize: '14px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '12px'
          }
        }, 'Morcenzs by Morbi'),
        el('h1', { class: 'serif' }, landing.hero_title || 'Luxury Scents Redefined'),
        el('p', {}, landing.hero_subtitle || 'Handcrafted perfumes and accessories for those who leave an impression.'),
        el('div', { class: 'hero-cta' }, [
          el('button', {
            class: 'btn-md fill',
            onclick: function () { router.navigate('#/morcenzs'); }
          }, 'Browse Collection'),
          el('button', {
            class: 'btn-md outline',
            onclick: function () {
              var target = document.querySelector('.landing-featured');
              if (target) target.scrollIntoView({ behavior: 'smooth' });
            }
          }, 'View Featured')
        ])
      ]),
      el('div', { class: 'hero-art' }, [
        el('div', { class: 'hero-card' }, [
          el('div', {
            style: {
              width: '100%',
              height: '200px',
              background: 'linear-gradient(135deg, #1a1a1a, #2D8B4E)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }
          }, [
            el('i', {
              class: 'fas fa-flask',
              style: { fontSize: '64px', color: '#D4AF37' }
            })
          ]),
          el('div', { class: 'hero-card-body' }, [
            el('h3', { class: 'hero-card-name' }, 'Morcenzs Signature'),
            el('div', { class: 'hero-card-price' }, 'From GHS120'),
            el('p', { class: 'hero-card-desc' }, 'Bold. Unforgettable. Yours.')
          ])
        ])
      ])
    ]);
  }

  /* ---- About section ------------------------------------------------ */

  function renderAbout(landing) {
    return el('section', { class: 'landing-about' }, [
      el('div', { class: 'landing-about-inner' }, [
        el('div', {}, [
          el('h2', { class: 'serif' }, landing.about_heading || 'About Morbi'),
          el('p', {}, landing.about_text_1 || 'Morbi is a creative entrepreneur and the founder of Morcenzs.'),
          el('p', {}, landing.about_text_2 || 'Every Morcenzs bottle is curated with care from bold signatures to subtle everyday essentials.')
        ]),
        el('div', { style: { textAlign: 'center' } }, [
          el('div', {
            style: {
              width: '280px',
              height: '350px',
              margin: '0 auto',
              borderRadius: '14px',
              background: 'linear-gradient(180deg, #D4AF37 0%, #2D8B4E 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }
          }, [
            el('i', {
              class: 'fas fa-user',
              style: { fontSize: '80px', color: '#000000', opacity: 0.6 }
            })
          ])
        ])
      ])
    ]);
  }

  /* ---- Featured products --------------------------------------------- */

  function renderFeatured(landing, featured, currency) {
    var cards = featured.length ? featured.map(function (p) {
      var cat = p.categoryId ? store.getCategory(p.categoryId) : null;
      return el('div', { class: 'menu' }, [
        el('div', {
          style: {
            width: '100%',
            height: '200px',
            background: p.imagePath
              ? 'url(' + p.imagePath + ') center/cover'
              : 'linear-gradient(135deg, #1a1a1a, #222222)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }
        }, p.imagePath
          ? null
          : [el('i', { class: 'fas fa-flask', style: { fontSize: '48px', color: '#333' } })]
        ),
        el('div', { class: 'desc-item' }, [
          el('h3', { class: 'card-name' }, p.name),
          p.scent ? el('p', { class: 'card-scent' }, p.scent) : null,
          el('p', { class: 'card-price' }, ui.formatPrice(p.price, currency))
        ])
      ]);
    }) : [
      el('p', {
        class: 'muted',
        style: { gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0' }
      }, 'No products yet. Add some in the admin panel.')
    ];

    return el('section', { class: 'landing-featured' }, [
      el('h2', { class: 'serif' }, landing.featured_heading || 'Featured Scents'),
      el('p', { class: 'muted' }, landing.featured_sub || 'A selection from the Morcenzs collection.'),
      el('div', { class: 'featured-grid' }, cards),
      el('div', { class: 'featured-cta' }, [
        el('button', {
          class: 'btn-md fill',
          onclick: function () { router.navigate('#/morcenzs'); }
        }, 'View Full Collection')
      ])
    ]);
  }

  /* ---- Footer ------------------------------------------------------- */

  function renderFooter(landing) {
    return el('footer', { class: 'landing-footer' }, [
      el('p', {}, [
        el('span', { class: 'gold' }, 'Morcenzs'),
        ' by Morbi \u00B7 ',
        landing.footer_text || 'All rights reserved.'
      ])
    ]);
  }

  global.MorbiLanding = { render: render };
})(window);

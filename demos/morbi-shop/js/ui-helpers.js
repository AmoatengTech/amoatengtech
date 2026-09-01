/**
 * ui-helpers.js. Single Responsibility: DRY DOM creation utilities.
 *
 * Replaces the boilerplate's `makeElement` / `addClassElement` switch-statement
 * mess with one small `el()` function. KISS: no abstraction layers, no factories
 * of factories. just a function that builds a DOM node from a spec.
 *
 * Usage:
 *   el('div', { class: 'menu', dataset: { menu: 'beef-burg' } }, [
 *     el('img', { src: 'img/beef.png', alt: 'beef' }),
 *     el('h2', { class: 'price' }, 'GH¢4.7'),
 *     el('button', { type: 'button', onclick: () => alert('hi') }, '+')
 *   ])
 */
(function (global) {
  'use strict';

  /**
   * Create a DOM element.
   * @param {string} tag
   * @param {Object} [props]            attributes / handlers / dataset
   * @param {Array|Node|string} [children]
   * @returns {HTMLElement}
   */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (value == null) return;
        if (key === 'class' || key === 'className') {
          node.className = value;
        } else if (key === 'dataset') {
          Object.keys(value).forEach((dk) => {
            node.dataset[dk] = value[dk];
          });
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(node.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'html') {
          node.innerHTML = value;
        } else if (value === true) {
          node.setAttribute(key, '');
        } else if (value === false) {
          // ignore
        } else {
          node.setAttribute(key, value);
        }
      });
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children == null) return;
    if (!Array.isArray(children)) {
      children = [children];
    }
    children.forEach((child) => {
      if (child == null || child === false) return;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        node.appendChild(child);
      } else {
        // Assume it's a spec object; recurse.
        node.appendChild(el(child.tag || 'div', child.props, child.children));
      }
    });
  }

  /** Empty a node. DRY replacement for `while (x.firstChild) x.removeChild(...)`. */
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /** Format a price using the vendor's currency symbol. */
  function formatPrice(amount, currency) {
    const sym = currency || global.ChowMenuStore.DEFAULT_CURRENCY;
    const num = Number(amount) || 0;
    // Truncate to 2 decimals without forcing trailing zeros.
    const str = num.toFixed(2).replace(/\.00$/, '');
    return sym + str;
  }

  /** Convert a File to a base64 data URL (used by the photo upload). */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** Generate a URL-safe slug from any text. */
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Format a date string for display.
   * BUG-24 fix: Consolidated from png-export.js + public-menu.js into one place.
   * - YYYY-MM-DD → "Friday, 28 August 2026"
   * - Any other string → returned as-is (vendor may type "Friday Lunch")
   * - Empty/falsy → empty string
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    return String(dateStr);
  }

  global.ChowMenuUI = { el, clear, formatPrice, fileToDataURL, slugify, formatDate };
})(window);

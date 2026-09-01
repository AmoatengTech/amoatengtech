/**
 * router.js. Single Responsibility: hash-based routing.
 *
 * KISS: a route table is just an object { 'pattern': handler }. No regex
 * magic, no nested matchers. Patterns support a single `:param` segment.
 * To add a new page, register one entry. that's the Open-Closed principle
 * at work without over-engineering.
 *
 * Examples:
 *   router.register('#/dashboard',   showDashboard)
 *   router.register('#/m/:slug',     showPublicMenu)
 *   router.register('#/subscribe',   showSubscribe)
 *   router.default(showLanding)
 *   router.start()
 */
(function (global) {
  'use strict';

  const routes = [];
  let defaultHandler = null;

  function register(pattern, handler) {
    routes.push({ pattern: pattern, handler: handler });
  }

  function match(hash) {
    // Normalise: drop the leading "#/" or "#" so we get the path segments.
    // Examples:
    //   '#/m/ama-kitchen' -> ['m', 'ama-kitchen']
    //   '#/dashboard'      -> ['dashboard']
    //   '#/' or '#/        -> []
    //   '#unknown'         -> []  (no slash. also treated as landing)
    const stripped = hash.replace(/^#\/?/, '');
    const parts = stripped.split('/').filter(Boolean);

    for (const route of routes) {
      // route.pattern looks like '#/m/:slug'. Drop the '#/' prefix and split.
      const routeSegs = route.pattern.replace(/^#\/?/, '').split('/').filter(Boolean);
      if (routeSegs.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < routeSegs.length; i++) {
        const seg = routeSegs[i];
        const actual = parts[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(actual);
        } else if (seg !== actual) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params: params };
    }
    return null;
  }

  function navigate(hash) {
    if (global.location.hash === hash) {
      // Force re-dispatch if the user clicks the same link twice.
      dispatch();
    } else {
      global.location.hash = hash;
    }
  }

  function dispatch() {
    const hash = global.location.hash || '#/';
    const matched = match(hash);
    if (matched) {
      matched.handler(matched.params);
    } else if (defaultHandler) {
      defaultHandler({ hash: hash });
    } else {
      console.warn('[ChowMenu] No route matched and no default registered for', hash);
    }
  }

  function start() {
    global.addEventListener('hashchange', dispatch);
    // Fire once on boot so the initial route renders.
    dispatch();
  }

  function default_(handler) {
    defaultHandler = handler;
  }

  global.ChowMenuRouter = {
    register: register,
    default: default_,
    navigate: navigate,
    start: start
  };
})(window);

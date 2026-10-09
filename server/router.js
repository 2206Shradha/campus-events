'use strict';

/**
 * Tiny router. A route is: method + path pattern ("/api/events/:id") + a list of
 * handlers. Handlers run in order; the first one that returns a value ends the
 * request (middleware simply returns undefined to continue).
 */
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, ...handlers) {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handlers });
  }

  get(p, ...h) { this.add('GET', p, ...h); }
  post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); }
  patch(p, ...h) { this.add('PATCH', p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }

  match(method, pathname) {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route, params, pathMatched };
    }
    return { route: null, params: {}, pathMatched };
  }
}

module.exports = Router;

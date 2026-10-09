// Shared client state, kept out of main.js so pages can import it without circular imports.
import { session } from './api.js';

export const state = { user: null };

export function navigate(path) { location.hash = `#${path}`; }

export function setUser(token, user) {
  session.token = token;
  state.user = user;
  window.dispatchEvent(new Event('user-changed'));
}

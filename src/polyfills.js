// Simple polyfill without buffer dependency
if (typeof window !== 'undefined') {
  window.global = window.global || window;
  if (!window.process) {
    window.process = { env: {} };
  }
}
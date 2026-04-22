import '@testing-library/jest-dom/vitest';

// jsdom does not implement HTMLMediaElement.play / pause; stub them so
// components using <audio>/new Audio() don't crash under test.
window.HTMLMediaElement.prototype.play = function () {
  return Promise.resolve();
};
window.HTMLMediaElement.prototype.pause = function () {};

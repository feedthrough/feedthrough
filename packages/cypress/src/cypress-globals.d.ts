// Minimal Cypress globals needed for type checking.
// The full types are provided by the consumer's cypress installation.

declare const Cypress: {
  on(event: "window:before:load", fn: (win: Window & typeof globalThis) => void): void;
};

interface Window {
  __feedthroughOptions?: import("@feedthrough/core").BridgeOptions;
  __feedthrough?: import("@feedthrough/core").FeedthroughBridge;
}

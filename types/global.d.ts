declare global {
  interface Window {
    __DESO_IFRAME__: WindowProxy | null;
  }
}
export {};

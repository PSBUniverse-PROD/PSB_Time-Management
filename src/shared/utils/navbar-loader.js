export const NAVBAR_LOADER_START_EVENT = "psb:navbar-loader-start";
export const NAVBAR_LOADER_FINISH_EVENT = "psb:navbar-loader-finish";

export function startNavbarLoader() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAVBAR_LOADER_START_EVENT));
}

export function finishNavbarLoader() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAVBAR_LOADER_FINISH_EVENT));
}

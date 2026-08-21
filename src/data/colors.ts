export const COLORS = {
  void: "#0a0a1c",
  wallDark: "#1d1d3e",
  wallMid: "#30306a",
  wallHi: "#5d5dae",
  wallEdge: "#8f8fdb",
  floorDark: "#26264a",
  floorMid: "#3a3a6e",
  floorHi: "#54548f",
  floorWarm: "#6b5d8f",
  exit: "#ffd45c",
  text: "#f7f3d7",
  red: "#ff5a5a",
  green: "#69e081",
  blue: "#5ca8ff",
  purple: "#b86cff",
  yellow: "#ffd45c",
  orange: "#ff9d4f",
  black: "#070714",
  white: "#fff6d6",
  shadow: "#0a0a1c",
  gold: "#ffd45c"
};

// Accessibility palettes: colorblind-friendly remaps of the semantic status
// colors (red/green/blue/purple/orange/gold). Text/background stay stable so
// dungeon readability is preserved.
export const COLORBLIND_PALETTES = {
  deuteranopia: {
    red: "#ff7a5a",
    green: "#2ab8c8",
    blue: "#7aa8ff",
    purple: "#c97ae0",
    yellow: "#ffd45c",
    orange: "#ffb057",
    gold: "#ffd45c"
  },
  protanopia: {
    red: "#ff9b5a",
    green: "#2aa0d0",
    blue: "#7aa8ff",
    purple: "#c97ae0",
    yellow: "#ffd45c",
    orange: "#ffb057",
    gold: "#ffd45c"
  },
  tritanopia: {
    red: "#ff6a6a",
    green: "#7fd482",
    blue: "#e8a8d8",
    purple: "#c9a0e0",
    yellow: "#ffd45c",
    orange: "#ff9d4f",
    gold: "#ffd45c"
  }
};

// High-contrast remap: brightens key status colors and text on dark backdrop.
export const HIGH_CONTRAST_PALETTE = {
  text: "#ffffff",
  red: "#ff7a7a",
  green: "#7dff9e",
  blue: "#8fc2ff",
  purple: "#d89bff",
  yellow: "#ffe07a",
  orange: "#ffb060",
  gold: "#ffe07a",
  white: "#ffffff"
};

export function applyAccessibilityPalette(mode, highContrast) {
  const palette = COLORBLIND_PALETTES[mode] || null;
  const hc = highContrast ? HIGH_CONTRAST_PALETTE : null;
  for (const key of Object.keys(COLORS)) {
    if (palette && palette[key] !== undefined) COLORS[key] = palette[key];
    else if (hc && hc[key] !== undefined) COLORS[key] = hc[key];
    else if (key === "text" && highContrast) COLORS.text = HIGH_CONTRAST_PALETTE.text;
  }
  return COLORS;
}

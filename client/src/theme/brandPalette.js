// Colours supplied with the AWTAD SERVICES brand assets.
export const AWTAD_PALETTE = {
  navy: '#0B2D56',
  sky: '#5B8DBF',
  terracotta: '#C76B43',
  sand: '#DCC7A3',
  offwhite: '#FAF7F2',
  ink: '#102B3F',
};

// Keep the existing token contract for all pages and saved theme preferences.
export const RYZA_PALETTE = {
  sky: AWTAD_PALETTE.sky,
  clay: AWTAD_PALETTE.terracotta,
  sand: AWTAD_PALETTE.sand,
  slate: AWTAD_PALETTE.navy,
  ivory: AWTAD_PALETTE.offwhite,
};

export const brandTokens = Object.fromEntries(
  Object.entries(RYZA_PALETTE).map(([name, value]) => [`brand-${name}`, value]),
);

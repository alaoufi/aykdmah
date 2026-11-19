// Colours supplied with the Ay Khidma brand assets.
export const AYK_SOURCE_PALETTE = {
  navy: '#0B2D56',
  sky: '#1E7BE0',
  terracotta: '#F28C28',
  sand: '#DCC7A3',
  offwhite: '#FAF7F2',
  ink: '#102B3F',
};

// Keep the existing token contract for all pages and saved theme preferences.
export const AYK_PALETTE = {
  sky: AYK_SOURCE_PALETTE.sky,
  clay: AYK_SOURCE_PALETTE.terracotta,
  sand: AYK_SOURCE_PALETTE.sand,
  slate: AYK_SOURCE_PALETTE.navy,
  ivory: AYK_SOURCE_PALETTE.offwhite,
};

export const brandTokens = Object.fromEntries(
  Object.entries(AYK_PALETTE).map(([name, value]) => [`brand-${name}`, value]),
);

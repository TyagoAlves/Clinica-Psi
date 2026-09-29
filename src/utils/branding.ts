/**
 * Color and branding helpers shared by the clinic service and the clinic context.
 */

export function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor((num >> 16) - (num >> 16) * amount));
  const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) - ((num >> 8) & 0x00FF) * amount));
  const b = Math.max(0, Math.floor((num & 0x0000FF) - (num & 0x0000FF) * amount));
  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

export function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * amount));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * amount));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * amount));
  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

export interface FaviconBrand {
  acronym?: string;
  primaryColor: string;
  logo?: string;
}

export function generateFavicon(brand: FaviconBrand): string {
  if (brand.logo) return brand.logo;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${brand.primaryColor}"/>
    <text x="32" y="42" font-family="system-ui" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${brand.acronym || 'CP'}</text>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

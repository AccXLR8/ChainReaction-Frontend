import type { OrbSkinCatalogItem } from '@/features/game/orb-skins';

const PREVIEW_SKINS: Array<Pick<OrbSkinCatalogItem,
  'id' | 'name' | 'rarity' | 'price_gems' | 'unlock_achievement_codes'
>> = [
  { id: 'classic', name: 'Classic Orb', rarity: 'common', price_gems: null, unlock_achievement_codes: [] },
  { id: 'auric-comet', name: 'Gilded Glass', rarity: 'legendary', price_gems: null, unlock_achievement_codes: ['RANKED_WIN_STREAK_20'] },
  { id: 'cosmic-core', name: 'Cosmic Core', rarity: 'legendary', price_gems: 4500, unlock_achievement_codes: [] },
  { id: 'crimson-glass', name: 'Crimson Glass', rarity: 'epic', price_gems: 2500, unlock_achievement_codes: [] },
  { id: 'void-prism', name: 'Void Prism', rarity: 'epic', price_gems: 2500, unlock_achievement_codes: [] },
  { id: 'neon-circuit', name: 'Neon Circuit', rarity: 'epic', price_gems: 2500, unlock_achievement_codes: [] },
  { id: 'cool-blue-glass', name: 'Cool Blue Glass', rarity: 'rare', price_gems: 1200, unlock_achievement_codes: [] },
  { id: 'frosted-core', name: 'Frosted Core', rarity: 'rare', price_gems: 1200, unlock_achievement_codes: [] },
  { id: 'electric-halo', name: 'Electric Halo', rarity: 'rare', price_gems: 1200, unlock_achievement_codes: [] },
  { id: 'matte-pearl', name: 'Matte Pearl', rarity: 'common', price_gems: 500, unlock_achievement_codes: [] },
  { id: 'graphite', name: 'Graphite', rarity: 'common', price_gems: 500, unlock_achievement_codes: [] },
  { id: 'ivory-glow', name: 'Ivory Glow', rarity: 'common', price_gems: 500, unlock_achievement_codes: [] },
];

/**
 * Local visual fixtures let developers inspect every finish while the backend
 * catalog is unavailable or has not yet been seeded. These do not grant items.
 */
export function createOrbSkinPreviewCatalog(): OrbSkinCatalogItem[] {
  return PREVIEW_SKINS.map((skin) => ({
    ...skin,
    asset_key: skin.id,
    preview_asset_key: skin.id,
    enabled: true,
    assets: {
      version: 'local-preview',
      preview_url: `/orb-skins/${skin.id}/preview.webp`,
      texture_url: `/orb-skins/${skin.id}/texture.webp`,
      detail_url: `/orb-skins/${skin.id}/detail.webp`,
      collision_sound: {
        url: `/orb-skins/${skin.id}/collision.mp3`,
        mime_type: 'audio/mpeg',
      },
    },
  }));
}

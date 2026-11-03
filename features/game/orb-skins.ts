import type { CSSProperties } from 'react';

export const DEFAULT_ORB_SKIN_ID = 'classic';
export const DEFAULT_ORB_SKIN_ASSET_KEY = 'classic';

export const SKIN_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type SkinRarity = (typeof SKIN_RARITIES)[number];

export type OrbSkinCollisionSound = {
  url: string;
  mime_type: string;
};

/** All appearance and audio assets that travel together as one equipped skin. */
export type OrbSkinAssets = {
  version?: string;
  preview_url?: string;
  texture_url?: string;
  detail_url?: string;
  collision_sound?: OrbSkinCollisionSound;
};

export type OrbSkinCatalogItem = {
  id: string;
  name: string;
  /** New catalogs provide this; older catalogs and the base skin default to Common. */
  rarity?: SkinRarity;
  /** Price in the player's server-owned Gem wallet; null means this skin is not for sale. */
  price_gems?: number | null;
  /** Achievement codes that award this skin when earned. */
  unlock_achievement_codes?: string[];
  /** Resolves this skin's visual and sound assets; no separate sound selection exists. */
  asset_key: string;
  preview_asset_key: string;
  enabled: boolean;
  assets?: OrbSkinAssets;
};

export type OrbSkinAppearance = {
  skinId: string;
  assetKey: string;
  assets?: OrbSkinAssets;
  side: 'self' | 'opponent';
  color: string;
};

export const DEFAULT_ORB_SKIN: OrbSkinCatalogItem = {
  id: DEFAULT_ORB_SKIN_ID,
  name: 'Classic Orb',
  rarity: 'common',
  asset_key: DEFAULT_ORB_SKIN_ASSET_KEY,
  preview_asset_key: DEFAULT_ORB_SKIN_ASSET_KEY,
  enabled: true,
  assets: {
    collision_sound: {
      url: '/orb-skins/classic/collision.mp3',
      mime_type: 'audio/mpeg',
    },
  },
};

export function normalizeSkinRarity(value: unknown): SkinRarity {
  if (typeof value !== 'string') return 'common';
  const normalized = value.toLowerCase() as SkinRarity;
  return SKIN_RARITIES.includes(normalized) ? normalized : 'common';
}

const isSafeSkinKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

/** Only accept HTTPS media URLs, loopback HTTP for development, or same-origin paths. */
export function isSafeOrbSkinAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f\\]/.test(value)) {
    return false;
  }
  if (value.startsWith('/') && !value.startsWith('//')) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function normalizeAssets(value: unknown): OrbSkinAssets | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const assets = value as Record<string, unknown>;
  const rawSound = assets.collision_sound;
  const sound = rawSound && typeof rawSound === 'object'
    ? rawSound as Record<string, unknown>
    : null;

  const normalized: OrbSkinAssets = {};
  if (typeof assets.version === 'string') normalized.version = assets.version;
  if (isSafeOrbSkinAssetUrl(assets.preview_url)) normalized.preview_url = assets.preview_url;
  if (isSafeOrbSkinAssetUrl(assets.texture_url)) normalized.texture_url = assets.texture_url;
  if (isSafeOrbSkinAssetUrl(assets.detail_url)) normalized.detail_url = assets.detail_url;
  if (sound && isSafeOrbSkinAssetUrl(sound.url)) {
    normalized.collision_sound = {
      url: sound.url,
      mime_type: typeof sound.mime_type === 'string' ? sound.mime_type : 'audio/mpeg',
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeClassicSkin(skin: OrbSkinCatalogItem): OrbSkinCatalogItem {
  return {
    ...skin,
    assets: {
      ...DEFAULT_ORB_SKIN.assets,
      ...skin.assets,
      collision_sound:
        skin.assets?.collision_sound ?? DEFAULT_ORB_SKIN.assets?.collision_sound,
    },
  };
}

export function normalizeOrbSkinId(value: unknown): string {
  return isSafeSkinKey(value) ? value : DEFAULT_ORB_SKIN_ID;
}

export function normalizeOrbSkinCatalog(value: unknown): OrbSkinCatalogItem[] {
  const entries = Array.isArray(value) ? value : [];
  const validSkins = entries.flatMap((entry): OrbSkinCatalogItem[] => {
    if (!entry || typeof entry !== 'object') return [];
    const skin = entry as Partial<OrbSkinCatalogItem>;
    if (
      !isSafeSkinKey(skin.id) ||
      !isSafeSkinKey(skin.asset_key) ||
      typeof skin.name !== 'string' ||
      typeof skin.enabled !== 'boolean' ||
      !skin.enabled
    ) return [];

    return [{
      id: skin.id,
      name: skin.name,
      rarity: normalizeSkinRarity(skin.rarity),
      price_gems: Number.isSafeInteger(skin.price_gems) && (skin.price_gems ?? 0) > 0
        ? skin.price_gems
        : null,
      unlock_achievement_codes: Array.isArray(skin.unlock_achievement_codes)
        ? skin.unlock_achievement_codes.filter((code): code is string => typeof code === 'string')
        : [],
      asset_key: skin.asset_key,
      preview_asset_key: isSafeSkinKey(skin.preview_asset_key)
        ? skin.preview_asset_key
        : skin.asset_key,
      enabled: true,
      assets: normalizeAssets(skin.assets),
    }];
  });

  const classic = validSkins.find((skin) => skin.id === DEFAULT_ORB_SKIN_ID);
  const defaultSkin = classic ? normalizeClassicSkin(classic) : DEFAULT_ORB_SKIN;
  return [defaultSkin, ...validSkins.filter((skin) => skin.id !== DEFAULT_ORB_SKIN_ID)];
}

/** Resolve an ID through the catalog, falling back to the built-in Classic bundle. */
export function resolveOrbSkin(
  skinId: unknown,
  catalog: OrbSkinCatalogItem[],
): OrbSkinCatalogItem {
  const normalizedId = normalizeOrbSkinId(skinId);
  return catalog.find((skin) => skin.id === normalizedId && skin.enabled) ?? DEFAULT_ORB_SKIN;
}

/** Compatibility helper for board data attributes and older static skin bundles. */
export function resolveOrbSkinAssetKey(
  skinId: unknown,
  catalog: OrbSkinCatalogItem[],
): string {
  return resolveOrbSkin(skinId, catalog).asset_key;
}

function cssUrl(url: string): string {
  return `url(${JSON.stringify(url)})`;
}

/** Resolve versioned backend media URLs, with the old static paths as a migration fallback. */
export function resolveOrbSkinLayerImages(
  assetKey: string,
  assets?: OrbSkinAssets,
): { textureImage: string; detailImage: string } {
  const safeKey = isSafeSkinKey(assetKey) ? assetKey : DEFAULT_ORB_SKIN_ASSET_KEY;
  const legacyTexture = safeKey === DEFAULT_ORB_SKIN_ASSET_KEY
    ? 'none'
    : cssUrl(`/orb-skins/${safeKey}/texture.webp`);
  const legacyDetail = safeKey === DEFAULT_ORB_SKIN_ASSET_KEY
    ? 'none'
    : cssUrl(`/orb-skins/${safeKey}/detail.webp`);

  return {
    textureImage: assets?.texture_url ? cssUrl(assets.texture_url) : legacyTexture,
    detailImage: assets?.detail_url ? cssUrl(assets.detail_url) : legacyDetail,
  };
}

export function orbSkinLayerStyle(assetKey: string, assets?: OrbSkinAssets): CSSProperties {
  const images = resolveOrbSkinLayerImages(assetKey, assets);
  return {
    '--orb-texture-image': images.textureImage,
    '--orb-detail-image': images.detailImage,
  } as CSSProperties;
}

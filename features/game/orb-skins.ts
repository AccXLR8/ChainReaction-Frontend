import type { CSSProperties } from 'react';

export const DEFAULT_ORB_SKIN_ID = 'classic';
export const DEFAULT_ORB_SKIN_ASSET_KEY = 'classic';

export type OrbSkinCatalogItem = {
  id: string;
  name: string;
  /** Resolves the skin's `/orb-skins/{asset_key}/` visuals and optional collision.mp3 cue. */
  asset_key: string;
  preview_asset_key: string;
  enabled: boolean;
};

export type OrbSkinAppearance = {
  assetKey: string;
  side: 'self' | 'opponent';
  color: string;
};

export const DEFAULT_ORB_SKIN: OrbSkinCatalogItem = {
  id: DEFAULT_ORB_SKIN_ID,
  name: 'Classic Orb',
  asset_key: DEFAULT_ORB_SKIN_ASSET_KEY,
  preview_asset_key: DEFAULT_ORB_SKIN_ASSET_KEY,
  enabled: true,
};

const isSafeSkinKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

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
      asset_key: skin.asset_key,
      preview_asset_key: isSafeSkinKey(skin.preview_asset_key)
        ? skin.preview_asset_key
        : skin.asset_key,
      enabled: true,
    }];
  });

  return [DEFAULT_ORB_SKIN, ...validSkins.filter((skin) => skin.id !== DEFAULT_ORB_SKIN_ID)];
}

/** Resolve API IDs through the catalog, falling back to the built-in skin on stale data. */
export function resolveOrbSkinAssetKey(
  skinId: unknown,
  catalog: OrbSkinCatalogItem[],
): string {
  const normalizedId = normalizeOrbSkinId(skinId);
  const skin = catalog.find((item) => item.id === normalizedId && item.enabled);
  return skin && isSafeSkinKey(skin.asset_key)
    ? skin.asset_key
    : DEFAULT_ORB_SKIN_ASSET_KEY;
}

/** Future skin artwork follows a static, allowlisted asset-key path convention. */
export function orbSkinLayerStyle(assetKey: string): CSSProperties {
  const safeKey = isSafeSkinKey(assetKey) ? assetKey : DEFAULT_ORB_SKIN_ASSET_KEY;
  if (safeKey === DEFAULT_ORB_SKIN_ASSET_KEY) {
    return {
      '--orb-texture-image': 'none',
      '--orb-detail-image': 'none',
    } as CSSProperties;
  }

  return {
    '--orb-texture-image': `url("/orb-skins/${safeKey}/texture.webp")`,
    '--orb-detail-image': `url("/orb-skins/${safeKey}/detail.webp")`,
  } as CSSProperties;
}

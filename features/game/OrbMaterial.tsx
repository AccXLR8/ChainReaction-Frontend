import { orbSkinLayerStyle, type OrbSkinAssets } from './orb-skins';

/** The cosmetic surface lives inside the animated orb shell. */
export function OrbMaterial({
  assetKey,
  assets,
  className = '',
}: {
  assetKey: string;
  assets?: OrbSkinAssets;
  className?: string;
}) {
  return (
    <span className={`orb-surface ${className}`.trim()} style={orbSkinLayerStyle(assetKey, assets)} aria-hidden="true">
      <span className="orb-surface-texture" />
      <span className="orb-surface-detail" />
    </span>
  );
}

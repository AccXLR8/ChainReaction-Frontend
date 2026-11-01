import { orbSkinLayerStyle } from './orb-skins';

/** The cosmetic surface lives inside the animated orb shell. */
export function OrbMaterial({ assetKey, className = '' }: { assetKey: string; className?: string }) {
  return (
    <span className={`orb-surface ${className}`.trim()} style={orbSkinLayerStyle(assetKey)} aria-hidden="true">
      <span className="orb-surface-texture" />
      <span className="orb-surface-detail" />
    </span>
  );
}

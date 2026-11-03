import type { CSSProperties } from 'react';
import { OrbMaterial } from './OrbMaterial';
import type { OrbSkinAssets } from './orb-skins';

/** Shared stationary-orb renderer used by both match cells and skin previews. */
export function OrbCluster({
  count,
  assetKey,
  assets,
  ownerColor,
  side,
  criticalMass,
}: {
  count: number;
  assetKey: string;
  assets?: OrbSkinAssets;
  ownerColor: string;
  side: 'self' | 'opponent';
  criticalMass: number;
}) {
  const visibleCount = Math.min(count, 4);
  const distanceToBurst = criticalMass - count;
  const vibrationDuration = distanceToBurst <= 1
    ? '180ms'
    : distanceToBurst === 2
      ? '300ms'
      : '650ms';
  const spinDuration = distanceToBurst <= 1
    ? '1.7s'
    : distanceToBurst === 2
      ? '2.9s'
      : '4.4s';
  const vibrationScale = distanceToBurst <= 1
    ? '1.04'
    : distanceToBurst === 2
      ? '1.02'
      : '1.008';

  return (
    <span
      className={`orbs count-${visibleCount}`}
      data-orb-skin={assetKey}
      data-orb-side={side}
      style={{
        '--owner': ownerColor,
        '--count': visibleCount,
        '--vibration-duration': vibrationDuration,
        '--spin-duration': spinDuration,
        '--vibration-scale': vibrationScale,
      } as CSSProperties}
    >
      <span className="orb-cluster">
        <span className="orb-ring" key={visibleCount}>
          {Array.from({ length: visibleCount }, (_, orbIndex) => (
            <span
              className="atom"
              key={orbIndex}
              style={{
                '--orb-i': orbIndex,
                '--orb-delay': `${orbIndex * -0.7}s`,
                '--orb-delay-fast': `${orbIndex * -1.1}s`,
              } as CSSProperties}
            >
              <OrbMaterial assetKey={assetKey} assets={assets} className="orb-spin-preview" />
              <span className="orb-skin-effects" aria-hidden="true" />
              <span className="orb-owner-rim" />
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

export type LatencyQuality = 'unknown' | 'good' | 'fair' | 'poor' | 'offline';

type LatencyIndicatorProps = {
  quality: LatencyQuality;
  latencyMs: number | null;
};

const qualityLabels: Record<LatencyQuality, string> = {
  unknown: 'checking',
  good: 'good',
  fair: 'fair',
  poor: 'poor',
  offline: 'disconnected',
};

/** Displays client-measured round-trip latency to the authoritative game server. */
export function LatencyIndicator({ quality, latencyMs }: LatencyIndicatorProps) {
  const label = latencyMs === null
    ? `Connection quality: ${qualityLabels[quality]}.`
    : `Connection quality: ${qualityLabels[quality]}, ${latencyMs} milliseconds.`;
  const filledBars = quality === 'good' ? 3 : quality === 'fair' ? 2 : quality === 'poor' ? 1 : 0;

  return (
    <span
      className={`latency-indicator latency-${quality}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <span className="latency-bars" aria-hidden="true">
        {[0, 1, 2].map((bar) => (
          <span
            key={bar}
            className={`latency-bar latency-bar-${bar + 1}${bar < filledBars ? ' is-active' : ''}`}
          />
        ))}
      </span>
      <span className="latency-value" aria-hidden="true">
        {latencyMs === null ? (quality === 'offline' ? 'OFFLINE' : '—') : `${latencyMs} ms`}
      </span>
    </span>
  );
}

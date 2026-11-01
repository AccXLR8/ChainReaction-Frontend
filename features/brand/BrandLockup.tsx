/** Shared Superkritical mark and wordmark used in the lobby and match header. */
export function BrandLockup() {
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none">
          <path d="M8 23.5 17.8 11l10.1 12.2" />
          <path d="M8.2 23.5h19.6" />
          <circle cx="8" cy="23.5" r="4.2" />
          <circle cx="18" cy="10.5" r="4.2" />
          <circle cx="28" cy="23.5" r="4.2" />
          <circle className="brand-mark-core" cx="18" cy="23.5" r="2" />
        </svg>
      </span>
      <span className="brand-wordmark"><span>Super</span><strong>kritical</strong></span>
    </>
  );
}

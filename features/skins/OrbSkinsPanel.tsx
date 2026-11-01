'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getMyProfile, getOrbSkinCatalog, updateMyProfile } from '@/lib/api/profiles';
import type { PlayerProfile } from '@/features/profile/types';
import type { SessionUser } from '@/features/auth/types';
import { OrbMaterial } from '@/features/game/OrbMaterial';
import {
  DEFAULT_ORB_SKIN,
  DEFAULT_ORB_SKIN_ID,
  normalizeOrbSkinCatalog,
  type OrbSkinCatalogItem,
} from '@/features/game/orb-skins';

type OrbSkinsPanelProps = {
  token: string | null;
  user: SessionUser | null;
  onClose: () => void;
  onRequestSignIn: () => void;
  onCreateGuest: () => Promise<void>;
  onSessionExpired: () => void;
  onSkinEquipped: (skinId: string) => void;
};

/** Lets a player preview and equip skins from their server-owned inventory. */
export function OrbSkinsPanel({
  token,
  user,
  onClose,
  onRequestSignIn,
  onCreateGuest,
  onSessionExpired,
  onSkinEquipped,
}: OrbSkinsPanelProps) {
  const [catalog, setCatalog] = useState<OrbSkinCatalogItem[]>([DEFAULT_ORB_SKIN]);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSkinId, setSavingSkinId] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const expiredHandler = useRef(onSessionExpired);
  expiredHandler.current = onSessionExpired;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    const loadSkins = async () => {
      setLoading(true);
      setError('');
      const [catalogResult, profileResult] = await Promise.allSettled([
        getOrbSkinCatalog(controller.signal),
        token ? getMyProfile(token, controller.signal) : Promise.resolve(null),
      ]);
      if (!active) return;
      window.clearTimeout(timeout);

      if (catalogResult.status === 'fulfilled') {
        setCatalog(normalizeOrbSkinCatalog(catalogResult.value));
      } else {
        setCatalog([DEFAULT_ORB_SKIN]);
        setError(catalogResult.reason instanceof DOMException && catalogResult.reason.name === 'AbortError'
          ? 'The skin service did not respond. The classic orb is still available.'
          : 'The skin catalog is unavailable. The classic orb remains equipped.');
      }

      if (profileResult.status === 'fulfilled' && profileResult.value) {
        setProfile(profileResult.value);
      } else if (profileResult.status === 'rejected') {
        const cause = profileResult.reason;
        if (cause instanceof ApiError && cause.status === 401) {
          expiredHandler.current();
          return;
        }
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Could not load your skin inventory.');
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    };

    void loadSkins();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [token]);

  const ownedIds = new Set(profile?.owned_orb_skin_ids ?? [DEFAULT_ORB_SKIN_ID]);
  ownedIds.add(DEFAULT_ORB_SKIN_ID);
  const equippedSkinId = profile?.equipped_orb_skin_id ?? DEFAULT_ORB_SKIN_ID;
  const equippedSkin = catalog.find((skin) => skin.id === equippedSkinId && ownedIds.has(skin.id));
  const selectedSkinId = equippedSkin?.id ?? DEFAULT_ORB_SKIN_ID;

  const equipSkin = async (skin: OrbSkinCatalogItem) => {
    if (!token || !ownedIds.has(skin.id) || skin.id === selectedSkinId || savingSkinId) return;

    setSavingSkinId(skin.id);
    setError('');
    setNotice('');
    try {
      const updated = await updateMyProfile(token, { equipped_orb_skin_id: skin.id });
      setProfile(updated);
      onSkinEquipped(updated.equipped_orb_skin_id ?? DEFAULT_ORB_SKIN_ID);
      setNotice(`${skin.name} equipped. It will appear in your next match.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expiredHandler.current();
      setError(cause instanceof Error ? cause.message : 'Could not equip that orb skin.');
    } finally {
      setSavingSkinId(null);
    }
  };

  const continueAsGuest = async () => {
    if (guestBusy) return;
    setGuestBusy(true);
    setError('');
    try {
      await onCreateGuest();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a guest profile.');
    } finally {
      setGuestBusy(false);
    }
  };

  return (
    <div className="orb-skins-backdrop" role="presentation">
      <section className="orb-skins-panel" role="dialog" aria-modal="true" aria-labelledby="orb-skins-title">
        <header className="orb-skins-header">
          <div>
            <span className="eyebrow-mini">PERSONALIZE YOUR ARENA</span>
            <h2 id="orb-skins-title">Orb skins</h2>
          </div>
          <button className="rules-close" type="button" onClick={onClose} aria-label="Close orb skins">×</button>
        </header>

        <p className="orb-skins-intro">
          Choose the surface your orbs use. Player colors stay readable during every chain reaction.
        </p>

        <div className="orb-skins-content" aria-live="polite">
          {loading ? (
            <div className="orb-skins-state">Loading your orb collection…</div>
          ) : (
            <>
              <div className="orb-skins-summary">
                <span>{user ? `${user.username}’s collection` : 'Preview the default skin'}</span>
                <strong>{ownedIds.size} {ownedIds.size === 1 ? 'SKIN' : 'SKINS'} OWNED</strong>
              </div>

              <div className="orb-skin-list">
                {catalog.map((skin) => {
                  const owned = ownedIds.has(skin.id);
                  const equipped = skin.id === selectedSkinId;
                  const busy = savingSkinId === skin.id;

                  return (
                    <article className={`orb-skin-card ${equipped ? 'is-equipped' : ''}`} key={skin.id}>
                      <SkinPreview skin={skin} />
                      <div className="orb-skin-copy">
                        <span className="orb-skin-status">
                          {equipped ? 'EQUIPPED' : owned ? 'IN YOUR INVENTORY' : 'LOCKED'}
                        </span>
                        <h3>{skin.name}</h3>
                        <p>{skin.id === DEFAULT_ORB_SKIN_ID ? 'The original glass orb.' : 'A new look for your chain reactions.'}</p>
                      </div>
                      <button
                        className={`orb-skin-action ${equipped ? 'is-selected' : ''}`}
                        type="button"
                        disabled={!token || !owned || equipped || savingSkinId !== null}
                        onClick={() => void equipSkin(skin)}
                      >
                        {busy ? 'Saving…' : equipped ? 'Equipped' : owned ? 'Equip' : 'Locked'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!token && !loading && (
          <div className="orb-skins-guest-actions">
            <button className="orb-skin-action is-primary" type="button" disabled={guestBusy} onClick={() => void continueAsGuest()}>
              {guestBusy ? 'Creating guest profile…' : 'Continue as guest'}
            </button>
            <button className="orb-skin-signin" type="button" onClick={onRequestSignIn}>Sign in</button>
            <p>Guest profiles can equip owned skins too. The classic orb is always available.</p>
          </div>
        )}

        {error && <div className="orb-skins-message is-error" role="alert">{error}</div>}
        {notice && <div className="orb-skins-message" role="status">{notice}</div>}
        <footer className="orb-skins-footer">
          <span>OPPONENT ORBS KEEP THEIR RED IDENTITY RIM</span>
          <span>DEFAULT · CLASSIC</span>
        </footer>
      </section>
    </div>
  );
}

function SkinPreview({ skin }: { skin: OrbSkinCatalogItem }) {
  const previewUrl = skin.assets?.preview_url ?? (
    skin.preview_asset_key !== DEFAULT_ORB_SKIN_ID
      ? `/orb-skins/${skin.preview_asset_key}/preview.webp`
      : undefined
  );

  return (
    <div className="orb-skin-preview" aria-hidden="true">
      <span className="orb-skin-preview-orb">
        <OrbMaterial assetKey={skin.asset_key} assets={skin.assets} />
      </span>
      <span className="orb-skin-preview-orb small-one">
        <OrbMaterial assetKey={skin.asset_key} assets={skin.assets} />
      </span>
      <span className="orb-skin-preview-orb small-two">
        <OrbMaterial assetKey={skin.asset_key} assets={skin.assets} />
      </span>
      {previewUrl && (
        <img
          className="orb-skin-preview-image"
          src={previewUrl}
          alt=""
          onError={(event) => { event.currentTarget.hidden = true; }}
        />
      )}
    </div>
  );
}


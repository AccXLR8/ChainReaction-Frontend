'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getMyProfile, getOrbSkinCatalog } from '@/lib/api/profiles';
import {
  createGemPackCheckout,
  getGemPacks,
  getGemWallet,
  purchaseOrbSkin,
  verifyGemPackCheckout,
  type GemPack,
  type GemPackCheckoutOrder,
} from '@/lib/api/shop';
import { openRazorpayCheckout } from '@/lib/api/razorpay-checkout';
import { OrbCluster } from '@/features/game/OrbCluster';
import { unlockOrbSkinAudio } from '@/features/game/orb-skin-audio';
import {
  DEFAULT_ORB_SKIN_ID,
  normalizeOrbSkinCatalog,
  normalizeSkinRarity,
  type OrbSkinCatalogItem,
} from '@/features/game/orb-skins';
import { OrbSkinPreviewDialog } from '@/features/skins/OrbSkinPreviewDialog';

type ShopPanelProps = {
  token: string | null;
  isRegistered: boolean;
  onRequestSignIn: () => void;
  onSessionExpired: () => void;
};

/** A focused store: buy Gems, then spend them on orb skins. */
export function ShopPanel({ token, isRegistered, onRequestSignIn, onSessionExpired }: ShopPanelProps) {
  const [catalog, setCatalog] = useState<OrbSkinCatalogItem[]>([]);
  const [ownedIds, setOwnedIds] = useState<string[]>([DEFAULT_ORB_SKIN_ID]);
  const [earnedAchievementCodes, setEarnedAchievementCodes] = useState<string[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [packs, setPacks] = useState<GemPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [inventoryUnavailable, setInventoryUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewSkin, setPreviewSkin] = useState<OrbSkinCatalogItem | null>(null);
  const [buyingSkinId, setBuyingSkinId] = useState<string | null>(null);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const [showGemPacks, setShowGemPacks] = useState(false);
  const expiredHandler = useRef(onSessionExpired);
  expiredHandler.current = onSessionExpired;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    const loadStore = async () => {
      setLoading(true);
      setError('');
      setCatalogUnavailable(false);
      setInventoryUnavailable(false);
      setOwnedIds([DEFAULT_ORB_SKIN_ID]);
      setEarnedAchievementCodes([]);
      setBalance(null);
      const [catalogResult, packResult, profileResult, walletResult] = await Promise.allSettled([
        getOrbSkinCatalog(controller.signal),
        getGemPacks(controller.signal),
        isRegistered && token ? getMyProfile(token, controller.signal) : Promise.resolve(null),
        isRegistered && token ? getGemWallet(token, controller.signal) : Promise.resolve(null),
      ]);
      if (!active) return;
      window.clearTimeout(timeout);

      if (catalogResult.status === 'fulfilled') {
        setCatalogUnavailable(false);
        setCatalog(normalizeOrbSkinCatalog(catalogResult.value));
      } else {
        setCatalogUnavailable(true);
        setCatalog([]);
        setError(readableShopError(catalogResult.reason, 'The skin catalog is unavailable.'));
      }
      if (packResult.status === 'fulfilled') setPacks(packResult.value);
      if (profileResult.status === 'fulfilled' && profileResult.value) {
        setOwnedIds(profileResult.value.owned_orb_skin_ids ?? [DEFAULT_ORB_SKIN_ID]);
        setEarnedAchievementCodes(
          (profileResult.value.achievements ?? [])
            .filter((achievement) => achievement.unlocked)
            .map((achievement) => achievement.code),
        );
      } else if (profileResult.status === 'rejected') {
        if (profileResult.reason instanceof ApiError && profileResult.reason.status === 401) {
          expiredHandler.current();
          return;
        }
        setInventoryUnavailable(true);
      } else {
        setOwnedIds([DEFAULT_ORB_SKIN_ID]);
      }
      if (walletResult.status === 'fulfilled' && walletResult.value) {
        setBalance(walletResult.value.balance);
      } else if (walletResult.status === 'rejected') {
        if (walletResult.reason instanceof ApiError && walletResult.reason.status === 401) {
          expiredHandler.current();
          return;
        }
        setError(readableShopError(walletResult.reason, 'Could not load your Gems balance.'));
      } else {
        setBalance(null);
      }
      setLoading(false);
    };

    void loadStore();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isRegistered, token]);

  const availableSkins = useMemo(
    () => catalog.filter((skin) => {
      const hasAchievementUnlock = (skin.unlock_achievement_codes?.length ?? 0) > 0;
      const isForSale = skin.price_gems !== null && skin.price_gems !== undefined;
      return hasAchievementUnlock || (isForSale && !ownedIds.includes(skin.id));
    }),
    [catalog, ownedIds],
  );

  const requestGems = () => {
    if (!isRegistered || !token) {
      onRequestSignIn();
      return;
    }
    setError('');
    setShowGemPacks(true);
  };

  const buySkin = async (skin: OrbSkinCatalogItem) => {
    if (!isRegistered || !token) {
      onRequestSignIn();
      return;
    }
    if (balance === null) {
      setError('Your Gems balance is still loading. Please try again.');
      return;
    }
    if (skin.price_gems == null) return;
    if (balance < skin.price_gems) {
      requestGems();
      return;
    }

    setBuyingSkinId(skin.id);
    setError('');
    setNotice('');
    try {
      const result = await purchaseOrbSkin(token, skin.id);
      setBalance(result.gem_balance);
      setOwnedIds(result.owned_orb_skin_ids);
      setPreviewSkin(null);
      setNotice(`${skin.name} added to your locker.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expiredHandler.current();
      if (cause instanceof ApiError && cause.status === 409 && /not enough gems/i.test(cause.message)) {
        requestGems();
        return;
      }
      setError(readableShopError(cause, 'Could not buy this orb skin.'));
    } finally {
      setBuyingSkinId(null);
    }
  };

  const buyGemPack = async (pack: GemPack) => {
    if (!isRegistered || !token) {
      onRequestSignIn();
      return;
    }
    setBuyingPackId(pack.id);
    setError('');
    try {
      const order: GemPackCheckoutOrder = await createGemPackCheckout(token, pack.id);
      const payment = await openRazorpayCheckout(order);
      if (payment.razorpay_order_id !== order.order_id) {
        throw new Error('The payment response did not match this order. Please contact support.');
      }
      const result = await verifyGemPackCheckout(token, {
        order_id: order.order_id,
        payment_id: payment.razorpay_payment_id,
        signature: payment.razorpay_signature,
      });
      setBalance(result.gem_balance);
      setShowGemPacks(false);
      setNotice(`${result.gems_added.toLocaleString('en-IN')} Gems added.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expiredHandler.current();
      setError(readableShopError(cause, 'Could not add Gems.'));
    } finally {
      setBuyingPackId(null);
    }
  };

  return (
    <section className="shop-page arena-content-page" aria-labelledby="shop-title">
      <header className="shop-header">
        <div>
          <span className="eyebrow-mini">STORE</span>
          <h1 id="shop-title">Shop</h1>
        </div>
        <div className="shop-wallet" aria-label={balance === null ? 'Gems balance unavailable' : `${balance} Gems`}>
          <span className="shop-gem-icon" aria-hidden="true">✦</span>
          <span><strong>{balance === null ? '—' : balance.toLocaleString('en-IN')}</strong><small>Gems</small></span>
          <button type="button" onClick={requestGems}>+ Buy Gems</button>
        </div>
      </header>

      {error && <p className="shop-message is-error" role="alert">{error}</p>}
      {notice && <p className="shop-message" role="status">{notice}</p>}

      <div className="shop-content" aria-live="polite">
        {loading ? (
          <div className="shop-empty-state"><span className="shop-loading-mark" aria-hidden="true">✳</span><p>Loading shop</p></div>
        ) : catalogUnavailable ? (
          <div className="shop-empty-state"><span className="shop-loading-mark" aria-hidden="true">✳</span><p>Shop items could not be loaded.</p></div>
        ) : inventoryUnavailable ? (
          <div className="shop-empty-state"><span className="shop-loading-mark" aria-hidden="true">✳</span><p>Your locker could not be loaded.</p></div>
        ) : availableSkins.length > 0 ? (
          <div className="shop-skin-grid">
            {availableSkins.map((skin) => (
              <article
                className={`shop-skin-card rarity-${normalizeSkinRarity(skin.rarity)}`}
                data-unlock={skin.id === 'auric-comet' ? 'ranked-streak' : undefined}
                key={skin.id}
              >
                <button
                  className="shop-skin-preview"
                  type="button"
                  onClick={() => {
                    unlockOrbSkinAudio();
                    setPreviewSkin(skin);
                  }}
                  aria-label={`Preview ${skin.name}`}
                >
                  <OrbCluster
                    count={1}
                    assetKey={skin.asset_key}
                    assets={skin.assets}
                    ownerColor="#39e58c"
                    side="self"
                    criticalMass={4}
                  />
                  <span className="shop-skin-rarity">{normalizeSkinRarity(skin.rarity)}</span>
                </button>
                <div className="shop-skin-info">
                  <div>
                    <h2>{skin.name}</h2>
                    <span>
                      {skin.price_gems != null
                        ? `${skin.price_gems.toLocaleString('en-IN')} Gems`
                        : ownedIds.includes(skin.id)
                          ? 'Unlocked'
                          : earnedAchievementCodes.some((code) => skin.unlock_achievement_codes?.includes(code))
                            ? 'Achievement complete'
                            : '20 consecutive ranked wins'}
                    </span>
                  </div>
                  {skin.price_gems != null ? (
                    <button
                      className="shop-buy-button"
                      type="button"
                      onClick={() => void buySkin(skin)}
                      disabled={buyingSkinId === skin.id || (isRegistered && balance === null)}
                    >
                      {buyingSkinId === skin.id ? 'Buying…' : 'Buy'}
                    </button>
                  ) : (
                    <span className={`shop-reward-mark${ownedIds.includes(skin.id) ? ' is-unlocked' : ''}`} aria-label={ownedIds.includes(skin.id) ? 'Unlocked reward' : 'Ranked achievement reward'}>
                      {ownedIds.includes(skin.id) ? '✓' : '✦'}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="shop-empty-state">
            <span className="shop-loading-mark" aria-hidden="true">✳</span>
            <p>No orb skins for sale right now.</p>
          </div>
        )}
      </div>

      {previewSkin && (
        <OrbSkinPreviewDialog
          key={previewSkin.id}
          skin={previewSkin}
          equipped={false}
          owned={false}
          unlocksThroughAchievements={(previewSkin.unlock_achievement_codes?.length ?? 0) > 0}
          token={token}
          busy={false}
          shopMode={previewSkin.price_gems != null}
          canPurchase={isRegistered}
          gemPrice={previewSkin.price_gems}
          gemsBalance={balance}
          purchaseBusy={buyingSkinId === previewSkin.id}
          purchaseError={error}
          onClose={() => setPreviewSkin(null)}
          onEquip={() => undefined}
          onPurchase={() => void buySkin(previewSkin)}
          onBuyGems={requestGems}
          onRequestSignIn={onRequestSignIn}
        />
      )}

      {showGemPacks && (
        <GemPacksDialog
          packs={packs}
          busyPackId={buyingPackId}
          error={error}
          onClose={() => setShowGemPacks(false)}
          onBuy={(pack) => void buyGemPack(pack)}
        />
      )}
    </section>
  );
}

function GemPacksDialog({
  packs,
  busyPackId,
  error,
  onClose,
  onBuy,
}: {
  packs: GemPack[];
  busyPackId: string | null;
  error: string;
  onClose: () => void;
  onBuy: (pack: GemPack) => void;
}) {
  return (
    <div className="shop-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="shop-gems-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-gems-title">
        <header><h2 id="shop-gems-title">Buy Gems</h2><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        {error && <p className="shop-message is-error" role="alert">{error}</p>}
        {packs.length ? (
          <div className="shop-gem-pack-list">
            {packs.map((pack) => (
              <article className="shop-gem-pack" key={pack.id}>
                <div><strong>{pack.gems_amount.toLocaleString('en-IN')}</strong><span>Gems</span></div>
                <button type="button" disabled={busyPackId !== null} onClick={() => onBuy(pack)}>
                  {busyPackId === pack.id ? 'Opening…' : formatMoney(pack.price_amount_minor, pack.price_currency)}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="shop-no-packs">Gem packs are not available yet.</p>
        )}
      </section>
    </div>
  );
}

function formatMoney(amountMinor: number, currency: string): string {
  try {
    const fractionDigits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amountMinor / (10 ** fractionDigits));
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function readableShopError(cause: unknown, fallback: string): string {
  if (cause && typeof cause === 'object' && 'name' in cause && cause.name === 'AbortError') {
    return 'The shop service did not respond. Try again shortly.';
  }
  return cause instanceof Error ? cause.message : fallback;
}

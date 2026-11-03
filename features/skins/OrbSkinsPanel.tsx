'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  getMyProfile,
  getOrbSkinCatalog,
  updateMyProfile,
} from '@/lib/api/profiles';
import type { PlayerProfile } from '@/features/profile/types';
import { BoardPanel } from '@/features/game/BoardPanel';
import { OrbCluster } from '@/features/game/OrbCluster';
import { unlockOrbSkinAudio } from '@/features/game/orb-skin-audio';
import { LOBBY_PREVIEW_GAME } from '@/features/lobby/preview-game';
import { OrbSkinPreviewDialog } from '@/features/skins/OrbSkinPreviewDialog';
import { createOrbSkinPreviewCatalog } from '@/features/skins/orb-skin-preview-catalog';
import {
  DEFAULT_ORB_SKIN,
  DEFAULT_ORB_SKIN_ID,
  normalizeOrbSkinCatalog,
  normalizeSkinRarity,
  type OrbSkinCatalogItem,
  type SkinRarity,
} from '@/features/game/orb-skins';

type SkinCategory = 'orbs' | 'boards';
type RarityFilter = 'all' | SkinRarity;
type SkinScope = 'owned' | 'all';
type SkinSort = 'rarity' | 'newest' | 'alphabetical';
type SkinView = 'grid' | 'list';

const RARITY_DISPLAY_ORDER: SkinRarity[] = ['legendary', 'epic', 'rare', 'common'];
const SKIN_FEATURE_ORDER = [
  'auric-comet', 'cosmic-core', 'crimson-glass', 'void-prism', 'neon-circuit',
  'cool-blue-glass', 'frosted-core', 'electric-halo', 'classic', 'matte-pearl', 'graphite', 'ivory-glow',
];

const RARITY_DETAILS: Record<SkinRarity, string> = {
  common: 'The original finishes',
  rare: 'Cool, refined materials',
  epic: 'Distinctive high energy looks',
  legendary: 'Rare finishes with a signature impact',
};

const SKIN_DESCRIPTIONS: Record<string, string> = {
  classic: 'The original, timeless look.',
  'auric-comet': 'A radiant gilded finish with a sparkling collision.',
  'cosmic-core': 'A celestial finish with a deep-space impact.',
  'crimson-glass': 'A bold, fiery finish that hits hard.',
  'void-prism': 'A shifting prism forged in the void.',
  'neon-circuit': 'A luminous circuit pattern with a sharp digital pulse.',
  'cool-blue-glass': 'A clean, cool finish for your arena.',
  'frosted-core': 'A smooth, icy surface with a soft impact.',
  'electric-halo': 'A charged finish wrapped in electric light.',
  'matte-pearl': 'A quiet pearl finish with a soft sheen.',
  graphite: 'A bold, neutral finish in deep graphite.',
  'ivory-glow': 'A warm ivory surface with a gentle glow.',
};

type OrbSkinsPanelProps = {
  token: string | null;
  onSessionExpired: () => void;
  onSkinEquipped: (skinId: string) => void;
  onRequestSignIn: () => void;
};

/** Lets a player preview and equip skins from their server-owned inventory. */
export function OrbSkinsPanel({
  token,
  onSessionExpired,
  onSkinEquipped,
  onRequestSignIn,
}: OrbSkinsPanelProps) {
  const [catalog, setCatalog] = useState<OrbSkinCatalogItem[]>([DEFAULT_ORB_SKIN]);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [skinCategory, setSkinCategory] = useState<SkinCategory>('orbs');
  const [skinScope, setSkinScope] = useState<SkinScope>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SkinSort>('rarity');
  const [skinView, setSkinView] = useState<SkinView>('grid');
  const [loading, setLoading] = useState(true);
  const [savingSkinId, setSavingSkinId] = useState<string | null>(null);
  const [previewSkin, setPreviewSkin] = useState<OrbSkinCatalogItem | null>(null);
  const [localPreviewSkinIds, setLocalPreviewSkinIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const expiredHandler = useRef(onSessionExpired);
  expiredHandler.current = onSessionExpired;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    const loadSkins = async () => {
      let usingLocalPreview = false;
      setLoading(true);
      setError('');
      const [catalogResult, profileResult] = await Promise.allSettled([
        getOrbSkinCatalog(controller.signal),
        token ? getMyProfile(token, controller.signal) : Promise.resolve(null),
      ]);
      if (!active) return;
      window.clearTimeout(timeout);

      if (catalogResult.status === 'fulfilled') {
        const serverCatalog = normalizeOrbSkinCatalog(catalogResult.value);
        if (process.env.NODE_ENV === 'development') {
          const previewCatalog = createOrbSkinPreviewCatalog();
          const serverIds = new Set(serverCatalog.map((skin) => skin.id));
          const localOnly = previewCatalog.filter((skin) => !serverIds.has(skin.id));
          if (localOnly.length > 0) {
            usingLocalPreview = true;
            const serverById = new Map(serverCatalog.map((skin) => [skin.id, skin]));
            setCatalog(previewCatalog.map((skin) => serverById.get(skin.id) ?? skin));
            setLocalPreviewSkinIds(localOnly.map((skin) => skin.id));
          } else {
            setCatalog(serverCatalog);
            setLocalPreviewSkinIds([]);
          }
        } else {
          setCatalog(serverCatalog);
          setLocalPreviewSkinIds([]);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          usingLocalPreview = true;
          const previewCatalog = createOrbSkinPreviewCatalog();
          setCatalog(previewCatalog);
          setLocalPreviewSkinIds(previewCatalog.filter((skin) => skin.id !== DEFAULT_ORB_SKIN_ID).map((skin) => skin.id));
        } else {
          setCatalog([DEFAULT_ORB_SKIN]);
          setLocalPreviewSkinIds([]);
          setError(catalogResult.reason instanceof DOMException && catalogResult.reason.name === 'AbortError'
            ? 'The skin service did not respond. The classic orb is still available.'
            : 'The skin catalog is unavailable. The classic orb remains equipped.');
        }
      }

      if (profileResult.status === 'fulfilled' && profileResult.value) {
        setProfile(profileResult.value);
      } else if (profileResult.status === 'rejected') {
        const cause = profileResult.reason;
        if (cause instanceof ApiError && cause.status === 401) {
          expiredHandler.current();
          return;
        }
        if (!(cause instanceof DOMException && cause.name === 'AbortError') && !usingLocalPreview) {
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

  const previewOnlyIds = new Set(localPreviewSkinIds);
  const ownedIds = new Set(
    (profile?.owned_orb_skin_ids ?? [DEFAULT_ORB_SKIN_ID])
      .filter((skinId) => !previewOnlyIds.has(skinId)),
  );
  ownedIds.add(DEFAULT_ORB_SKIN_ID);
  const equippedSkinId = profile?.equipped_orb_skin_id ?? DEFAULT_ORB_SKIN_ID;
  const equippedSkin = catalog.find((skin) =>
    skin.id === equippedSkinId && ownedIds.has(skin.id) && !previewOnlyIds.has(skin.id),
  );
  const selectedSkinId = equippedSkin?.id ?? DEFAULT_ORB_SKIN_ID;
  const activeOrbSkin = catalog.find((skin) => skin.id === selectedSkinId) ?? DEFAULT_ORB_SKIN;
  const ownedOrbSkins = catalog.filter((skin) => ownedIds.has(skin.id));
  const orbSkinsInView = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matching = (skinScope === 'owned' ? ownedOrbSkins : catalog).filter((skin) => {
      const matchesRarity = rarityFilter === 'all' || normalizeSkinRarity(skin.rarity) === rarityFilter;
      const matchesSearch = !query || `${skin.name} ${SKIN_DESCRIPTIONS[skin.id] ?? ''}`.toLowerCase().includes(query);
      return matchesRarity && matchesSearch;
    });
    if (sortMode === 'alphabetical') return matching.sort((a, b) => a.name.localeCompare(b.name));
    matching.sort((a, b) => SKIN_FEATURE_ORDER.indexOf(a.id) - SKIN_FEATURE_ORDER.indexOf(b.id));
    return sortMode === 'newest' ? matching.reverse() : matching;
  }, [catalog, ownedOrbSkins, rarityFilter, searchQuery, skinScope, sortMode]);
  const collectionCount = skinCategory === 'orbs' ? ownedOrbSkins.length : 1;
  const catalogCount = skinCategory === 'orbs' ? catalog.length : 1;
  const visibleRarities = RARITY_DISPLAY_ORDER.filter((rarity) => rarityFilter === 'all' || rarity === rarityFilter);

  const equipSkin = async (skin: OrbSkinCatalogItem) => {
    if (!token || previewOnlyIds.has(skin.id) || !ownedIds.has(skin.id) || skin.id === selectedSkinId || savingSkinId) return;

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

  return (
    <section className={`orb-skins-panel arena-content-page skin-locker-page ${skinCategory === 'boards' ? 'is-board-view' : 'is-orb-view'}`} aria-labelledby="skins-title">
      <header className="orb-skins-header arena-page-header">
        <div className="skin-page-title-copy">
          <span className="eyebrow-mini">S K I N&nbsp;&nbsp; S H O P</span>
          <h2 id="skins-title">Orb Skins</h2>
          <p>Customize your arena with exclusive orb finishes. Each skin brings its own look and collision sound.</p>
        </div>
        <div className="skin-hero-orb" aria-hidden="true"><OrbPreviewOrb skin={activeOrbSkin} /></div>
        <div className="skin-header-stats" aria-label="Collection summary">
          <span><strong>{collectionCount.toString().padStart(2, '0')}</strong> owned</span>
          <i aria-hidden="true" />
          <span><strong>{Math.max(0, catalogCount - collectionCount).toString().padStart(2, '0')}</strong> available</span>
        </div>
      </header>

      <div className="skin-locker-layout">
        <aside className="skin-filter-rail" aria-label="Filter skins">
          <section className="skin-filter-group" aria-labelledby="skin-type-title">
            <h3 id="skin-type-title">Skin type</h3>
            <button className={skinCategory === 'orbs' ? 'is-selected' : ''} type="button" aria-pressed={skinCategory === 'orbs'} onClick={() => setSkinCategory('orbs')}>
              <span aria-hidden="true">●</span> Orb skins <small>{catalog.length}</small>
            </button>
            <button className={skinCategory === 'boards' ? 'is-selected' : ''} type="button" aria-pressed={skinCategory === 'boards'} onClick={() => setSkinCategory('boards')}>
              <span aria-hidden="true">▦</span> Board skins <small>1</small>
            </button>
          </section>

          <section className="skin-filter-group" aria-labelledby="skin-rarity-title">
            <h3 id="skin-rarity-title">Rarity</h3>
            <button className={rarityFilter === 'all' ? 'is-selected' : ''} type="button" aria-pressed={rarityFilter === 'all'} onClick={() => setRarityFilter('all')}>
              <span className="rarity-dot rarity-dot-all" aria-hidden="true" /> All skins <small>{skinCategory === 'orbs' ? catalog.length : 1}</small>
            </button>
            {RARITY_DISPLAY_ORDER.map((rarity) => (
              <button className={`rarity-filter rarity-${rarity} ${rarityFilter === rarity ? 'is-selected' : ''}`} key={rarity} type="button" aria-pressed={rarityFilter === rarity} onClick={() => setRarityFilter(rarity)}>
                <span className="rarity-dot" aria-hidden="true" /> {capitalize(rarity)} <small>{catalog.filter((skin) => normalizeSkinRarity(skin.rarity) === rarity).length}</small>
              </button>
            ))}
          </section>
          <label className="skin-owned-toggle"><span>Owned only</span><input type="checkbox" checked={skinScope === 'owned'} onChange={(event) => setSkinScope(event.target.checked ? 'owned' : 'all')} /><i aria-hidden="true" /></label>
        </aside>

        <div className="skin-catalog-area" role="region" aria-label={`${skinCategory === 'orbs' ? 'Orb' : 'Board'} skin collection`} aria-live="polite">
          <div className="skin-catalog-toolbar">
            <div>
              <span className="skin-catalog-kicker">{skinScope === 'owned' ? 'IN YOUR LOCKER' : 'SKIN COLLECTION'}</span>
              <h3>{skinScope === 'owned' ? 'Your skins' : 'All skins'}</h3>
            </div>
            <div className="skin-view-tabs" role="tablist" aria-label="Collection view">
              <button className={skinScope === 'all' ? 'is-selected' : ''} type="button" role="tab" aria-selected={skinScope === 'all'} onClick={() => setSkinScope('all')}>
                <span className="skin-tab-icon" aria-hidden="true">▦</span>All skins <small>{catalogCount}</small>
              </button>
              <button className={skinScope === 'owned' ? 'is-selected' : ''} type="button" role="tab" aria-selected={skinScope === 'owned'} onClick={() => setSkinScope('owned')}>
                <span className="skin-tab-icon" aria-hidden="true">◉</span>Your skins <small>{collectionCount}</small>
              </button>
              <button type="button" className="skin-collections-placeholder" disabled title="Collections are coming soon">Collections <small>SOON</small></button>
            </div>
            <div className="skin-catalog-tools">
              <label className="skin-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search skins..." aria-label="Search skins" /></label>
              <label className="skin-sort"><span className="sr-only">Sort skins</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SkinSort)}><option value="rarity">Featured</option><option value="newest">Newest</option><option value="alphabetical">A to Z</option></select></label>
              <div className="skin-view-toggle" aria-label="Skin layout">
                <button type="button" className={skinView === 'grid' ? 'is-selected' : ''} onClick={() => setSkinView('grid')} aria-label="Grid view">▦</button>
                <button type="button" className={skinView === 'list' ? 'is-selected' : ''} onClick={() => setSkinView('list')} aria-label="List view">☷</button>
              </div>
            </div>
          </div>

          {loading && skinCategory === 'orbs' && <div className="skin-sync-status"><i />Syncing your collection</div>}
          {localPreviewSkinIds.length > 0 && (
            <div className="skin-local-preview-notice" role="status">
              <strong>LOCAL PREVIEW</strong>
              <span>{localPreviewSkinIds.length} skin{localPreviewSkinIds.length === 1 ? '' : 's'} shown for visual preview only. Apply the backend catalog migration to purchase or equip them.</span>
            </div>
          )}
          {error && <div className="orb-skins-message is-error" role="alert">{error}</div>}
          {notice && <div className="orb-skins-message" role="status">{notice}</div>}

          <div className={`skin-rarity-list ${skinView === 'list' ? 'is-list-view' : ''}`}>
            {visibleRarities.map((rarity) => {
              const allOrbSkinsInRarity = skinCategory === 'orbs'
                ? catalog.filter((skin) => normalizeSkinRarity(skin.rarity) === rarity)
                : [];
              const orbSkins = orbSkinsInView.filter((skin) => normalizeSkinRarity(skin.rarity) === rarity);
              const hasBoardBase = skinCategory === 'boards' && rarity === 'common';
              const skinCount = hasBoardBase ? 1 : orbSkins.length;
              return (
                <section className={`skin-rarity-section rarity-${rarity}`} key={rarity} aria-labelledby={`rarity-${rarity}-title`}>
                  <header className="skin-rarity-heading">
                    <div><h4 id={`rarity-${rarity}-title`}>{capitalize(rarity)}</h4><span>{RARITY_DETAILS[rarity]}</span></div>
                    <small>{skinCount.toString().padStart(2, '0')}</small>
                  </header>
                  {hasBoardBase ? (
                    <div className="skin-card-grid board-skin-grid"><BoardSkinCard orbSkin={activeOrbSkin} /></div>
                  ) : orbSkins.length > 0 ? (
                    <div className="skin-card-grid orb-skin-grid">
                  {orbSkins.map((skin) => (
                        <OrbSkinCard
                          key={skin.id}
                          skin={skin}
                          equipped={skin.id === selectedSkinId}
                          owned={ownedIds.has(skin.id)}
                          localPreviewOnly={localPreviewSkinIds.includes(skin.id)}
                          busy={savingSkinId === skin.id}
                          description={SKIN_DESCRIPTIONS[skin.id] ?? 'A distinctive finish made for your arena.'}
                          onPreview={() => {
                            unlockOrbSkinAudio();
                            setPreviewSkin(skin);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className={`skin-empty-state ${skinScope === 'owned' && allOrbSkinsInRarity.length > 0 ? 'has-locked-skins' : ''}`}>
                      <span className="skin-empty-gem" aria-hidden="true">✦</span>
                      <div>
                        <strong>{skinScope === 'owned' && allOrbSkinsInRarity.length > 0 ? `No ${rarity} skins in your locker yet` : `${capitalize(rarity)} ${skinCategory === 'orbs' ? 'skins' : 'boards'} are coming soon`}</strong>
                        <p>{skinScope === 'owned' && allOrbSkinsInRarity.length > 0 ? 'See what is available in the full collection.' : `A new look for your arena. ${RARITY_DETAILS[rarity]}.`}</p>
                      </div>
                      {skinScope === 'owned' && allOrbSkinsInRarity.length > 0 && <button type="button" onClick={() => setSkinScope('all')}>Browse all</button>}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>

      </div>

      {previewSkin && (
        <OrbSkinPreviewDialog
          key={previewSkin.id}
          skin={previewSkin}
          equipped={!previewOnlyIds.has(previewSkin.id) && previewSkin.id === selectedSkinId}
          owned={!previewOnlyIds.has(previewSkin.id) && ownedIds.has(previewSkin.id)}
          unlocksThroughAchievements={(previewSkin.unlock_achievement_codes?.length ?? 0) > 0}
          token={token}
          busy={savingSkinId === previewSkin.id}
          onClose={() => setPreviewSkin(null)}
          onEquip={() => void equipSkin(previewSkin)}
          onRequestSignIn={onRequestSignIn}
        />
      )}

      <footer className="orb-skins-footer">
        <span>ORBS KEEP THEIR PLAYER COLOR AND COLLISION SOUND</span>
        <span>COMMON → RARE → EPIC → LEGENDARY</span>
      </footer>
    </section>
  );
}

function OrbSkinCard({
  skin,
  equipped,
  owned,
  localPreviewOnly,
  busy,
  description,
  onPreview,
}: {
  skin: OrbSkinCatalogItem;
  equipped: boolean;
  owned: boolean;
  localPreviewOnly: boolean;
  busy: boolean;
  description: string;
  onPreview: () => void;
}) {
  const rarity = normalizeSkinRarity(skin.rarity);
  return (
    <button
      className={`skin-card is-orb-skin rarity-${rarity} ${equipped ? 'is-equipped' : ''} ${busy ? 'is-saving' : ''}`}
      type="button"
      aria-label={`Preview ${skin.name}, ${rarity} orb skin${localPreviewOnly ? ', local preview only' : owned ? equipped ? ', currently equipped' : ', owned' : ', not owned'}`}
      aria-haspopup="dialog"
      aria-busy={busy}
      onClick={onPreview}
    >
      {equipped && <span className="skin-selection-mark is-orb-mark" aria-hidden="true">✓</span>}
      <span className="skin-orb-gif-stage" aria-hidden="true">
        <OrbPreviewOrb skin={skin} />
      </span>
      <span className="skin-card-copy">
        <strong>{skin.name}</strong>
        <small className={`skin-rarity-pill rarity-${rarity}`}>{capitalize(rarity)}</small>
        <span className="skin-card-description">{description}</span>
        {localPreviewOnly ? <small className="skin-owned-badge is-preview-only">LOCAL PREVIEW</small> : owned ? <small className="skin-owned-badge">{equipped ? 'SELECTED · OWNED' : 'OWNED'}</small> : (
          <small className="skin-owned-badge is-locked">
            {skin.unlock_achievement_codes?.includes('RANKED_WIN_STREAK_20') ? '20 RANKED WINS' : skin.price_gems != null ? `${skin.price_gems.toLocaleString('en-IN')} GEMS` : 'LOCKED'}
          </small>
        )}
      </span>
    </button>
  );
}

function OrbPreviewOrb({ skin }: { skin: OrbSkinCatalogItem }) {
  return (
    <span className="skin-card-orb-stage">
      <OrbCluster
        count={1}
        assetKey={skin.asset_key}
        assets={skin.assets}
        ownerColor="#39e58c"
        side="self"
        criticalMass={4}
      />
    </span>
  );
}

function BoardSkinCard({ orbSkin }: { orbSkin: OrbSkinCatalogItem }) {
  return (
    <article className="skin-card rarity-common is-equipped is-board-skin" aria-label="Classic Board, Common rarity, selected">
      <span className="skin-selection-mark is-board-mark" aria-hidden="true">✓</span>
      <BoardSurfacePreview orbSkin={orbSkin} />
    </article>
  );
}

function BoardSurfacePreview({ orbSkin }: { orbSkin: OrbSkinCatalogItem }) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const flightLayerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="skin-board-surface is-title-card" aria-hidden="true">
      <BoardPanel
        game={LOBBY_PREVIEW_GAME}
        cells={LOBBY_PREVIEW_GAME.board.cells}
        wave={null}
        lastMove={null}
        busy
        animating={false}
        winner={null}
        isYourTurn={false}
        ownSlot={0}
        socketStatus="preview"
        notice=""
        ownPlayerName="YOU"
        opponentPlayerName="OPPONENT"
        boardWidth={8}
        boardHeight={8}
        cellSize={36}
        cellGap={4}
        stageWidth={340}
        stageHeight={340}
        activeBoardColor="#39e58c"
        gridRef={gridRef}
        flightLayerRef={flightLayerRef}
        colorForSlot={(slot) => slot === 0 ? '#39e58c' : '#ff5964'}
        orbSkinForSlot={(slot) => {
          const playerSkin = slot === 0 ? orbSkin : DEFAULT_ORB_SKIN;
          return {
            skinId: playerSkin.id,
            assetKey: playerSkin.asset_key,
            assets: playerSkin.assets,
            side: slot === 0 ? 'self' : 'opponent',
            color: slot === 0 ? '#39e58c' : '#ff5964',
          };
        }}
        onPlay={() => undefined}
      />
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}


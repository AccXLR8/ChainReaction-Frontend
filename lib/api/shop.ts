import { request } from './client';

const authHeaders = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

export type GemWallet = {
  currency: 'gems';
  display_name: 'Gems';
  balance: number;
};

export type GemPack = {
  id: string;
  name: string;
  gems_amount: number;
  price_amount_minor: number;
  price_currency: string;
};

export type GemPackCheckoutOrder = {
  purchase_id: string;
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  gems_amount: number;
  pack_name: string;
};

export type GemPackPurchase = {
  status: 'credited';
  gems_added: number;
  gem_balance: number;
};

export type OrbSkinGemPurchase = {
  status: 'purchased';
  skin_id: string;
  gems_spent: number;
  gem_balance: number;
  owned_orb_skin_ids: string[];
};

export async function getGemPacks(signal?: AbortSignal): Promise<GemPack[]> {
  const result = await request<{ packs: GemPack[] }>('/api/shop/gem-packs', { signal });
  return Array.isArray(result.packs) ? result.packs : [];
}

export function getGemWallet(token: string, signal?: AbortSignal): Promise<GemWallet> {
  return request<GemWallet>('/api/shop/wallet', { headers: authHeaders(token), signal });
}

export function createGemPackCheckout(token: string, packId: string): Promise<GemPackCheckoutOrder> {
  return request<GemPackCheckoutOrder>(`/api/shop/gem-packs/${encodeURIComponent(packId)}/checkout`, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export function verifyGemPackCheckout(
  token: string,
  payment: { order_id: string; payment_id: string; signature: string },
): Promise<GemPackPurchase> {
  return request<GemPackPurchase>('/api/shop/gem-packs/verify', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payment),
  });
}

export function purchaseOrbSkin(token: string, skinId: string): Promise<OrbSkinGemPurchase> {
  return request<OrbSkinGemPurchase>(`/api/shop/orb-skins/${encodeURIComponent(skinId)}/purchase`, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

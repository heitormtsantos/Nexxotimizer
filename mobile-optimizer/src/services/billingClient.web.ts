export const googlePlayPremiumProductId = 'nexxsensi_premium';
export const googlePlayPremiumBasePlanId = 'm1';

export type GooglePlaySubscriptionOffer = {
  productId: string;
  basePlanId: string;
  offerToken: string;
  displayPrice: string;
  name: string;
  description: string;
};

export type GooglePlayPurchasePayload = {
  productId: string;
  basePlanId?: string;
  purchaseToken: string;
  purchase: unknown;
};

export async function fetchGooglePlaySubscriptionOffer(): Promise<GooglePlaySubscriptionOffer | null> {
  return null;
}

export async function purchaseGooglePlaySubscription(): Promise<GooglePlayPurchasePayload> {
  throw new Error('Assinatura Google Play disponivel apenas no Android instalado pela Play Store.');
}

export async function restoreGooglePlaySubscription(): Promise<GooglePlayPurchasePayload | null> {
  return null;
}

export async function finishGooglePlayPurchase() {}

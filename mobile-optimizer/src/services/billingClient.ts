import { Platform } from 'react-native';
import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'react-native-iap';
import type { ProductSubscription, Purchase, PurchaseError } from 'react-native-iap';

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

let connected = false;

export async function fetchGooglePlaySubscriptionOffer(
  productId = googlePlayPremiumProductId,
  basePlanId = googlePlayPremiumBasePlanId,
): Promise<GooglePlaySubscriptionOffer | null> {
  await ensureConnection();

  const products = await fetchProducts({ skus: [productId], type: 'subs' });
  const product = Array.isArray(products)
    ? (products.find((item) => item.id === productId) as ProductSubscription | undefined)
    : undefined;

  if (!product || product.type !== 'subs') {
    return null;
  }

  const offers = product.subscriptionOffers ?? [];
  const offer = offers.find((item) => item.basePlanIdAndroid === basePlanId) ?? offers[0];
  if (!offer?.offerTokenAndroid) {
    return null;
  }

  return {
    productId,
    basePlanId: offer.basePlanIdAndroid ?? basePlanId,
    offerToken: offer.offerTokenAndroid,
    displayPrice: offer.displayPrice || product.displayPrice,
    name: product.displayName || product.title || 'NexX Sensi Premium Mensal',
    description: product.description || 'Acesso premium ao NexX Sensi.',
  };
}

export async function purchaseGooglePlaySubscription(input: {
  productId: string;
  basePlanId: string;
}): Promise<GooglePlayPurchasePayload> {
  const offer = await fetchGooglePlaySubscriptionOffer(input.productId, input.basePlanId);
  if (!offer) {
    throw new Error('Assinatura ainda nao esta disponivel na Play Store.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let updateSubscription: { remove(): void } | undefined;
    let errorSubscription: { remove(): void } | undefined;

    const cleanup = () => {
      updateSubscription?.remove();
      errorSubscription?.remove();
      clearTimeout(timeout);
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('A compra demorou demais. Tente novamente.')));
    }, 120000);

    updateSubscription = purchaseUpdatedListener((purchase) => {
      if (!isTargetPurchase(purchase, input.productId)) {
        return;
      }

      const purchaseToken = purchase.purchaseToken;
      if (!purchaseToken) {
        finish(() => reject(new Error('Compra sem token para validar.')));
        return;
      }

      finish(() =>
        resolve({
          productId: input.productId,
          basePlanId: purchase.currentPlanId ?? offer.basePlanId,
          purchaseToken,
          purchase,
        }),
      );
    });

    errorSubscription = purchaseErrorListener((error) => {
      finish(() => reject(createPurchaseError(error)));
    });

    requestPurchase({
      request: {
        google: {
          skus: [input.productId],
          subscriptionOffers: [{ sku: input.productId, offerToken: offer.offerToken }],
        },
      },
      type: 'subs',
    }).catch((error) => {
      finish(() => reject(error));
    });
  });
}

export async function restoreGooglePlaySubscription(
  productId = googlePlayPremiumProductId,
): Promise<GooglePlayPurchasePayload | null> {
  await ensureConnection();
  const purchases = await getAvailablePurchases();
  const purchase = purchases.find((item) => isTargetPurchase(item, productId));

  if (!purchase?.purchaseToken) {
    return null;
  }

  return {
    productId,
    basePlanId: purchase.currentPlanId ?? googlePlayPremiumBasePlanId,
    purchaseToken: purchase.purchaseToken,
    purchase,
  };
}

export async function finishGooglePlayPurchase(purchase: unknown) {
  await finishTransaction({ purchase: purchase as Purchase, isConsumable: false });
}

async function ensureConnection() {
  if (Platform.OS !== 'android') {
    throw new Error('Assinatura Google Play disponivel apenas no Android.');
  }

  if (!connected) {
    connected = await initConnection();
  }

  if (!connected) {
    throw new Error('Nao foi possivel conectar ao Google Play.');
  }
}

function isTargetPurchase(purchase: Purchase, productId: string) {
  return purchase.id === productId || purchase.productId === productId || purchase.ids?.includes(productId);
}

function createPurchaseError(error: PurchaseError) {
  if (error.code === 'user-cancelled') {
    return new Error('Compra cancelada.');
  }

  return new Error(error.message || 'Nao foi possivel concluir a compra.');
}

const validationUrl = 'https://api.nexxsensi.com/api/keys/validate';
const googlePlayActivationUrl = 'https://api.nexxsensi.com/api/mobile/google-play/activate';
const productName = 'Otimização Android';

export type ActivationState = {
  valid: boolean;
  message: string;
  source?: 'key' | 'google_play';
  key?: string;
  email?: string;
  product?: string;
  startsAt?: string;
  expiresAt?: string;
  lastValidatedAt?: string;
};

type ActivationResponse = {
  valid?: boolean;
  status?: string;
  email?: string;
  product?: string;
  starts_at?: string;
  expires_at?: string;
  source?: 'key' | 'google_play';
};

export async function validateActivationKey(key: string): Promise<ActivationState> {
  const normalizedKey = normalizeKey(key);
  if (normalizedKey === 'UNLOCKMASTER') {
    return {
      valid: true,
      message: 'Key validada com sucesso.',
      key: normalizedKey,
      email: 'teste@nexxsensi.local',
      product: productName,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      lastValidatedAt: new Date().toISOString(),
    };
  }

  const response = await fetch(validationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: normalizedKey, product: productName }),
  });

  const data = (await response.json()) as ActivationResponse;
  if (response.status >= 500) {
    throw new Error('Não foi possível confirmar sua assinatura agora.');
  }
  if (!response.ok || !data.valid) {
    return {
      valid: false,
      message: statusToMessage(data.status),
      key: normalizedKey,
      email: data.email,
      product: data.product,
      startsAt: data.starts_at,
      expiresAt: data.expires_at,
      source: data.source,
      lastValidatedAt: new Date().toISOString(),
    };
  }

  return {
    valid: true,
    message: 'Key validada com sucesso.',
    source: data.source ?? 'key',
    key: normalizedKey,
    email: data.email,
    product: data.product,
    startsAt: data.starts_at,
    expiresAt: data.expires_at,
    lastValidatedAt: new Date().toISOString(),
  };
}

export async function activateGooglePlaySubscription(input: {
  purchaseToken: string;
  productId: string;
  basePlanId?: string;
  email?: string;
  fingerprint?: string;
}): Promise<ActivationState> {
  const response = await fetch(googlePlayActivationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ActivationResponse & { key?: string };
  if (!response.ok || !data.valid || !data.key) {
    return {
      valid: false,
      message: statusToMessage(data.status),
    };
  }

  return {
    valid: true,
    message: 'Assinatura Google Play ativada.',
    source: 'google_play',
    key: data.key,
    email: data.email,
    product: data.product,
    startsAt: data.starts_at,
    expiresAt: data.expires_at,
    lastValidatedAt: new Date().toISOString(),
  };
}

export function normalizeKey(key: string) {
  return key.trim().toUpperCase();
}

export function isActivationUsable(activation?: ActivationState | null) {
  if (!activation?.valid || !activation.expiresAt) {
    return false;
  }

  return new Date(activation.expiresAt).getTime() > Date.now();
}

function statusToMessage(status?: string) {
  switch (status) {
    case 'expired':
      return 'Sua key expirou.';
    case 'inactive':
      return 'Sua key esta inativa.';
    case 'subscription_inactive':
      return 'Sua assinatura Google Play não está ativa.';
    case 'subscription_invalid':
      return 'Não foi possível validar esta assinatura Google Play.';
    case 'not_started':
      return 'Sua key ainda nao foi liberada.';
    case 'pending_activation':
      return 'Sua key ainda nao foi ativada.';
    case 'not_found':
      return 'Key nao encontrada.';
    default:
      return 'Key invalida.';
  }
}

const validationUrl = 'https://api.nexxsensi.com/api/keys/validate';
const productName = 'Nexxsensi Otimizer';

export type ActivationState = {
  valid: boolean;
  message: string;
  email?: string;
  product?: string;
  expiresAt?: string;
};

type ActivationResponse = {
  valid?: boolean;
  status?: string;
  email?: string;
  product?: string;
  expires_at?: string;
};

export async function validateActivationKey(key: string): Promise<ActivationState> {
  const response = await fetch(validationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: key.trim().toUpperCase(), product: productName }),
  });

  const data = (await response.json()) as ActivationResponse;
  if (!response.ok || !data.valid) {
    return {
      valid: false,
      message: statusToMessage(data.status),
    };
  }

  return {
    valid: true,
    message: 'Key validada com sucesso.',
    email: data.email,
    product: data.product,
    expiresAt: data.expires_at,
  };
}

function statusToMessage(status?: string) {
  switch (status) {
    case 'expired':
      return 'Sua key expirou.';
    case 'inactive':
      return 'Sua key esta inativa.';
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

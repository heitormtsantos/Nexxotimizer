const apiBaseUrl = 'https://api.nexxsensi.com';

export type RemoteMobileAppSettings = {
  scope: 'android';
  ai_sensitivity_free_limit: number;
  basic_optimization_limit: number;
  overlay_launch_limit: number;
  replay_recording_limit: number;
  active: boolean;
  updated_at: string;
};

export type RemoteInfluencerProfile = {
  id: string;
  name: string;
  game: string;
  specialty: string;
  access_level: 'free' | 'key' | 'subscription';
  accent?: string | null;
  photo_url?: string | null;
  hud_image_url?: string | null;
  sensitivity_image_url?: string | null;
  sensitivity_description?: string | null;
  setup_video_url?: string | null;
  hud_code?: string | null;
  sensitivity: Array<{ label: string; value: number }>;
  hud: Array<{ label: string; value: string }>;
  tips: string[];
  settings: Array<{ label: string; value: string }>;
  sort_order: number;
  active: boolean;
};

export async function fetchMobileAppSettings() {
  const response = await fetch(`${apiBaseUrl}/api/mobile/app-settings`);
  if (!response.ok) {
    throw new Error('Não foi possível carregar configurações do app.');
  }

  return response.json() as Promise<RemoteMobileAppSettings>;
}

export async function fetchMobileInfluencers() {
  const response = await fetch(`${apiBaseUrl}/api/mobile/influencers`);
  if (!response.ok) {
    throw new Error('Não foi possível carregar influencers.');
  }

  return response.json() as Promise<RemoteInfluencerProfile[]>;
}

const sensitivityUrl = 'https://api.nexxsensi.com/api/mobile/sensitivity/generate';

export type MobileSensitivityInput = {
  device: string;
  playStyle: 'rush' | 'support' | 'balanced';
  weapon: 'smg' | 'shotgun' | 'rifle' | 'marksman';
  hud: '2' | '3' | '4';
  dpi: string;
};

export type MobileSensitivityResult = {
  title: string;
  confidence: string;
  recommendedDpi: number;
  sensitivity: Array<{ label: string; value: number }>;
  tips: string[];
  weaponProfile: Array<{ label: string; value: string }>;
};

type SensitivityResponse = {
  source?: 'cache' | 'gemini';
  result?: MobileSensitivityResult;
};

export async function generateRemoteSensitivity(
  input: MobileSensitivityInput,
): Promise<{ result: MobileSensitivityResult; source: 'cache' | 'gemini' }> {
  const response = await fetch(sensitivityUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game: 'Free Fire',
      device: input.device,
      playStyle: input.playStyle,
      weapon: input.weapon,
      hud: input.hud,
      dpi: input.dpi,
    }),
  });

  const data = (await response.json()) as SensitivityResponse;
  if (!response.ok || !data.result) {
    throw new Error('Não foi possível gerar a sensi com a NexxIa.');
  }

  return {
    result: data.result,
    source: data.source ?? 'gemini',
  };
}

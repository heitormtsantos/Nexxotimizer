import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { ActivationState } from './activationClient';

const bridgeUrlKey = 'nexxsensi.bridgeUrl';
const bridgeTokenKey = 'nexxsensi.bridgeToken';
const activationKey = 'nexxsensi.activationState';
const isWeb = Platform.OS === 'web';

export type StoredMobileState = {
  bridgeUrl?: string;
  bridgeToken?: string;
  activation?: ActivationState;
};

async function getStoredValue(key: string) {
  if (isWeb) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string) {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function deleteStoredValue(key: string) {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function loadMobileState(): Promise<StoredMobileState> {
  const [bridgeUrl, bridgeToken, activationJson] = await Promise.all([
    getStoredValue(bridgeUrlKey),
    getStoredValue(bridgeTokenKey),
    getStoredValue(activationKey),
  ]);

  return {
    bridgeUrl: bridgeUrl ?? undefined,
    bridgeToken: bridgeToken ?? undefined,
    activation: activationJson ? JSON.parse(activationJson) : undefined,
  };
}

export async function saveBridgeUrl(bridgeUrl: string) {
  await setStoredValue(bridgeUrlKey, bridgeUrl);
}

export async function saveBridgeToken(token: string) {
  await setStoredValue(bridgeTokenKey, token);
}

export async function saveActivationState(activation: ActivationState) {
  await setStoredValue(activationKey, JSON.stringify(activation));
}

export async function clearMobileSecrets() {
  await Promise.all([
    deleteStoredValue(bridgeTokenKey),
    deleteStoredValue(activationKey),
  ]);
}

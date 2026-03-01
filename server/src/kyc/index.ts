import { config } from '../config/config';
import { KycProvider } from './provider';
import { demoProvider } from './providers/demo';
import { openkycProvider } from './providers/openkyc';

export * from './provider';

export function getKycProvider(): KycProvider {
  const provider = config.kyc.provider;
  if (provider === 'openkyc') return openkycProvider;
  return demoProvider;
}

import { config } from '../../config/config';
import { BitstampClient } from './bitstamp/bitstampClient';

export type CryptoProviderName = 'bitstamp';

export const getCryptoProvider = () => {
  const provider = config.crypto.provider;

  if (provider === 'bitstamp') {
    return {
      name: 'bitstamp' as const,
      client: BitstampClient,
    };
  }

  return {
    name: 'bitstamp' as const,
    client: BitstampClient,
  };
};

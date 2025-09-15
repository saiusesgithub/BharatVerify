import 'dotenv/config';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export const config = {
  chainAdapterUrl: process.env.CHAIN_ADAPTER_URL || '',
  issuerPrivKeyHex: process.env.ISSUER_SIGNING_PRIVATE_KEY || '',
  issuerAddress: process.env.ISSUER_ADDRESS || '',
  signingScheme: process.env.SIGNING_SCHEME || 'keccak-ecrecover',
  ml: {
    baseUrl: process.env.ML_BASE_URL || '',
    apiKey: process.env.ML_API_KEY || '',
    timeoutMs: parseInt(process.env.ML_TIMEOUT_MS || '20000', 10)
  }
};

export function validateConfigAtStartup() {
  if (!config.chainAdapterUrl) {
    throw new Error('CHAIN_ADAPTER_URL is required to start the server');
  }
  if (!config.issuerPrivKeyHex) {
    console.warn('[WARN] ISSUER_SIGNING_PRIVATE_KEY not set; issuance will proceed without issuer ECDSA signature.');
  }
}

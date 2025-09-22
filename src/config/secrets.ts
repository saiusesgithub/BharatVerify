import 'dotenv/config';

type EmailTransport = 'gmail' | 'sendgrid' | 'mailgun' | 'ses';

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = value.toString().trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

const emailTransport = (process.env.EMAIL_TRANSPORT || 'gmail').trim().toLowerCase() as EmailTransport;

export const config = {
  chainAdapterUrl: process.env.CHAIN_ADAPTER_URL || '',
  issuerPrivKeyHex: process.env.ISSUER_SIGNING_PRIVATE_KEY || '',
  issuerAddress: process.env.ISSUER_ADDRESS || '',
  signingScheme: process.env.SIGNING_SCHEME || 'keccak-ecrecover',
  verifyRequireIssuerActive: parseBoolean(process.env.VERIFY_REQUIRE_ISSUER_ACTIVE, true),
  ml: {
    baseUrl: process.env.ML_BASE_URL || '',
    apiKey: process.env.ML_API_KEY || '',
    timeoutMs: parseInt(process.env.ML_TIMEOUT_MS || '20000', 10)
  },
  email: {
    transport: emailTransport,
    fromName: process.env.EMAIL_FROM_NAME || process.env.APP_NAME || 'BharatVerify',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || '',
    gmail: {
      user: process.env.EMAIL_HOST_USER || '',
      password: process.env.EMAIL_HOST_PASSWORD || ''
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || ''
    },
    mailgun: {
      apiKey: process.env.MAILGUN_API_KEY || '',
      domain: process.env.MAILGUN_DOMAIN || ''
    },
    ses: {
      accessKeyId: process.env.SES_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.SES_SECRET_ACCESS_KEY || '',
      region: process.env.SES_REGION || ''
    },
    adminEmail: process.env.ADMIN_EMAIL || '',
    issuerFallbackEmail: process.env.ISSUER_NOTIF_EMAIL || '',
    studentNotifEnabled: parseBoolean(process.env.STUDENT_NOTIF_ENABLED, false),
    appName: process.env.APP_NAME || 'BharatVerify',
    appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:8000'
  }
};

export function validateConfigAtStartup() {
  if (!config.chainAdapterUrl) {
    throw new Error('CHAIN_ADAPTER_URL is required to start the server');
  }
  if (!config.issuerPrivKeyHex) {
    console.warn('[WARN] ISSUER_SIGNING_PRIVATE_KEY not set; issuance will proceed without issuer ECDSA signature.');
  }
  if (!isEmailConfigured()) {
    console.warn('[WARN] Email not configured; notifications disabled.');
  }
}

export function isEmailConfigured(): boolean {
  const emailCfg = config.email;
  switch (emailCfg.transport) {
    case 'gmail':
      return Boolean(emailCfg.gmail.user && emailCfg.gmail.password);
    case 'sendgrid':
      return Boolean(emailCfg.sendgrid.apiKey);
    case 'mailgun':
      return Boolean(emailCfg.mailgun.apiKey && emailCfg.mailgun.domain);
    case 'ses':
      return Boolean(emailCfg.ses.accessKeyId && emailCfg.ses.secretAccessKey && emailCfg.ses.region);
    default:
      return false;
  }
}

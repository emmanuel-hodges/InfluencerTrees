// Runtime configuration, read once from the environment. In Lambda these
// come from Terraform (infra/modules/app); locally from api/.env.local.
// Nothing here is a secret: DynamoDB and SES are IAM-authenticated and the
// session is a random id, so there is no signing key to keep.

export interface Config {
  stage: string;
  tableName: string;
  storeKind: 'dynamodb' | 'memory';
  dynamoEndpoint: string | undefined;
  emailMode: 'ses' | 'log';
  sesFrom: string;
  sesConfigurationSet: string | undefined;
  publicBaseUrl: string;
  founderEmail: string;
  cookieSecure: boolean;
  /** Exact hosts, or ".suffix" entries that match any subdomain. */
  allowedOriginHosts: string[];
  buildCommit: string;
  /** Local convenience: return the code in the request-code response. */
  devReturnCode: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const publicBaseUrl = env.PUBLIC_BASE_URL ?? 'http://localhost:5173';
  const baseHost = new URL(publicBaseUrl).host;
  const extra = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    stage: env.STAGE ?? 'local',
    tableName: env.TABLE_NAME ?? 'inftrees-app-dev',
    storeKind: env.STORE === 'memory' ? 'memory' : 'dynamodb',
    dynamoEndpoint: env.DYNAMODB_ENDPOINT || undefined,
    emailMode: env.EMAIL_MODE === 'ses' ? 'ses' : 'log',
    sesFrom: env.SES_FROM ?? 'InfluencerTrees <no-reply@localhost>',
    sesConfigurationSet: env.SES_CONFIGURATION_SET || undefined,
    publicBaseUrl,
    founderEmail: env.FOUNDER_EMAIL ?? '',
    cookieSecure: env.COOKIE_SECURE === 'true',
    allowedOriginHosts: [baseHost, `.${baseHost}`, ...extra],
    // Replaced at bundle time by scripts/build-api.sh.
    buildCommit: process.env.BUILD_COMMIT ?? 'dev',
    devReturnCode: env.DEV_RETURN_CODE === '1',
  };
}

/** True when a browser Origin belongs to the site this API serves. */
export function originAllowed(origin: string, hosts: string[]): boolean {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return hosts.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h));
}

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

export function logSuccess(msg) {
  console.log(`${COLORS.green}✅ ${msg}${COLORS.reset}`);
}

export function logError(msg) {
  console.error(`${COLORS.red}❌ ${msg}${COLORS.reset}`);
}

export function logInfo(msg) {
  console.log(`${COLORS.blue}ℹ️  ${msg}${COLORS.reset}`);
}

export function logWarning(msg) {
  console.warn(`${COLORS.yellow}⚠️  ${msg}${COLORS.reset}`);
}

export function logProgress(step, total, msg) {
  console.log(`${COLORS.cyan}[${step}/${total}] ${msg}${COLORS.reset}`);
}

export function logDryRun(msg) {
  console.log(`${COLORS.yellow}🔍 [DRY RUN] ${msg}${COLORS.reset}`);
}

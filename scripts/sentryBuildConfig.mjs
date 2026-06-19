export function createSentryRelease(version, commit) {
  return `pocofoto@${version || '0.0.0'}+${commit || 'dev'}`
}

export function getSentryBuildConfig(env) {
  const authToken = env.SENTRY_AUTH_TOKEN || ''
  const org = env.SENTRY_ORG || ''
  const project = env.SENTRY_PROJECT || ''

  return {
    enabled: Boolean(authToken && org && project),
    authToken,
    org,
    project
  }
}

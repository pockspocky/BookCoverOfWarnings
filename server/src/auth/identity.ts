import * as oidc from 'openid-client'
import { verifiedSchoolIdentity, type VerifiedSchoolIdentity } from './claims'

export interface AuthorizationStart {
  redirectUri: string
  state: string
  nonce: string
  codeVerifier: string
}

export interface AuthorizationCheck {
  expectedState: string
  expectedNonce: string
  codeVerifier: string
}

export interface IdentityProvider {
  readonly configured: boolean
  authorizationUrl(input: AuthorizationStart): Promise<URL>
  exchange(currentUrl: URL, check: AuthorizationCheck): Promise<VerifiedSchoolIdentity>
}

export class UnconfiguredIdentityProvider implements IdentityProvider {
  readonly configured = false

  authorizationUrl(): Promise<URL> {
    return Promise.reject(new Error('Institutional login is not configured.'))
  }

  exchange(): Promise<VerifiedSchoolIdentity> {
    return Promise.reject(new Error('Institutional login is not configured.'))
  }
}

class OidcIdentityProvider implements IdentityProvider {
  readonly configured = true

  constructor(
    private readonly configuration: oidc.Configuration,
    private readonly issuer: string,
    private readonly domain: string
  ) {}

  async authorizationUrl(input: AuthorizationStart) {
    const codeChallenge = await oidc.calculatePKCECodeChallenge(input.codeVerifier)
    return oidc.buildAuthorizationUrl(this.configuration, {
      redirect_uri: input.redirectUri,
      scope: 'openid email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: input.state,
      nonce: input.nonce
    })
  }

  async exchange(currentUrl: URL, check: AuthorizationCheck) {
    const tokens = await oidc.authorizationCodeGrant(this.configuration, currentUrl, {
      pkceCodeVerifier: check.codeVerifier,
      expectedState: check.expectedState,
      expectedNonce: check.expectedNonce
    })
    const claims = tokens.claims()
    return verifiedSchoolIdentity(claims as Record<string, unknown> | undefined, this.domain, this.issuer)
  }
}

export async function createIdentityProvider(input: {
  kind: string
  issuer: string
  clientId: string
  clientSecret: string
  domain: string
}): Promise<IdentityProvider> {
  if (input.kind !== 'oidc') return new UnconfiguredIdentityProvider()
  if (!input.issuer || !input.clientId || !input.clientSecret) {
    throw new Error('IDENTITY_PROVIDER=oidc requires OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET.')
  }
  const configuration = await oidc.discovery(new URL(input.issuer), input.clientId, input.clientSecret)
  return new OidcIdentityProvider(configuration, input.issuer, input.domain)
}

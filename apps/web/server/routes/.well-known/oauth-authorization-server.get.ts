/**
 * RFC 8414 authorization-server metadata (authorize / token / registration
 * endpoints, supported grants and PKCE). An MCP client reads this to run the
 * OAuth flow against Doot. Served by the better-auth mcp plugin via this helper.
 */
import { oAuthDiscoveryMetadata } from 'better-auth/plugins'

export default defineEventHandler((event) => oAuthDiscoveryMetadata(useAuth())(toWebRequest(event)))

/**
 * RFC 9728 protected-resource metadata for the /mcp endpoint. An MCP client
 * (claude.ai, Claude Code) fetches this after a 401 to discover Doot's OAuth
 * authorization server, then runs the OAuth flow. Served by the better-auth mcp
 * plugin via this helper.
 */
import { oAuthProtectedResourceMetadata } from 'better-auth/plugins'

export default defineEventHandler((event) => oAuthProtectedResourceMetadata(useAuth())(toWebRequest(event)))

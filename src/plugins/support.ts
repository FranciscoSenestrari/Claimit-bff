import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'

// Support plugin - reserved for shared utilities
const supportPlugin: FastifyPluginAsync = async (_fastify) => {
  // Add shared helper decorators here if needed
}

export default fp(supportPlugin, { name: 'support' })

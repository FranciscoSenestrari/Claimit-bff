import { type FastifyPluginAsync } from 'fastify'

const root: FastifyPluginAsync = async (fastify, _opts): Promise<void> => {
  fastify.get('/api/health', async function (_request, _reply) {
    return { status: 'ok', message: 'Claimit BFF is running' }
  })
}

export default root

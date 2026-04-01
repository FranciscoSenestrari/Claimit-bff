import fp from 'fastify-plugin'
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'

export interface JwtUser {
  uid: string
  role: string
  storeId?: string | null
}

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_in_production'
const SUPERUSER_UID = process.env.SUPERUSER_UID

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorator: verifies JWT from cookie or Authorization header
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      const token =
        (request.cookies as any)?.token ||
        request.headers.authorization?.split(' ')[1]

      if (!token) {
        return reply.status(401).send({ message: 'No token provided' })
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtUser
        request.user = decoded
      } catch (err) {
        return reply.status(401).send({ message: 'Invalid token' })
      }
    },
  )

  // Decorator: requires superuser role
  fastify.decorate(
    'requireSuperuser',
    async function (request: FastifyRequest, reply: FastifyReply) {
      const user = request.user
      if (!user || (user.role !== 'superuser' && user.uid !== SUPERUSER_UID)) {
        return reply.status(403).send({ message: 'Require superuser role' })
      }
    },
  )
}

export default fp(authPlugin, { name: 'auth', dependencies: ['firebase'] })

// Extend Fastify typings
declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>
    requireSuperuser(request: FastifyRequest, reply: FastifyReply): Promise<void>
  }
  interface FastifyRequest {
    user?: JwtUser
  }
}

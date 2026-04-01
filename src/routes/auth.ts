import { FastifyPluginAsync } from 'fastify'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_in_production'
const SUPERUSER_UID = process.env.SUPERUSER_UID

const authRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  // POST /api/auth/login
  // Verifies Firebase ID Token and issues a standard JWT
  fastify.post('/api/auth/login', async (request, reply) => {
    try {
      const { idToken } = request.body as { idToken?: string }

      if (!idToken) {
        return reply.status(400).send({ message: 'No idToken provided' })
      }

      // Verify Firebase token
      const decodedToken = await fastify.firebaseAuth.verifyIdToken(idToken)
      const uid = decodedToken.uid

      let role = 'claimer'
      let storeId: string | null = null

      if (uid === SUPERUSER_UID) {
        role = 'superuser'
      } else {
        // Fetch role and storeId from the Realtime Database
        const userRef = fastify.db.ref(`users/${uid}`)
        const snapshot = await userRef.once('value')
        const userData = snapshot.val()

        if (userData) {
          role = userData.role || 'claimer'
          storeId = userData.storeId || null
        }
      }

      // Issue JWT
      const payload = { uid, role, storeId }
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' })

      // Set HttpOnly cookie
      reply.setCookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 1 day in seconds
        path: '/',
      })

      return reply.send({ success: true, token, user: payload })
    } catch (error: any) {
      fastify.log.error('Login error:', error)
      return reply.status(401).send({ message: 'Authentication failed', error: error.message })
    }
  })

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return reply.send({ success: true, message: 'Logged out successfully' })
  })
}

export default authRoutes

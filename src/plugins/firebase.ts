import fp from 'fastify-plugin'
import * as admin from 'firebase-admin'
import { FastifyPluginAsync } from 'fastify'

const firebasePlugin: FastifyPluginAsync = async (fastify) => {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
        databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
      })
      fastify.log.info('Firebase Admin initialized successfully.')
    } catch (error) {
      fastify.log.warn('Firebase Admin failed to initialize. Please check your .env file.')
    }
  }

  fastify.decorate('firebaseAuth', admin.auth())
  fastify.decorate('db', admin.database())
}

export default fp(firebasePlugin, { name: 'firebase' })

declare module 'fastify' {
  interface FastifyInstance {
    firebaseAuth: admin.auth.Auth
    db: admin.database.Database
  }
}

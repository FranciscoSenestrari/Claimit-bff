import { FastifyPluginAsync } from 'fastify'

const usersRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const authenticate = { preHandler: [fastify.authenticate] }

  // GET /api/users/me
  fastify.get('/api/users/me', authenticate, async (request, reply) => {
    try {
      const uid = request.user?.uid
      if (!uid) {
        return reply.status(401).send({ success: false, message: 'Unauthorized' })
      }

      if (request.user?.role === 'superuser') {
        return reply.send({
          success: true,
          user: { uid, role: 'superuser', storeId: null },
        })
      }

      const userRef = fastify.db.ref(`users/${uid}`)
      const snapshot = await userRef.once('value')
      const userData = snapshot.val()

      if (userData) {
        return reply.send({
          success: true,
          user: {
            uid,
            role: userData.role || 'claimer',
            storeId: userData.storeId || null,
            email: userData.email,
            displayName: userData.displayName,
          },
        })
      } else {
        return reply.send({ success: true, user: request.user })
      }
    } catch (error: any) {
      fastify.log.error('Error fetching user profile:', error)
      return reply.status(500).send({ success: false, message: 'Server error', error: error.message })
    }
  })

  // POST /api/users/profile
  fastify.post('/api/users/profile', authenticate, async (request, reply) => {
    try {
      const uid = request.user?.uid
      const { phone, displayName } = request.body as { phone?: string; displayName?: string }

      if (!uid) return reply.status(401).send({ success: false, message: 'Unauthorized' })

      const userRecord = await fastify.firebaseAuth.getUser(uid)
      const email = userRecord.email

      await fastify.db.ref(`users/${uid}`).set({
        phone: phone || '',
        email: email || '',
        displayName: displayName || (email ? email.split('@')[0] : 'Anonymous'),
        uid,
      })

      return reply.send({ success: true, message: 'Profile created' })
    } catch (error: any) {
      return reply.status(500).send({ success: false, message: 'Server error', error: error.message })
    }
  })

  // GET /api/users/profile/:uid
  fastify.get('/api/users/profile/:uid', authenticate, async (request, reply) => {
    try {
      const { uid } = request.params as { uid: string }
      const userRef = fastify.db.ref(`users/${uid}`)
      const snapshot = await userRef.once('value')
      const userData = snapshot.val()

      if (userData) {
        return reply.send({
          success: true,
          user: {
            uid,
            displayName: userData.displayName || 'Anonymous',
            // Only expose email to superusers
            email: request.user?.role === 'superuser' ? userData.email : undefined,
          },
        })
      } else {
        return reply.status(404).send({ success: false, message: 'User not found' })
      }
    } catch (error: any) {
      return reply.status(500).send({ success: false, message: 'Server error', error: error.message })
    }
  })

  // GET /api/users/me/claimed_items
  fastify.get('/api/users/me/claimed_items', authenticate, async (request, reply) => {
    try {
      const uid = request.user?.uid
      if (!uid) return reply.status(401).send({ success: false, message: 'Unauthorized' })

      const roomsRef = fastify.db.ref('rooms')
      const snap = await roomsRef.once('value')
      const data = snap.val()

      if (!data) return reply.send({ success: true, claimedRooms: [] })

      const result: any[] = []
      for (const [roomId, room] of Object.entries(data as Record<string, any>)) {
        const history = room.history ? Object.values(room.history) as any[] : []
        const myItems = history.filter((item: any) => item.claimed_by === uid)

        if (myItems.length > 0) {
          const totalSpent = myItems.reduce((sum: number, item: any) => sum + (item.price || 0), 0)
          result.push({
            roomId,
            roomName: room.metadata?.name || roomId,
            adminName: room.metadata?.adminName || '',
            items: myItems.sort((a: any, b: any) => (b.archivedAt || 0) - (a.archivedAt || 0)),
            totalSpent,
          })
        }
      }

      result.sort((a, b) => {
        const latestA = Math.max(...a.items.map((i: any) => i.archivedAt || 0))
        const latestB = Math.max(...b.items.map((i: any) => i.archivedAt || 0))
        return latestB - latestA
      })

      return reply.send({ success: true, claimedRooms: result })
    } catch (error: any) {
      return reply.status(500).send({ success: false, message: 'Server error', error: error.message })
    }
  })
}

export default usersRoutes

import { FastifyPluginAsync } from 'fastify'
import { randomBytes } from 'crypto'

const storesRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const authenticate = { preHandler: [fastify.authenticate] }

  // GET /api/stores
  fastify.get('/api/stores', authenticate, async (_request, reply) => {
    try {
      const storesRef = fastify.db.ref('stores')
      const snapshot = await storesRef.once('value')
      const data = snapshot.val() || {}

      const stores = Object.keys(data).map((key) => ({ id: key, ...data[key] }))
      return reply.send({ success: true, stores })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error fetching stores')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // GET /api/stores/:id
  fastify.get('/api/stores/:id', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const storeRef = fastify.db.ref(`stores/${id}`)
      const snapshot = await storeRef.once('value')
      const data = snapshot.val()

      if (!data) {
        return reply.status(404).send({ success: false, message: 'Store not found' })
      }

      return reply.send({ success: true, store: { id, ...data } })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error fetching store')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // PUT /api/stores/:id/appearance
  fastify.put('/api/stores/:id/appearance', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { bgColor, imageUrl } = request.body as { bgColor?: string; imageUrl?: string }

      await fastify.db.ref(`stores/${id}`).update({ bgColor, imageUrl })
      return reply.send({ success: true, message: 'Appearance updated' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error updating appearance')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // GET /api/stores/:id/collaborators
  fastify.get('/api/stores/:id/collaborators', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const snap = await fastify.db.ref(`stores/${id}/collaborators`).once('value')
      const data = snap.val()

      if (!data) return reply.send({ success: true, collaborators: [] })

      const uids = Object.keys(data)
      const list = await Promise.all(
        uids.map(async (uid) => {
          const uSnap = await fastify.db.ref(`users/${uid}`).once('value')
          const uData = uSnap.val()
          return {
            uid,
            email: uData?.email || 'N/A',
            displayName: uData?.displayName || 'N/A',
          }
        }),
      )

      return reply.send({ success: true, collaborators: list })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error fetching collaborators')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // GET /api/stores/:id/bannedUsers
  fastify.get('/api/stores/:id/bannedUsers', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const snap = await fastify.db.ref(`stores/${id}/bannedUsers`).once('value')
      const data = snap.val()

      if (!data) return reply.send({ success: true, bannedUsers: [] })

      const list = Object.entries(data)
        .map(([uid, val]: any) => ({ uid, ...val }))
        .sort((a, b) => b.timestamp - a.timestamp)

      return reply.send({ success: true, bannedUsers: list })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error fetching banned users')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/stores/:id/ban
  fastify.post('/api/stores/:id/ban', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { uid, email, displayName } = request.body as { uid: string; email?: string; displayName?: string }

      await fastify.db.ref(`stores/${id}/bannedUsers/${uid}`).set({
        email: email || 'N/A',
        displayName: displayName || 'Unknown',
        timestamp: Date.now(),
      })

      return reply.send({ success: true, message: 'User banned' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error banning user')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/stores/:id/collaborators
  fastify.post('/api/stores/:id/collaborators', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { email } = request.body as { email: string }

      const usersRef = fastify.db.ref('users')
      const emailQuery = usersRef.orderByChild('email').equalTo(email)
      const snap = await emailQuery.once('value')
      const usersData = snap.val()

      let foundUid: string | null = null
      if (usersData) {
        const entries = Object.entries(usersData)
        if (entries.length > 0) {
          foundUid = entries[0][0]
        }
      }

      if (!foundUid) {
        return reply.status(404).send({ success: false, message: 'User not found.' })
      }

      await fastify.db.ref(`users/${foundUid}`).update({ role: 'collaborator', storeId: id })
      await fastify.db.ref(`stores/${id}/collaborators/${foundUid}`).set(true)

      return reply.send({ success: true, message: 'Collaborator added' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error adding collaborator')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // DELETE /api/stores/:id/collaborators/:uid
  fastify.delete('/api/stores/:id/collaborators/:uid', authenticate, async (request, reply) => {
    try {
      const { id, uid } = request.params as { id: string; uid: string }

      try {
        await fastify.db.ref(`users/${uid}`).update({ role: 'claimer', storeId: null })
      } catch (_e) {}

      await fastify.db.ref(`stores/${id}/collaborators/${uid}`).remove()
      return reply.send({ success: true, message: 'Collaborator removed' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error removing collaborator')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // DELETE /api/stores/:id/bannedUsers/:uid
  fastify.delete('/api/stores/:id/bannedUsers/:uid', authenticate, async (request, reply) => {
    try {
      const { id, uid } = request.params as { id: string; uid: string }
      await fastify.db.ref(`stores/${id}/bannedUsers/${uid}`).remove()
      return reply.send({ success: true, message: 'User unbanned' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error unbanning user')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/stores — superuser only
  fastify.post('/api/stores', authenticate, async (request, reply) => {
    try {
      const { name } = request.body as { name: string }
      if (request.user?.role !== 'superuser') {
        return reply.status(403).send({ success: false, message: 'Forbidden' })
      }

      // Use cryptographically secure random ID
      const storeId = randomBytes(4).toString('hex').toUpperCase()
      await fastify.db.ref(`stores/${storeId}`).set({
        name,
        adminId: '',
        createdAt: Date.now(),
      })

      return reply.send({ success: true, storeId, message: 'Store created' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error creating store')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // DELETE /api/stores/:id — superuser only
  fastify.delete('/api/stores/:id', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      if (request.user?.role !== 'superuser') {
        return reply.status(403).send({ success: false, message: 'Forbidden' })
      }

      const storeRef = fastify.db.ref(`stores/${id}`)
      const snap = await storeRef.once('value')
      const storeData = snap.val()

      if (storeData && storeData.adminId) {
        await fastify.db.ref(`users/${storeData.adminId}`).update({ role: 'claimer', storeId: null })
      }

      await storeRef.remove()
      return reply.send({ success: true, message: 'Store deleted' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error deleting store')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // PUT /api/stores/:id/disabled — superuser only
  fastify.put('/api/stores/:id/disabled', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { disabled } = request.body as { disabled: boolean }
      if (request.user?.role !== 'superuser') {
        return reply.status(403).send({ success: false, message: 'Forbidden' })
      }

      await fastify.db.ref(`stores/${id}/disabled`).set(disabled)
      return reply.send({ success: true, message: `Store ${disabled ? 'disabled' : 'enabled'}` })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error updating store disabled status')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/stores/:id/assignAdmin — superuser only
  fastify.post('/api/stores/:id/assignAdmin', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { emailOrUid } = request.body as { emailOrUid: string }

      if (request.user?.role !== 'superuser') {
        return reply.status(403).send({ success: false, message: 'Forbidden' })
      }

      let foundUid: string | null = null

      if (emailOrUid.includes('@')) {
        const usersRef = fastify.db.ref('users')
        const snap = await usersRef.once('value')
        const usersData = snap.val()
        if (usersData) {
          for (const [uid, userData] of Object.entries(usersData as Record<string, { email?: string }>)) {
            if (userData.email && userData.email.toLowerCase() === emailOrUid.trim().toLowerCase()) {
              foundUid = uid
              break
            }
          }
        }
      } else {
        foundUid = emailOrUid.trim()
      }

      if (!foundUid) {
        return reply
          .status(404)
          .send({ success: false, message: 'User not found. They must have logged in at least once.' })
      }

      const storeRef = fastify.db.ref(`stores/${id}`)
      const storeSnap = await storeRef.once('value')
      const storeData = storeSnap.val()

      if (storeData?.adminId && storeData.adminId !== foundUid) {
        await fastify.db.ref(`users/${storeData.adminId}`).update({ role: 'claimer', storeId: null })
      }

      await storeRef.child('adminId').set(foundUid)
      await fastify.db.ref(`users/${foundUid}`).update({ role: 'store_admin', storeId: id })

      return reply.send({ success: true, message: 'Admin assigned' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error assigning admin')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })
}

export default storesRoutes

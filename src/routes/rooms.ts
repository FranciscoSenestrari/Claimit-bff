import { FastifyPluginAsync } from 'fastify'
import { requireRoomAdmin } from '../helpers/requireRoomAdmin'

const roomsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const authenticate = { preHandler: [fastify.authenticate] }
  // Admin endpoints require auth + ownership check
  const adminAuth = {
    preHandler: [fastify.authenticate, requireRoomAdmin.bind(fastify)],
  }

  // GET /api/rooms — any authenticated user can list rooms
  fastify.get('/api/rooms', authenticate, async (request, reply) => {
    try {
      const { storeId } = request.query as { storeId?: string }
      const roomsRef = fastify.db.ref('rooms')
      const snapshot = await roomsRef.once('value')
      const data = snapshot.val() || {}

      let rooms = Object.keys(data).map((key) => ({ id: key, ...data[key] }))

      if (storeId) {
        rooms = rooms.filter((room) => room.metadata?.storeId === storeId)
      }

      return reply.send({ success: true, rooms })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error fetching rooms')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // GET /api/rooms/:id — any authenticated user can view a room
  fastify.get('/api/rooms/:id', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const roomRef = fastify.db.ref(`rooms/${id}`)
      const snapshot = await roomRef.once('value')
      const data = snapshot.val()

      if (!data) {
        return reply.status(404).send({ success: false, message: 'Room not found' })
      }

      return reply.send({ success: true, room: { id, ...data } })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error fetching room')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms — store_admin / collaborator / superuser can create rooms
  fastify.post('/api/rooms', authenticate, async (request, reply) => {
    try {
      const { name, storeId, storeName, auctionType } = request.body as {
        name: string
        storeId: string
        storeName?: string
        auctionType?: string
      }
      const uid = request.user?.uid

      if (!['store_admin', 'collaborator', 'superuser'].includes(request.user?.role || '')) {
        return reply.status(403).send({ success: false, message: 'Forbidden' })
      }

      const { randomBytes } = await import('crypto')
      const roomId = randomBytes(3).toString('hex').toUpperCase()
      const setupToken = randomBytes(24).toString('base64url')

      const roomData = {
        name: name.trim(),
        status: 'waiting',
        adminId: uid,
        adminName: storeName || 'Admin',
        launchDate: Date.now(),
        storeId,
        auctionType,
        setupToken,
      }

      await fastify.db.ref(`rooms/${roomId}/metadata`).set(roomData)

      return reply.send({
        success: true,
        room: { id: roomId, metadata: roomData },
        setupToken,
      })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error creating room')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // PUT /api/rooms/:id/status — room admin only
  fastify.put('/api/rooms/:id/status', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { status } = request.body as { status: string }

      await fastify.db.ref(`rooms/${id}/metadata/status`).set(status)
      return reply.send({ success: true, message: 'Status updated' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error updating room status')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // DELETE /api/rooms/:id — room admin only
  fastify.delete('/api/rooms/:id', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const roomRef = fastify.db.ref(`rooms/${id}`)
      const snap = await roomRef.once('value')
      const roomData = snap.val()

      if (!roomData) {
        return reply.status(404).send({ success: false, message: 'Room not found' })
      }

      if (roomData.metadata?.status === 'finished') {
        await roomRef.child('metadata/hiddenForStoreAdmin').set(true)
      } else {
        await roomRef.remove()
      }

      return reply.send({ success: true, message: 'Room deleted' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error deleting room')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/history/:historyId/delete — room admin only
  fastify.post('/api/rooms/:id/history/:historyId/delete', adminAuth, async (request, reply) => {
    try {
      const { id, historyId } = request.params as { id: string; historyId: string }
      await fastify.db.ref(`rooms/${id}/history/${historyId}`).remove()
      return reply.send({ success: true, message: 'History item removed' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error deleting history item')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // PUT /api/rooms/:id/history/:historyId/paid — room admin only
  fastify.put('/api/rooms/:id/history/:historyId/paid', adminAuth, async (request, reply) => {
    try {
      const { id, historyId } = request.params as { id: string; historyId: string }
      const { paid } = request.body as { paid: boolean }
      await fastify.db.ref(`rooms/${id}/history/${historyId}/paid`).set(paid)
      return reply.send({ success: true, message: 'Paid status updated' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error updating paid status')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/history/paid_batch — room admin only
  fastify.post('/api/rooms/:id/history/paid_batch', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { historyIds, paid } = request.body as { historyIds: string[]; paid: boolean }

      const updates: Record<string, any> = {}
      historyIds.forEach((historyId: string) => {
        updates[`rooms/${id}/history/${historyId}/paid`] = paid
      })

      await fastify.db.ref().update(updates)
      return reply.send({ success: true, message: 'Batch paid status updated' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error batch updating paid status')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/claim — any authenticated user (transaction prevents double claim)
  fastify.post('/api/rooms/:id/claim', authenticate, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const uid = request.user?.uid
      if (!uid) return reply.status(401).send({ success: false, message: 'Unauthorized' })

      const roomRef = fastify.db.ref(`rooms/${id}`)
      const activeProductRef = roomRef.child('active_product')

      const result = await activeProductRef.transaction((currentData) => {
        if (currentData === null) return currentData
        if (currentData.claimed_by) return undefined // Abort if already claimed
        currentData.claimed_by = uid
        return currentData
      })

      if (result.committed) {
        const userSnap = await fastify.db.ref(`users/${uid}`).once('value')
        const userData = userSnap.val() || {}

        await activeProductRef.update({
          winnerName: userData.displayName || 'Anonymous',
          winnerEmail: userData.email || '',
          winnerPhone: userData.phone || 'Not provided',
        })

        fastify.io.to(id).emit('roomUpdated')
        return reply.send({ success: true, message: 'Claim successful' })
      } else {
        return reply.status(400).send({ success: false, message: 'Too late or product unavailable' })
      }
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error processing claim')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/admin/active_product — room admin only
  fastify.post('/api/rooms/:id/admin/active_product', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { product } = request.body as { product?: any }

      const activeProductRef = fastify.db.ref(`rooms/${id}/active_product`)

      if (product) {
        await activeProductRef.set(product)
      } else {
        await activeProductRef.remove()
      }

      fastify.io.to(id).emit('roomUpdated')
      return reply.send({ success: true, message: 'Active product updated' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error updating active product')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/admin/finalize_bid — room admin only
  fastify.post('/api/rooms/:id/admin/finalize_bid', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const activeProductRef = fastify.db.ref(`rooms/${id}/active_product`)

      const snap = await activeProductRef.once('value')
      const ap = snap.val()

      if (!ap || !ap.highestBidderId) {
        return reply.status(400).send({ success: false, message: 'No valid highest bidder' })
      }

      await activeProductRef.update({
        claimed_by: ap.highestBidderId,
        winnerName: ap.highestBidderName || 'Highest Bidder',
      })

      fastify.io.to(id).emit('roomUpdated')
      return reply.send({ success: true, message: 'Bid finalized' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error finalizing bid')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/admin/push_product — room admin only
  fastify.post('/api/rooms/:id/admin/push_product', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { product } = request.body as { product: any }

      const roomRef = fastify.db.ref(`rooms/${id}`)
      const activeProductRef = roomRef.child('active_product')
      const historyRef = roomRef.child('history')
      const inventoryItemRef = roomRef.child(`inventory/${product.id}`)

      const snap = await activeProductRef.once('value')
      const currentActive = snap.val()

      if (currentActive && currentActive.claimed_by) {
        const finalPrice = currentActive.isBidding
          ? currentActive.currentBid || currentActive.price
          : currentActive.price
        await historyRef.push({ ...currentActive, price: finalPrice, archivedAt: Date.now() })
      }

      const newActivePayload: any = { ...product, claimed_by: null }

      if (product.isBidding) {
        newActivePayload.timerEndsAt = Date.now() + (product.biddingTimerSeconds || 15) * 1000
      }

      await activeProductRef.set(newActivePayload)
      await inventoryItemRef.remove()

      fastify.io.to(id).emit('roomUpdated')
      return reply.send({ success: true, message: 'Product pushed' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error pushing product')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/admin/delete_product — room admin only
  fastify.post('/api/rooms/:id/admin/delete_product', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { productId } = request.body as { productId: string }

      await fastify.db.ref(`rooms/${id}/inventory/${productId}`).remove()

      fastify.io.to(id).emit('roomUpdated')
      return reply.send({ success: true, message: 'Product deleted' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error deleting product')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/admin/add_product — room admin only
  fastify.post('/api/rooms/:id/admin/add_product', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { product } = request.body as { product: any }

      await fastify.db.ref(`rooms/${id}/inventory`).push(product)

      fastify.io.to(id).emit('roomUpdated')
      return reply.send({ success: true, message: 'Product added' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error adding product')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })

  // POST /api/rooms/:id/admin/end_auction — room admin only
  fastify.post('/api/rooms/:id/admin/end_auction', adminAuth, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

      const roomRef = fastify.db.ref(`rooms/${id}`)
      const snap = await roomRef.child('active_product').once('value')
      const currentActive = snap.val()

      if (currentActive && currentActive.claimed_by) {
        const finalPrice = currentActive.isBidding
          ? currentActive.currentBid || currentActive.price
          : currentActive.price
        await roomRef.child('history').push({ ...currentActive, price: finalPrice, archivedAt: Date.now() })
      }

      await roomRef.child('metadata/status').set('finished')
      await roomRef.child('active_product').remove()
      await roomRef.child('chat').remove()

      fastify.io.to(id).emit('roomUpdated')
      return reply.send({ success: true, message: 'Auction ended' })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error ending auction')
      return reply.status(500).send({ success: false, message: 'Internal server error' })
    }
  })
}

export default roomsRoutes

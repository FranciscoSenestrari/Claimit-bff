import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'

/**
 * Verifies that the authenticated user is the admin of the given room.
 * Superusers bypass this check.
 * Use as a preHandler on admin room endpoints.
 */
export async function requireRoomAdmin(
  this: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = request.user
  if (!user) {
    return reply.status(401).send({ success: false, message: 'Unauthorized' })
  }

  // Superusers can manage any room
  if (user.role === 'superuser') return

  const { id } = request.params as { id: string }
  const metaSnap = await this.db.ref(`rooms/${id}/metadata`).once('value')
  const meta = metaSnap.val()

  if (!meta) {
    return reply.status(404).send({ success: false, message: 'Room not found' })
  }

  // Must be the room's own store admin or a collaborator of the same store
  const userStoreId = user.storeId
  if (!userStoreId || meta.storeId !== userStoreId) {
    return reply.status(403).send({ success: false, message: 'Forbidden: not your room' })
  }
}

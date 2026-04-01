import { FastifyPluginAsync } from "fastify";

const superuserRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  // All superuser routes require authentication + superuser role
  const preHandler = [fastify.authenticate, fastify.requireSuperuser];

  // GET /api/superuser/stores
  fastify.get(
    "/api/superuser/stores",
    { preHandler },
    async (_request, reply) => {
      try {
        const storesRef = fastify.db.ref("stores");
        const snapshot = await storesRef.once("value");
        const storesData = snapshot.val() || {};
        return reply.send({ success: true, stores: storesData });
      } catch (error: any) {
        fastify.log.error("Error fetching stores for superuser");
        return reply
          .status(500)
          .send({
            success: false,
            message: "Failed to fetch stores",
            error: error.message,
          });
      }
    },
  );

  // POST /api/superuser/stores/:storeId/toggleStatus
  fastify.post(
    "/api/superuser/stores/:storeId/toggleStatus",
    { preHandler },
    async (request, reply) => {
      try {
        const { storeId } = request.params as { storeId: string };
        const { disabled } = request.body as { disabled: boolean };

        const storeRef = fastify.db.ref(`stores/${storeId}`);
        await storeRef.update({ disabled });

        return reply.send({
          success: true,
          message: `Store ${storeId} disabled status set to ${disabled}`,
        });
      } catch (error: any) {
        return reply
          .status(500)
          .send({
            success: false,
            message: "Error updating store status",
            error: error.message,
          });
      }
    },
  );
};

export default superuserRoutes;

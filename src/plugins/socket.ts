import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_key_change_in_production";

interface AuthenticatedSocket extends Socket {
  user?: {
    uid: string;
    role: string;
    storeId?: string | null;
  };
}

const socketPlugin: FastifyPluginAsync = async (fastify) => {
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: function (origin, callback) {
        if (
          !origin ||
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          callback(null, true);
        } else {
          callback(null, process.env.FRONTEND_URL || "http://localhost:3000");
        }
      },
      credentials: true,
    },
  });

  // Authentication Middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.cookie?.split("token=")[1]?.split(";")[0];

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.user = decoded;
      next();
    } catch (err) {
      fastify.log.error("Socket authentication error");
      next();
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    fastify.log.info(
      `Client connected: ${socket.id} (User: ${socket.user?.uid || "Guest"})`,
    );

    socket.on("joinRoom", async (roomId: string) => {
      socket.join(roomId);
      fastify.log.info(`Socket ${socket.id} joined room: ${roomId}`);

      if (socket.user) {
        io.to(roomId).emit("userJoined", {
          uid: socket.user.uid,
          socketId: socket.id,
        });
      }
    });

    socket.on("leaveRoom", (roomId: string) => {
      socket.leave(roomId);
      fastify.log.info(`Socket ${socket.id} left room: ${roomId}`);
      if (socket.user) {
        io.to(roomId).emit("userLeft", {
          uid: socket.user.uid,
          socketId: socket.id,
        });
      }
    });

    socket.on(
      "placeBid",
      async (data: {
        roomId: string;
        productId: string;
        bidAmount: number;
      }) => {
        if (!socket.user) {
          return socket.emit("error", {
            message: "Unauthorized. Must be logged in to bid.",
          });
        }

        const { roomId, productId, bidAmount } = data;
        const uid = socket.user.uid;

        try {
          const productRef = fastify.db.ref(
            `rooms/${roomId}/products/${productId}`,
          );
          const snap = await productRef.once("value");
          const productData = snap.val();

          if (!productData) {
            return socket.emit("error", { message: "Product not found." });
          }

          const currentHighest = productData.highestBid || 0;
          if (bidAmount <= currentHighest) {
            return socket.emit("error", {
              message: "Bid must be higher than current highest bid.",
            });
          }

          if (productData.highestBidder === uid) {
            return socket.emit("error", {
              message: "You are already the highest bidder.",
            });
          }

          await productRef.update({
            highestBid: bidAmount,
            highestBidder: uid,
            lastBidTime: Date.now(),
          });

          io.to(roomId).emit("newBid", {
            productId,
            bidAmount,
            highestBidder: uid,
            timestamp: Date.now(),
          });
        } catch (error) {
          fastify.log.error("Bid error");
          socket.emit("error", { message: "Failed to place bid." });
        }
      },
    );

    socket.on("sendMessage", async (data: { roomId: string; text: string }) => {
      if (!socket.user) {
        return socket.emit("error", { message: "Unauthorized." });
      }

      const { roomId, text } = data;
      const uid = socket.user.uid;

      if (!text || text.trim() === "") return;

      try {
        const userSnap = await fastify.db.ref(`users/${uid}`).once("value");
        const userData = userSnap.val();
        const displayName = userData?.displayName || "Anonymous";

        const messageData = {
          uid,
          displayName,
          text: text.trim(),
          timestamp: Date.now(),
          role: socket.user.role || "claimer",
        };

        const chatRef = fastify.db.ref(`rooms/${roomId}/chat`).push();
        await chatRef.set(messageData);

        io.to(roomId).emit("newMessage", {
          id: chatRef.key,
          ...messageData,
        });
      } catch (error) {
        fastify.log.error("Chat error");
        socket.emit("error", { message: "Failed to send message." });
      }
    });

    socket.on("disconnect", () => {
      fastify.log.info(`Client disconnected: ${socket.id}`);
    });
  });

  fastify.decorate("io", io);
};

export default fp(socketPlugin, { name: "socket", dependencies: ["firebase"] });

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

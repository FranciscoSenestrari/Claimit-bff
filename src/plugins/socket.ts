import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";

// JWT_SECRET is guaranteed to be set — plugins/auth.ts throws at startup if it's missing
const JWT_SECRET = process.env.JWT_SECRET as string;

const MAX_MESSAGE_LENGTH = 500; // Fix #9: prevent chat flood

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
        // Fix #10: only allow no-origin requests in non-production environments
        if (!origin && process.env.NODE_ENV !== "production") {
          callback(null, true);
          return;
        }
        if (
          origin &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          callback(null, true);
        } else if (origin && origin === process.env.FRONTEND_URL?.replace(/\/$/, '')) {
          callback(null, true);
        } else {
          // Fix #10: reject unknown origins in production
          callback(new Error("Not allowed by CORS"));
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
      // Allow guest connections (for viewing rooms without bidding)
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.user = decoded;
      next();
    } catch (err) {
      // Fix #7: reject connection with malformed/expired token instead of silently allowing guest
      fastify.log.warn({ socketId: socket.id }, "Socket rejected: invalid JWT");
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    fastify.log.info(
      `Client connected: ${socket.id} (User: ${socket.user?.uid || "Guest"})`,
    );

    socket.on("joinRoom", async (roomId: string) => {
      // Basic input validation
      if (typeof roomId !== "string" || roomId.length > 20) {
        return socket.emit("error", { message: "Invalid roomId." });
      }
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
      if (typeof roomId !== "string" || roomId.length > 20) return;
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

        // Fix #8: validate bid inputs
        if (typeof roomId !== "string" || roomId.length > 20) {
          return socket.emit("error", { message: "Invalid roomId." });
        }
        if (typeof productId !== "string" || productId.length > 50) {
          return socket.emit("error", { message: "Invalid productId." });
        }
        if (
          typeof bidAmount !== "number" ||
          !Number.isFinite(bidAmount) ||
          bidAmount <= 0 ||
          bidAmount > 1_000_000
        ) {
          return socket.emit("error", {
            message: "Bid amount must be a positive number up to 1,000,000.",
          });
        }

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
          fastify.log.error({ err: error }, "Bid error");
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

      // Fix #9: validate message length and roomId
      if (typeof roomId !== "string" || roomId.length > 20) {
        return socket.emit("error", { message: "Invalid roomId." });
      }
      if (!text || text.trim() === "" || text.length > MAX_MESSAGE_LENGTH) {
        return socket.emit("error", {
          message: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`,
        });
      }

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
        fastify.log.error({ err: error }, "Chat error");
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

import { join } from "node:path";
import AutoLoad, { AutoloadPluginOptions } from "@fastify/autoload";
import { FastifyPluginAsync, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import dotenv from "dotenv";

dotenv.config();

export interface AppOptions
  extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}

const options: AppOptions = {
  logger: true,
  bodyLimit: 52_428_800,
};

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts,
): Promise<void> => {
  // 1. CORRECCIÓN DE CORS: Asegúrate de que el fallback sea un string válido
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Permitir si no hay origen (como herramientas de test) o si es localhost
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      // En producción, usar la variable de entorno
      callback(null, process.env.FRONTEND_URL || "*");
    },
    credentials: true,
  });

  await fastify.register(cookie);

  // 2. REVISIÓN DE RUTAS: __dirname aquí es "src/"
  // Vercel compila los archivos, así que usamos join(__dirname, 'plugins')
  void fastify.register(AutoLoad, {
    dir: join(__dirname, "plugins"),
    options: opts,
  });

  void fastify.register(AutoLoad, {
    dir: join(__dirname, "routes"),
    options: opts,
  });
};

export default app;
export { app, options };

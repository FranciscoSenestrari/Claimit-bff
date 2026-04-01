// import { join } from "node:path";
// import AutoLoad, { AutoloadPluginOptions } from "@fastify/autoload";
// import { FastifyPluginAsync, FastifyServerOptions } from "fastify";
// import cors from "@fastify/cors";
// import cookie from "@fastify/cookie";
// import dotenv from "dotenv";

// dotenv.config();

// export interface AppOptions
//   extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}

// const options: AppOptions = {
//   logger: true,
//   bodyLimit: 52_428_800,
// };

// const app: FastifyPluginAsync<AppOptions> = async (
//   fastify,
//   opts,
// ): Promise<void> => {
//   // 1. CORRECCIÓN DE CORS: Asegúrate de que el fallback sea un string válido
//   await fastify.register(cors, {
//     origin: (origin, callback) => {
//       // Permitir si no hay origen (como herramientas de test) o si es localhost
//       if (
//         !origin ||
//         /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
//       ) {
//         callback(null, true);
//         return;
//       }
//       // En producción, usar la variable de entorno
//       callback(null, process.env.FRONTEND_URL || "*");
//     },
//     credentials: true,
//   });

//   await fastify.register(cookie);

//   // 2. REVISIÓN DE RUTAS: __dirname aquí es "src/"
//   // Vercel compila los archivos, así que usamos join(__dirname, 'plugins')
//   void fastify.register(AutoLoad, {
//     dir: join(__dirname, "plugins"),
//     options: opts,
//   });

//   void fastify.register(AutoLoad, {
//     dir: join(__dirname, "routes"),
//     options: opts,
//   });
// };

// export default app;
// export { app, options };
import { join } from "node:path";
import AutoLoad, { AutoloadPluginOptions } from "@fastify/autoload";
import { FastifyPluginAsync, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

export interface AppOptions
  extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}

// Opciones por defecto de la aplicación
const options: AppOptions = {
  logger: true,
  bodyLimit: 52_428_800, // 50 MB
};

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts,
): Promise<void> => {
  // Configuración de CORS
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Permitir localhost o si no hay origin (como Postman/Insomnia)
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }

      // En producción, comparar con la variable de entorno
      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl && origin === frontendUrl) {
        callback(null, true);
      } else {
        // Si no coincide, podrías devolver error o permitir (según tu necesidad)
        // Por ahora permitimos el FRONTEND_URL configurado
        callback(null, frontendUrl || "http://localhost:3000");
      }
    },
    credentials: true,
  });

  // Parser de Cookies
  await fastify.register(cookie);

  // Carga automática de Plugins (Carpeta src/plugins)
  void fastify.register(AutoLoad, {
    dir: join(__dirname, "plugins"),
    options: opts,
  });

  // Carga automática de Rutas (Carpeta src/routes)
  void fastify.register(AutoLoad, {
    dir: join(__dirname, "routes"),
    options: opts,
    routeParams: true,
  });
};

export default app;
export { app, options };

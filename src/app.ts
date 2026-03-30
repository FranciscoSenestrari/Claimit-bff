import { join } from 'node:path'
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload'
import { FastifyPluginAsync, FastifyServerOptions } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import dotenv from 'dotenv'

// Load environment variables before anything else
dotenv.config()

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}

// bodyLimit: 50 MB in bytes — passed via CLI or fastify() options in start script
const options: AppOptions = {
  logger: true,
  bodyLimit: 52_428_800,
}

const app: FastifyPluginAsync<AppOptions> = async (fastify, opts): Promise<void> => {
  // CORS: allow localhost and configured FRONTEND_URL in production
  await fastify.register(cors, {
    origin: function (origin, callback) {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true)
      } else {
        callback(null, process.env.FRONTEND_URL || 'http://localhost:3000')
      }
    },
    credentials: true,
  })

  // Cookie parser
  await fastify.register(cookie)

  // Load all plugins defined in plugins/
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts,
  })

  // Load all routes defined in routes/
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: opts,
  })
}

export default app
export { app, options }

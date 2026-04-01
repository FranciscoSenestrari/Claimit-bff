import Fastify from "fastify";
import appService from "../src/app"; // Ajusta la ruta a tu app.ts

const fastify = Fastify({
  logger: true,
});

export default async (req: any, res: any) => {
  // Registramos tu aplicación modular como un plugin
  await fastify.register(appService);

  await fastify.ready();
  fastify.server.emit("request", req, res);
};

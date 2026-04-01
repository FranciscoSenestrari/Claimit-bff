import Fastify from "fastify";
import appService from "../src/app"; // Asegúrate de que esta ruta sea correcta

const server = Fastify({
  logger: true,
});

// Registrar el plugin de tu app
server.register(appService);

export default async (req: any, res: any) => {
  await server.ready();
  server.server.emit("request", req, res);
};

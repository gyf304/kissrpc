import fastify from "fastify";
import * as z from "zod";

import { ToCaller, useContext, validateInput, zodValidator } from "@kissrpc/server";
import { register, FastifyContext } from "@kissrpc/server/jsonrpc";

export type Context = FastifyContext;

const serverRoot = useContext((ctx: Context) => ({
	hello: validateInput(
		async (name: string) => `Hello, ${name}, from ${ctx.req.ip}!`,
		zodValidator(z.string()),
	),
	echo: async <T>(x: T) => x,
}));

export type Interface = ToCaller<typeof serverRoot>;

const server = fastify({ logger: true });
register(server, serverRoot, "/api/v1/jsonrpc");
await server.listen({ port: 3000 });

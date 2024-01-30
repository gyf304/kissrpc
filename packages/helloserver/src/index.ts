import * as fastify from "fastify";
import * as kissrpc from "@kissrpc/server";

import { node as root } from "./root";

export interface Context {
	req: fastify.FastifyRequest;
	res: fastify.FastifyReply;
}

export type Root = typeof root;

const server = fastify.fastify({ logger: true });
server.post("/", async (req, res) => {
	const context: Context = { req, res };
	const body = kissrpc.isRPCRequest(req.body) ? req.body : null;
	if (body === null) {
		res.status(400);
		return { id: null, error: { code: -32600, message: "Invalid Request" } };
	}
	const result = await kissrpc.call(root, context, body);
	if (result.error !== undefined) {
		req.log.error(kissrpc.originalError(result.error));
	}
	res.status(kissrpc.httpStatusCode(result));
	res.send(result);
}).setErrorHandler((error, req, res) => {
	req.log.error(error);
	if (error.statusCode === 400) {
		res.status(400);
		res.send({ id: null, error: { code: -32700, message: error.message } });
	} else {
		res.status(500);
		res.send({ id: null, error: { code: -32603, message: "Internal error" } });
	}
});

const env: Record<string, string | undefined> = process.env;

await server.listen({ port: parseInt(env.PORT ?? "3000") });

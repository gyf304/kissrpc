import * as fastify from "fastify";
import express from "express";
import * as k from "@kissrpc/server";

import root from "./root";

/*
Context is a server-only construct that is used to track information
that is private to the server. This can be used to store information
such as the request and response objects, the user, etc.
*/
export type Context = k.FastifyContext | k.ExpressContext;

export type Interface = k.ToCaller<typeof root>;

const SERVER_TYPE = process.env.SERVER_TYPE || "fastify";
const PORT = parseInt(process.env.PORT || "3000", 10);

if (SERVER_TYPE === "fastify") {
	const server = fastify.fastify({ logger: true });
	k.registerJSONRPC(server, root, "/");
	await server.listen({ port: PORT });
} else if (SERVER_TYPE === "express") {
	const server = express();
	k.registerJSONRPC(server, root, "/");
	server.listen(PORT);
} else {
	throw new Error("Unknown server type");
}

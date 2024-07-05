import fastify from "fastify";
import express from "express";

import { ToInterface } from "@rpc0/server";
import { register, FastifyContext, ExpressContext, Options } from "@rpc0/server/jsonrpc";

import root from "./root";
import { RPCError } from "@rpc0/jsonrpc";

/*
Context is a server-only construct that is used to track information
that is private to the server. This can be used to store information
such as the request and response objects, the user, etc.
*/
export type Context = FastifyContext | ExpressContext;

export type Interface = ToInterface<typeof root>;

const SERVER_TYPE = process.env.SERVER_TYPE || "fastify";
const PORT = parseInt(process.env.PORT || "3000", 10);

/*
rpc0 has out-of-the-box support for serving JSON-RPC over both
Fastify and Express. This means that if you use either Fastify or
Express, you can seamlessly plug in rpc0.
*/

const options: Options = {
	// Specify an error handler to handle errors and optionally return
	// a JSONRPC error response
	errorHandler: (error) => {
		return new RPCError(
			-32000,
			error instanceof Error ? error.message : "Unknown error"
		);
	},
};

if (SERVER_TYPE === "fastify") {
	const server = fastify({ logger: true });
	register(server, root, "/api/v1/jsonrpc", options);
	await server.listen({ port: PORT });
} else if (SERVER_TYPE === "express") {
	const server = express();
	register(server, root, "/api/v1/jsonrpc", options);
	server.listen(PORT);
} else {
	throw new Error("Unknown server type");
}

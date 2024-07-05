import fastify from "fastify";
import express from "express";

import { ToInterface, Node } from "@rpc0/server";
import { register, FastifyContext, ExpressContext } from "@rpc0/server/jsonrpc";

import { JSONSerializable } from "@rpc0/jsonrpc";
import { Client } from "@rpc0/client";
import { FetchRequester } from "@rpc0/client/jsonrpc";

import type { Interface as FederatedInterface } from "@rpc0/helloserver";

export type Context = FastifyContext | ExpressContext;

export type Interface = ToInterface<typeof root, JSONSerializable>;

const SERVER_TYPE = process.env.SERVER_TYPE || "fastify";
const PORT = parseInt(process.env.PORT || "3001", 10);

/* rpc0 also has support for federation
First, create a client for the federation target
*/
const federated = new Client<FederatedInterface>(
	new FetchRequester("http://localhost:3000/api/v1/jsonrpc")
);

/* Then, use the federated client as a path in the server */
const root = {
	federated,
	echo: async <T extends JSONSerializable>(x: T) => x,
} satisfies Node<Context>;

if (SERVER_TYPE === "fastify") {
	const server = fastify({ logger: true });
	register(server, root, "/api/v1/jsonrpc");
	await server.listen({ port: PORT });
} else if (SERVER_TYPE === "express") {
	const server = express();
	register(server, root, "/api/v1/jsonrpc");
	server.listen(PORT);
} else {
	throw new Error("Unknown server type");
}

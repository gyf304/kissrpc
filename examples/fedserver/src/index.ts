import fastify from "fastify";
import express from "express";

import { ToCaller, Node } from "@kissrpc/server";
import { register, FastifyContext, ExpressContext, Options } from "@kissrpc/server/jsonrpc";

import { RPCError } from "@kissrpc/jsonrpc";
import { Client } from "@kissrpc/client";
import { FetchRequester } from "@kissrpc/client/jsonrpc";

import type { Interface as FederatedInterface } from "@kissrpc/helloserver";

export type Context = FastifyContext | ExpressContext;

export type Interface = ToCaller<typeof root>;

const SERVER_TYPE = process.env.SERVER_TYPE || "fastify";
const PORT = parseInt(process.env.PORT || "3001", 10);

/* KissRPC also has support for federation
First, create a client for the federation target
*/
const federatedClient = new Client<FederatedInterface>(
	new FetchRequester("http://localhost:3000/api/v1/jsonrpc")
);

/* Then, use the federated client as a path in the server */
const root = {
	federated: federatedClient,
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

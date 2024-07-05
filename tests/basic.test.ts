import { provideContext, ToInterface, useContext, validateParameters, zodValidator } from "@rpc0/server";
import { register, FastifyContext } from "@rpc0/server/jsonrpc";
import fastify from "fastify";
import { Client } from "@rpc0/client";
import { FetchRequester } from "@rpc0/client/jsonrpc";
import * as z from "zod";

import { describe, it, expect } from "bun:test";
import { JSONSerializable } from "@rpc0/jsonrpc";

describe("basic", () => {
	it("should work", async () => {
		type Context = FastifyContext;

		const serverRoot = useContext((ctx: Context) => ({
			hello: validateParameters(
				async (name: string) => `Hello, ${name}, from ${ctx.req.ip}!`,
				zodValidator(z.string()),
			),
			echo: async <T extends JSONSerializable>(x: T) => x,
		}));

		const server = fastify({ logger: false });
		register(server, serverRoot, "/api/v1/jsonrpc");
		server.listen();
		await server.ready();
		const port = server.server.address().port as number;

		type Interface = ToInterface<typeof serverRoot>;

		const rpc = new Client<Interface>(
			new FetchRequester(`http://localhost:${port}/api/v1/jsonrpc`)
		);

		expect(await rpc.hello("world")).toStartWith("Hello, world, from");
		expect(await rpc.echo(123)).toEqual(123);

		await server.close();
	});
});

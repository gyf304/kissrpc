# rpc0

A simple RPC library for TypeScript. Heavily inspired by
[trpc](https://trpc.io/), but with a focus on simplicity.

In particular, rpc0 does not differentiate mutations and queries, and
therefore allows for a simpler call syntax.

## Usage

See the [examples](./examples) directory for a more complete example, including using server-side context.

### Server
```typescript
import fastify from "fastify";
import * as z from "zod";

import type { JSONSerializable } from "@rpc0/jsonrpc";
import { ToInterface, useContext, validateParameters, zodValidator } from "@rpc0/server";
import { register, FastifyContext } from "@rpc0/server/jsonrpc";

export type Context = FastifyContext;

const serverRoot = useContext((ctx: Context) => ({
	hello: validateParameters(
		async (name: string) => `Hello, ${name}, from ${ctx.req.ip}!`,
		zodValidator(z.string()),
	),
	echo: async <T>(x: T) => x,
}));

// ToInterface converts the server type to a client type, which erases
// the context type
export type Interface = ToInterface<typeof serverRoot, JSONSerializable>;

const server = fastify({ logger: true });
register(server, serverRoot, "/api/v1/jsonrpc");
await server.listen({ port: 3000 });
```

### Client
```typescript
import { Client, FetchRequester } from "@rpc0/client/jsonrpc";
import type { Interface } from "../server";

const rpc = new Client<Interface>(
	new FetchRequester("http://localhost:3000/api/v1/jsonrpc")
);

// Using the client is as simple as calling an async function
console.log(await rpc.hello("world")); // Hello, world, from ...!
```

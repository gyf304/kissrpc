# kissrpc

A simple RPC library for TypeScript. Heavily inspired by
[trpc](https://trpc.io/), but with a focus on simplicity.

In particular, kissrpc does not differentiate mutations and queries, and
therefore allows for a simpler call syntax.

## Usage

See the [examples](./examples) directory for a more complete example, including using server-side context.

```typescript
// Server
import fastify from "fastify";
import * as k from "@kissrpc/server";

const root = {
	hello: async (name: string) => {
		return `Hello, ${name}!`;
	},
};
export type Interface = k.ToCaller<typeof root>;

const app = fastify();
k.registerJSONRPC(app, root, "/");
await app.listen({ port: 3000 });
```

```typescript
// Client
import { client, FetchTransport } from "@kissrpc/client";
import type { Interface } from "@kissrpc/helloserver";

const rpc = client<Interface>(new FetchTransport("http://localhost:3000"));

// Using the client is as simple as calling an async function
console.log(await rpc.hello("world")); // Hello, world!
```

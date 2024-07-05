import { Client } from "@rpc0/client";
import { FetchRequester } from "@rpc0/client/jsonrpc";
import type { Interface } from "@rpc0/fedserver";

const rpc = new Client<Interface>(
	new FetchRequester("http://localhost:3001/api/v1/jsonrpc")
);

console.log(await rpc.federated.hello("world"));
console.log(await rpc.federated.agent.hello("world"));
console.log(await rpc.federated.add(1, 2));
console.log(await rpc.echo({ hello: "world" }));

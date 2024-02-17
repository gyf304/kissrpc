import { Client, FetchTransport } from "@kissrpc/client/jsonrpc";
import type { Interface } from "@kissrpc/fedserver";

const rpc = new Client<Interface>(
	new FetchTransport("http://localhost:3001/api/v1/jsonrpc")
);

console.log(await rpc.federated.hello("world"));
console.log(await rpc.federated.agent.hello("world"));
console.log(await rpc.federated.add(1, 2));

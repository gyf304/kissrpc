import { client, fetchTransport } from "@kissrpc/client";
import type { Root } from "@kissrpc/helloserver";

const transport = fetchTransport("http://localhost:3000");
const rpc = client<Root>(transport);

console.log(await rpc.hello("world"));
console.log(await rpc.agent.hello("world"));

const agent = rpc.agent;
console.log(await agent.hello("world"));

import { Client } from "@kissrpc/client";
import { FetchRequester } from "@kissrpc/client/jsonrpc";
import type { Interface } from "@kissrpc/helloserver";

const rpc = new Client<Interface>(
	new FetchRequester("http://localhost:3000/api/v1/jsonrpc")
);

// Using the client is as simple as calling an async function

console.log(await rpc.hello("world"));        // Hello, world!
console.log(await rpc.agent.hello("world"));  // Hello, world! You are using ...
console.log(await rpc.add(1, 2));             // 3
console.log(await rpc.wait(1000));            // Waited for 1000ms
console.log(await rpc.echo("Hello, world!")); // Hello, world!

try {
	await rpc.error();
} catch (e) {
	if (e instanceof Error) {
		console.error(e.message); // This is a custom error
	}
}

// You can also assign a sub-path to a variable and use it as a client
const agent = rpc.agent;
// This is equivalent to rpc.agent.hello("world")
console.log(await agent.hello("world"));

// To allow request batching, call the functions before awaiting them
const promise1 = rpc.hello("world");
const promise2 = rpc.hello("world");

console.log(await promise1);
console.log(await promise2);

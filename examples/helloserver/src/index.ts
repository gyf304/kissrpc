import * as fastify from "fastify";
import * as k from "@kissrpc/server";

import { node as root } from "./root";

/*
Context is a server-only construct that is used to track information
that is private to the server. This can be used to store information
such as the request and response objects, the user, etc.
*/
export interface Context {
	req: fastify.FastifyRequest;
	res: fastify.FastifyReply;
}

export type Client = k.Client<typeof root>;

const server = fastify.fastify({ logger: true });

server.post("/", async (req, res) => {
	const context: Context = { req, res };

	// k.parseRequest will parse the JSON-RPC request and return it.
	// in the case of a parse error, it will return a JSON-RPC error response.
	// The request can also be a batch request, in which case it will return
	// an array of JSON-RPC responses and errors.
	const request = await k.parseRequest(req.body);

	// Use k.call to handle the request,
	// It takes in the root node, the context, and the JSON-RPC request
	// and returns the JSON-RPC response.
	// if a JSON-RPC error response is passed in, it will be returned as is.
	const result = await k.call(root, context, request);

	// We then send the response to the client
	res.status(k.httpStatusCode(result));
	res.send(result);

	// Here's an example of how to log the request and response.
	// We first normalize the request and response to arrays
	const requests = Array.isArray(request) ? request : [request];
	const results = Array.isArray(result) ? result : [result];

	// Then we iterate over the requests, and corresponding requests and log each one
	for (const [rpcReq, rpcRes] of requests.map((req, i) => [req, results[i]] as const)) {
		if (rpcRes.error) {
			req.log.error({
				req,
				res,
				rpc: {
					req: rpcReq,
					res: rpcRes
				},
				// k.originalError will return the original error that was thrown
				error: k.originalError(rpcRes.error),
			}, "RPC Error");
		} else {
			req.log.info({
				req,
				res,
				rpc: {
					req: rpcReq,
					res: rpcRes
				}
			}, "RPC OK");
		}
	}
}).setErrorHandler((error, req, res) => {
	req.log.error(error);

	// We will also need to handle unexpected errors in the JSON-RPC format
	if (error.statusCode === 400) {
		res.status(400);
		res.send({ id: null, error: { code: -32700, message: error.message } });
	} else {
		res.status(500);
		res.send({ id: null, error: { code: -32603, message: "Internal Error" } });
	}
});

await server.listen({ port: 3000 });

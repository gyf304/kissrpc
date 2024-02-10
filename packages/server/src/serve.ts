import type * as express from "express";
import type * as fastify from "fastify";
import type { Logger } from "ts-log";

import { contextedCall, NotFoundError, type Node } from "./rpc.js";
import type { RPCRequest, RPCResponse } from "@kissrpc/jsonrpc";
import { RPCError, httpStatusCode, originalError, checkRequest } from "@kissrpc/jsonrpc";

export interface FastifyContext {
	req: fastify.FastifyRequest;
	res: fastify.FastifyReply;
}

export interface ExpressContext {
	req: express.Request;
	res: express.Response;
}

export function registerJSONRPC<
	S extends fastify.FastifyInstance | express.Express,
	C extends (S extends fastify.FastifyInstance ? FastifyContext : ExpressContext),
>(
  server: S,
  root: Node<C>,
  path: string = "/",
) {
  if ("withTypeProvider" in server) {
	const fastifyServer = server as fastify.FastifyInstance;
	const fastifyRoot = root as Node<FastifyContext>;
	return registerFastify(fastifyServer, fastifyRoot, path);
  } else if ("defaultConfiguration" in server) {
	const expressServer = server as express.Express;
	const expressRoot = root as Node<ExpressContext>;
	return registerExpress(expressServer, expressRoot, path);
  } else {
	throw new Error("Unknown server type");
  }
}

async function callJSONRPC(
  root: any,
  context: unknown,
  request: RPCRequest,
): Promise<RPCResponse> {
	const path = request.method.split(".");
	const params = Array.isArray(request.params) ? request.params : [request.params];
	try {
		const response = await contextedCall(root, path, context, params);
		return {
			jsonrpc: "2.0",
			id: request.id,
			result: response,
		};
	} catch (e) {
		if (e instanceof NotFoundError) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: new RPCError(-32601, "Method not found").toJSON(),
			};
		} else if (e instanceof RPCError) {
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: e.toJSON(),
			};
		} else {
			const error = new RPCError(-32603, "Internal error", undefined, e);
			return {
				jsonrpc: "2.0",
				id: request.id,
				error: error.toJSON(),
			};
		}
	}
}

async function parseAndCallJSONRPC(
	root: any,
	ctx: unknown,
	req: unknown,
): Promise<RPCResponse> {
	try {
		checkRequest(req);
		return await callJSONRPC(root, ctx, req);
	} catch (e) {
		if (e instanceof RPCError) {
			return {
				jsonrpc: "2.0",
				id: null,
				error: e.toJSON(),
			};
		} else {
			// This should never happen
			throw e;
		}
	}
}

function registerFastify(
	server: fastify.FastifyInstance,
	root: Node<FastifyContext>,
	path: string,
) {
	server.post(path, async (req, res) => {
		const context: FastifyContext = { req, res };
		const body = req.body as unknown;

		if (Array.isArray(body)) {
			// Batch request
			if (body.length === 0) {
				res.status(400);
				res.send({ id: null, error: { code: -32600, message: "Invalid Request" } });
				return;
			}
			const results = await Promise.all(body.map((req) => parseAndCallJSONRPC(root, context, req)));
			const statusCodes = results.map(httpStatusCode);
			const status = statusCodes.some((code) => code !== statusCodes[0]) ? 207 : statusCodes[0];
			res.status(status);
			res.send(results);
		} else {
			// Single request
			const result = await parseAndCallJSONRPC(root, context, body);
			res.status(httpStatusCode(result));
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
}

function registerExpress(
	server: express.Express,
	root: Node<ExpressContext>,
	path: string,
) {
	server.use(function(req, res, next){
		let data: string[] = [];
		req.on("data", function(chunk){ data.push(chunk) })
		req.on("end", function(){
			req.body = data.join("");
			next();
		})
		res.contentType("application/json");
	}).post(path, async (req, res) => {
		const context: ExpressContext = { req, res };
		let body: unknown;
		try {
			body = JSON.parse(req.body);
		} catch (e) {
			res.status(400);
			res.send({ id: null, error: { code: -32700, message: "Parse error" } });
			return;
		}

		if (Array.isArray(body)) {
			// Batch request
			if (body.length === 0) {
				res.status(400);
				res.send({ id: null, error: { code: -32600, message: "Invalid Request" } });
				return;
			}
			const results = await Promise.all(body.map((req) => parseAndCallJSONRPC(root, context, req)));
			const statusCodes = results.map(httpStatusCode);
			const status = statusCodes.some((code) => code !== statusCodes[0]) ? 207 : statusCodes[0];
			res.status(status);
			res.send(results);
		} else {
			// Single request
			const result = await parseAndCallJSONRPC(root, context, body);
			res.status(httpStatusCode(result));
			res.send(result);
		}
	});
}

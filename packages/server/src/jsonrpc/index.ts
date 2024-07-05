import type * as express from "express";
import type * as fastify from "fastify";

import type { RPCRequest, RPCResponse } from "@rpc0/jsonrpc";
import { RPCError, httpStatusCode, checkRequest } from "@rpc0/jsonrpc";

import { contextedCall, NotFoundError, type Node } from "../rpc.js";

export interface FastifyContext {
	req: fastify.FastifyRequest;
	res: fastify.FastifyReply;
}

export interface ExpressContext {
	req: express.Request;
	res: express.Response;
}

export interface ErrorHandler {
	(error: unknown): RPCError | undefined;
}

export interface Options {
	errorHandler?: ErrorHandler;
}

export function register<
	S extends fastify.FastifyInstance | express.Express,
	C extends (S extends fastify.FastifyInstance ? FastifyContext : ExpressContext),
>(
	server: S,
	root: Node<C>,
	path: string = "/",
	options?: Options,
): void {
	if ("withTypeProvider" in server) {
		const fastifyServer = server as fastify.FastifyInstance;
		const fastifyRoot = root as Node<FastifyContext>;
		return registerFastify(fastifyServer, fastifyRoot, path, options) as any;
	} else if ("defaultConfiguration" in server) {
		const expressServer = server as express.Express;
		const expressRoot = root as Node<ExpressContext>;
		return registerExpress(expressServer, expressRoot, path, options) as any;
	} else {
		throw new Error("Unknown server type");
	}
}

async function callJSONRPC(
	root: any,
	context: unknown,
	request: RPCRequest,
	options?: Options,
): Promise<RPCResponse> {
	if (request.method === "rpc.server") {
		return {
			jsonrpc: "2.0",
			id: request.id,
			result: {
				name: "rpc0",
				supportedExtensions: []
			},
		};
	}
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
			const handledError = options?.errorHandler?.(e);
			if (handledError !== undefined) {
				return {
					jsonrpc: "2.0",
					id: request.id,
					error: handledError.toJSON(),
				};
			}
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
	options?: Options,
): Promise<RPCResponse> {
	try {
		checkRequest(req);
		return await callJSONRPC(root, ctx, req, options);
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

async function parseAndCallJSONRPCMaybeBatched(
	root: any,
	ctx: unknown,
	req: unknown,
	options?: Options,
): Promise<RPCResponse | RPCResponse[]> {
	if (Array.isArray(req)) {
		if (req.length === 0) {
			return {
				jsonrpc: "2.0",
				id: null,
				error: new RPCError(-32600, "Invalid Request").toJSON(),
			};
		}
		return await Promise.all(req.map((req) => parseAndCallJSONRPC(root, ctx, req, options)));
	} else {
		return await parseAndCallJSONRPC(root, ctx, req, options);
	}
}

function registerFastify(
	server: fastify.FastifyInstance,
	root: Node<FastifyContext>,
	path: string,
	options?: Options,
) {
	const mimeType = "application/json";
	server.post(path, async (req, res) => {
		const context: FastifyContext = { req, res };
		const body = req.body as unknown;

		const result = await parseAndCallJSONRPCMaybeBatched(root, context, body, options);
		const arr = Array.isArray(result) ? result : [result];
		const statuses = arr.map(httpStatusCode);
		const status = statuses.some((status) => status !== statuses[0]) ? 207 : statuses[0];

		res.header("Content-Type", mimeType);
		res.status(status);
		res.send(JSON.stringify(result));
	}).setErrorHandler((error, req, res) => {
		// We will also need to handle unexpected errors in the JSON-RPC format
		// This is mostly for the case where the request is not valid JSON
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
	options?: Options,
) {
	const mimeType = "application/json";
	server.use(function(req, res, next){
		let data: string[] = [];
		req.on("data", (chunk) => { data.push(chunk) })
		req.on("end", () => {
			req.body = data.join("");
			next();
		})
		res.contentType(mimeType);
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

		const result = await parseAndCallJSONRPCMaybeBatched(root, context, body, options);
		const arr = Array.isArray(result) ? result : [result];
		const statuses = arr.map(httpStatusCode);
		const status = statuses.some((status) => status !== statuses[0]) ? 207 : statuses[0];

		res.header("Content-Type", mimeType);
		res.status(status);
		res.send(JSON.stringify(result));
	});
}

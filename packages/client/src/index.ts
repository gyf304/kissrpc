import type { AnyNode, ContextTransformer, Endpoint, RPCRequest, RPCResponse } from "@kissrpc/server";
import { RPCError } from "@kissrpc/server";

export interface RPCTransport {
	(req: RPCRequest): Promise<RPCResponse>;
}

export type Client<T extends AnyNode> =
	T extends Endpoint<any, infer Input, infer Output> ? (...args: Input) => Promise<Output> :
	T extends ContextTransformer<any, any, infer Next> ? Client<Next> :
	T extends Record<string, AnyNode> ? { [K in keyof T]: Client<T[K]> } :
	never;

export class RPCTransportError extends Error {}

function checkRPCResponse(req: RPCRequest, res: unknown): res is RPCResponse {
	if (typeof res !== "object" || res === null) {
		throw new RPCTransportError("Invalid response");
	}
	const obj = res as Record<string, unknown>;
	if (obj.jsonrpc !== "2.0") {
		throw new RPCTransportError("Invalid JSON-RPC version");
	}
	if (obj.id !== req.id) {
		throw new RPCTransportError("Invalid response ID");
	}
	return true;
}

function makeRequester(transport: RPCTransport, path: string[]): (...args: any[]) => Promise<any> {
	return (...args: any[]) => {
		return transport({
			jsonrpc: "2.0",
			id: 1,
			method: path.join("."),
			params: args,
		}).then((res) => {
			if (res.error !== undefined) {
				throw new RPCError(res.error.code, res.error.message, res.error.data);
			}
			return res.result;
		});
	};
}

function makeClient(transport: RPCTransport, path: string[]): any {
	return new Proxy(makeRequester(transport, path), {
		get(_, key: string) {
			return makeClient(transport, [...path, key]);
		},
	});
}

export function client<T extends AnyNode>(transport: RPCTransport): Client<T> {
	return makeClient(transport, []) as Client<T>;
}

export function fetchTransport(url: string, fetchImpl?: typeof globalThis.fetch): RPCTransport {
	const fetch = fetchImpl ?? globalThis.fetch;
	return (req) => {
		return fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(req),
		}).then(async (res) => {
			if (!res.ok) {
				throw new Error(`HTTP error ${res.status}`);
			}
			const result = await res.json();
			if (!checkRPCResponse(req, result)) {
				throw new Error("should not happen");
			}
			return result;
		});
	};
}

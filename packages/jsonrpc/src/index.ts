const OriginalErrorSymbol = Symbol("OriginalError");

interface JSONObject {
	[key: string]: JSONSerializable;
}
type JSONArray = JSONSerializable[];
export type JSONSerializable = string | number | boolean | null | JSONObject | JSONArray;

export interface RPCRequest {
	jsonrpc: "2.0";
	id: number | string | null;
	method: string;
	params: unknown;
}

export interface RPCDataResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	method?: undefined;
	result: unknown;
	error?: undefined;
}

export interface RPCErrorResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	method?: undefined;
	result?: undefined;
	error: {
		code: number;
		message: string;
		data?: unknown;
		[OriginalErrorSymbol]?: unknown;
	};
}

export type RPCResponse = RPCDataResponse | RPCErrorResponse;

// ServerInfo extension
export interface ServerInfo {
	name: string;
	supportedExtensions: string[];
}

export interface ServerInfoRPCRequest extends RPCRequest {
	method: "rpc.server";
	params: any;
}

export interface ServerInfoRPCResponse extends RPCDataResponse {
	result: ServerInfo;
}

// rpc.pipelined extension
interface RPCRequestWithID extends RPCRequest {
	id: number | string;
}

export interface PipelinedRPCRequest extends RPCRequest {
	jsonrpc: "2.0";
	id: number | string | null;
	method: "rpc.pipelined";
	params: {
		// specify requests to be pipelined, note that the requests may not
		// be executed in the order they are specified, but depending on the
		// mapping dependencies, and the server's implementation.
		requests: RPCRequestWithID[];
		// specify mappings. the results of the requests, specified by the from
		// property, will be mapped to requests specified by the to property. those
		// paths are specified as arrays of strings or numbers, where strings are
		// object keys and numbers are array indices.
		// the target field is expected to placeholded by null.
		mapping: {
			from: number | string;
			to: {
				id: number | string;
				path: (string | number)[];
			}
		}[];
		// specify which requests to return, specified by IDs
		returns: (string | number)[];
	};
}

export interface PipelinedRPCResponse extends RPCDataResponse {
	result: RPCRequestWithID[];
}

export class RPCError extends Error {
	constructor(public readonly code: number, message: string, public readonly data?: unknown, public readonly originalError?: unknown) {
		super(message);
		this.name = "RPCError";
	}

	toJSON(): RPCErrorResponse["error"] {
		return {
			code: this.code,
			message: this.message,
			data: this.data,
			[OriginalErrorSymbol]: this.originalError,
		};
	}
}

export class InvalidParamsRPCError extends RPCError {
	constructor(message: string, data?: unknown, originalError?: unknown) {
		super(-32602, message, data, originalError);
		this.name = "InvalidParamsRPCError";
	}
}

export class InvalidRequestRPCError extends RPCError {
	constructor(message: string, data?: unknown, originalError?: unknown) {
		super(-32600, message, data, originalError);
		this.name = "InvalidRequestRPCError";
	}
}

export function checkRequest(req: unknown): asserts req is RPCRequest {
	if (typeof req !== "object" || req === null) {
		throw new InvalidRequestRPCError("Invalid Request");
	}
	const obj = req as Record<string, unknown>;
	if (obj.jsonrpc !== "2.0") {
		throw new InvalidRequestRPCError("Invalid JSON-RPC version");
	}
	if (!obj.hasOwnProperty("id")) {
		throw new InvalidRequestRPCError("Missing ID");
	}
	if (!["string", "number", "null"].includes(typeof obj.id)) {
		throw new InvalidRequestRPCError("Invalid ID");
	}
	if (typeof obj.method !== "string") {
		throw new InvalidRequestRPCError("Invalid method");
	}
}

function jsonRPCCodeToHTTPStatus(code: number): number {
	switch (code) {
		case -32700: return 400;
		case -32600: return 400;
		case -32601: return 404;
		case -32602: return 400;
		case -32603: return 500;
	}
	return 500;
}

export function httpStatusCode(response: RPCResponse): number {
	return response.error === undefined ? 200 : jsonRPCCodeToHTTPStatus(response.error.code);
}

export function originalError(error: RPCErrorResponse["error"]): unknown {
	return error[OriginalErrorSymbol];
}

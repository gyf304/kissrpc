const OriginalErrorSymbol = Symbol("OriginalError");

export interface RPCRequest {
	jsonrpc: "2.0";
	id: number | string | null;
	method: string;
	params: unknown;
}

export interface RPCDataResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result: unknown;
	error?: undefined;
}

export interface RPCErrorResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: undefined;
	error: {
		code: number;
		message: string;
		data?: unknown;
		[OriginalErrorSymbol]?: unknown;
	};
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

export type RPCResponse = RPCDataResponse | RPCErrorResponse;

export function isRPCRequest(value: unknown): value is RPCRequest {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return (
		obj.jsonrpc === "2.0" &&
		obj.hasOwnProperty("id") && 
		["string", "number", "null"].includes(typeof obj.id) &&
		typeof obj.method === "string" &&
		obj.hasOwnProperty("params")
	);
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

export function wrapError(error: unknown): RPCErrorResponse["error"] {
	if (error instanceof RPCError) {
		return error.toJSON();
	}
	return {
		code: -32000,
		message: "Internal Server Error",
		data: error,
		[OriginalErrorSymbol]: error,
	};
}

export function httpStatusCode(response: RPCResponse): number {
	return "result" in response ? 200 : jsonRPCCodeToHTTPStatus(response.error.code);
}

export function originalError(error: RPCErrorResponse["error"]): unknown {
	return error[OriginalErrorSymbol];
}

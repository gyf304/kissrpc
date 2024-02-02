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

export type RPCResponse = RPCDataResponse | RPCErrorResponse;

export function parseOneRPCRequest(req: unknown): (RPCRequest | RPCErrorResponse) {
	const err = (message: string) => ({
		jsonrpc: "2.0",
		id: null,
		error: {
			code: -32600,
			message,
		},
	} as RPCErrorResponse);
	if (typeof req !== "object" || req === null) {
		return err("Invalid Request");
	}
	const obj = req as Record<string, unknown>;
	if (obj.jsonrpc !== "2.0") {
		return err("Invalid JSON-RPC Version");
	}
	if (!obj.hasOwnProperty("id")) {
		return err("Missing ID");
	}
	if (!["string", "number", "null"].includes(typeof obj.id)) {
		return err("Invalid ID");
	}
	if (typeof obj.method !== "string") {
		return err("Invalid Method");
	}
	return {
		jsonrpc: "2.0",
		id: obj.id,
		method: obj.method,
		params: obj.params,
	} as RPCRequest;
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

export function httpStatusCode(response: RPCResponse | RPCResponse[]): number {
	if (Array.isArray(response)) {
		if (response.length === 0) {
			return 204;
		}
		const allCodes = response.map(httpStatusCode);
		const uniqueCodes = new Set(allCodes);
		if (uniqueCodes.size === 1) {
			return allCodes[0];
		} else {
			return 207; // Multi-Status
		}
	}
	return "result" in response ? 200 : jsonRPCCodeToHTTPStatus(response.error.code);
}

export function originalError(error: RPCErrorResponse["error"]): unknown {
	return error[OriginalErrorSymbol];
}

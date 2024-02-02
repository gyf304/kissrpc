import type * as z from "zod";
import { InvalidParamsRPCError, RPCErrorResponse, RPCRequest, RPCResponse, parseOneRPCRequest, wrapError } from "./jsonrpc.js";
export type { RPCRequest, RPCResponse };
export { RPCError, httpStatusCode, originalError } from "./jsonrpc.js";

type Awaitable<T> = T | Readonly<T> | Promise<T>;

const ValidationSymbol = Symbol("Validation");
export type ValidationResult<T> = void & { [ValidationSymbol]: T };

const FunctionTypeSymbol = Symbol("FunctionType");

interface JSONObject {
	[key: string]: JSONSerializable;
}
type JSONArray = JSONSerializable[];
export type JSONSerializable = string | number | boolean | null | JSONObject | JSONArray;

export function zod<T extends [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]>(...types: T)
	: (...input: unknown[]) => ValidationResult<T extends [] ? [] : { [K in keyof T]: z.input<T[K]> }>
{
	return (ctx: unknown, ...input: unknown[]) => {
		if (types.length !== input.length) {
			throw new InvalidParamsRPCError("Invalid number of arguments");
		}
		for (let i = 0; i < types.length; i++) {
			try {
				types[i].parse(input[i]);
			} catch (e) {
				const err = e as z.ZodError;
				throw new InvalidParamsRPCError(`Type error at argument ${i}: ${err.errors[0].message}`, {
					errors: err.errors,
				}, err);
			}
		}
		return undefined as ValidationResult<T extends [] ? [] : { [K in keyof T]: z.input<T[K]> }>;
	};
}

export interface Validator<Context, Input extends JSONSerializable[]> {
	(context: Context, ...input: unknown[]): Awaitable<ValidationResult<Input>>;
}

export interface Endpoint<Context, Input extends JSONSerializable[], Output extends JSONSerializable> {
	[FunctionTypeSymbol]?: "Endpoint";
	(context: Context, ...input: Input): Awaitable<Output>;
	validate?: Validator<Context, Input>
}
export type AnyEndpoint = Endpoint<any, any, any>;

export interface ContextTransformer<Context, OutputContext, Next extends Node<OutputContext>> {
	[FunctionTypeSymbol]: "ContextTransformer";
	(context: Context): Awaitable<OutputContext>;
	next: Next;
}
export type AnyContextTransformer = ContextTransformer<any, any, any>;

export interface Router<Context>  {
	[endpoint: string]: Node<Context>;
}
export type AnyRouter = Router<any>;
export type Node<Context> = Endpoint<Context, any[], any> | Router<Context> | ContextTransformer<Context, any, any>;
export type AnyNode = Node<any>;

interface Helper<Context> {
	transform: <NewContext>(transformer: (context: Context) => Awaitable<NewContext>) => {
		next: <Next extends Node<NewContext>>(next: Next) => ContextTransformer<Context, NewContext, Next>;
	};
	endpoint: {
		validator: <Input extends JSONSerializable[]>(v: Validator<Context, Input>) => {
			handler: <Output extends JSONSerializable, E extends Endpoint<Context, Input, Output>>(h: E) => E;
		};
		zod: <Input extends [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]>(...types: Input) => {
			handler: <
				Output extends JSONSerializable,
				E extends Endpoint<Context, Input extends [] ? [] : { [K in keyof Input]: z.input<Input[K]> }, Output>
			>(h: E) => E;
		};
		handler: <Input extends any[], Output extends JSONSerializable>(h: Endpoint<Context, Input, Output>) => Endpoint<Context, Input, Output>;
	};
	router: <R extends Router<Context>>(routes: R) => R;
}

export function rpc<Context>(): Helper<Context> {
	return {
		transform(transformer) {
			return {
				next(next) {
					return Object.assign(function(this: any, context: Context) {
						return transformer.call(this, context);
					}, {
						[FunctionTypeSymbol]: "ContextTransformer",
						next,
					} as const);
				}
			}
		},
		endpoint: {
			validator(validate) {
				return {
					handler(handler) {
						return Object.assign(function(context: any, ...input: any[]) {
							return handler(context, ...input as any);
						}, {
							[FunctionTypeSymbol]: "Endpoint",
							validate,
						} as const) as unknown as typeof handler;
					}
				};
			},
			zod(...types) {
				return {
					handler(handler) {
						return Object.assign(function(context: any, ...input: any[]) {
							return handler(context, ...input as any);
						}, {
							[FunctionTypeSymbol]: "Endpoint",
							validate: zod(...types),
						} as const) as unknown as typeof handler;
					}
				};
			},
			handler(handler) {
				return handler;
			}
		},
		router(routes) {
			return routes;
		},
	};
}

export function withContext<Context, T extends AnyEndpoint | AnyRouter>(
	contextFn: (context: Context) => Awaitable<T>,
): (context: Context) => Awaitable<T> {
	return contextFn;
}

type ParsedSingleRequest = RPCRequest | RPCErrorResponse;
type ParsedBatchRequest = ParsedSingleRequest[];
type ParsedRequest = ParsedSingleRequest | ParsedBatchRequest;

export async function parseRequest(req: unknown): Promise<ParsedRequest> {
	if (typeof req === "string") {
		try {
			req = JSON.parse(req);
		} catch (e) {
			return {
				jsonrpc: "2.0",
				id: null,
				error: {
					code: -32700,
					message: "JSON Parse Error",
				},
			};
		}
	}
	if (Array.isArray(req)) {
		if (req.length === 0) {
			return {
				jsonrpc: "2.0",
				id: null,
				error: {
					code: -32600,
					message: "Invalid Request",
				},
			};
		}
		const results: (RPCRequest | RPCErrorResponse)[] = [];
		for (const r of req) {
			results.push(parseOneRPCRequest(r));
		}
		return results;
	} else {
		return parseOneRPCRequest(req);
	}
}

async function callOne<Context>(node: Node<Context>, context: Context, req: RPCRequest): Promise<RPCResponse> {
	const path = req.method.split(".");
	const params = req.params === undefined ? [] :
		Array.isArray(req.params) ? req.params : [req.params];

	let current = node as Node<any>;
	let transformedContext: any = context;
	let rest = path.slice();

	const methodNotFound: RPCResponse = {
		jsonrpc: "2.0",
		id: req.id,
		error: {
			code: -32601,
			message: "Not Found",
		},
	};

	while (rest.length > 0) {
		switch (typeof current) {
			case "function":
				switch (current[FunctionTypeSymbol]) {
					case "ContextTransformer":
						try {
							transformedContext = await current(transformedContext);
							current = current.next;
						} catch (e) {
							return {
								jsonrpc: "2.0",
								id: req.id,
								error: wrapError(e),
							};
						}
						break;
					default:
						return methodNotFound;
				}
				break;
			case "object":
				let key = rest.shift()!;
				if (!Object.hasOwn(current, key)) {
					return methodNotFound;
				}
				current = current[key];
				break;
			default:
				return methodNotFound;
		}
	}
	if (typeof current !== "function") {
		return methodNotFound;
	}
	if (current[FunctionTypeSymbol] !== "Endpoint" && current[FunctionTypeSymbol] !== undefined) {
		return methodNotFound;
	}
	if (current.validate) {
		try {
			await current.validate(transformedContext, ...params);
		} catch (e) {
			return {
				jsonrpc: "2.0",
				id: req.id,
				error: wrapError(e),
			};
		}
	}

	try {
		const result = await current(transformedContext, ...params);
		return {
			jsonrpc: "2.0",
			id: req.id,
			result,
		};
	} catch (e) {
		return {
			jsonrpc: "2.0",
			id: req.id,
			error: wrapError(e),
		};
	}
}

export async function call<Context>(node: Node<Context>, context: Context, req: ParsedBatchRequest): Promise<RPCResponse[]>;
export async function call<Context>(node: Node<Context>, context: Context, req: ParsedSingleRequest): Promise<RPCResponse>;
export async function call<Context>(node: Node<Context>, context: Context, req: ParsedRequest): Promise<RPCResponse | RPCResponse[]>;
export async function call<Context>(node: Node<Context>, context: Context, req: ParsedRequest): Promise<RPCResponse | RPCResponse[]> {
	if (Array.isArray(req)) {
		const results: RPCResponse[] = [];
		for (const r of req) {
			if (r.method === undefined) {
				results.push(r);
			} else {
				results.push(await callOne(node, context, r));
			}
		}
		return results;
	} else {
		if (req.method === undefined) {
			return req;
		} else {
			return callOne(node, context, req);
		}
	}
}

export type Client<T extends AnyNode> =
	T extends Endpoint<any, infer Input, infer Output> ? (...args: Input) => Promise<Output> :
	T extends ContextTransformer<any, any, infer Next> ? Client<Next> :
	T extends Record<string, AnyNode> ? { [K in keyof T]: Client<T[K]> } :
	never;

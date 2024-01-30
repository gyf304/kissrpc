import type * as z from "zod";
import { InvalidParamsRPCError, RPCRequest, RPCResponse, wrapError } from "./jsonrpc";
export type { RPCRequest, RPCResponse };
export { RPCError, isRPCRequest, httpStatusCode, originalError } from "./jsonrpc";

type Awaitable<T> = T | Readonly<T> | Promise<T>;

const ValidationSymbol = Symbol("Validation");
type ValidationResult<T> = void & { [ValidationSymbol]: T };

const FunctionTypeSymbol = Symbol("FunctionType");

export function zod<S extends z.AnyZodTuple>(schema: S): (...input: unknown[]) => ValidationResult<z.input<S>> {
	return (ctx: unknown, ...input: unknown[]) => {
		try {
			schema.parse(input);
		} catch (e) {
			const err = e as z.ZodError;
			throw new InvalidParamsRPCError(err.errors[0].message, {
				errors: err.errors,
			}, err);
		}
		return undefined as ValidationResult<z.input<S>>;
	};
}

export interface Validator<Context, Input extends any[]> {
	(context: Context, ...input: unknown[]): Awaitable<ValidationResult<Input>>;
}

interface AnyFunction {
	(...args: any[]): any;
}

export interface Endpoint<Context, Input extends any[], Output> {
	[FunctionTypeSymbol]?: "Endpoint";
	(context: Context, ...input: Input): Awaitable<Output>;
	validate?: Validator<Context, Input>
}
export type AnyEndpoint = Endpoint<any[], any, any>;

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
		validator: <Input extends any[]>(v: Validator<Context, Input>) => {
			handler: <Output, E extends Endpoint<Context, Input, Output>>(h: E) => E;
		};
		handler: <Input extends any[], Output>(h: Endpoint<Context, Input, Output>) => Endpoint<Context, Input, Output>;
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

export async function call<Context>(node: Node<Context>, context: Context, req: RPCRequest): Promise<RPCResponse> {
	const path = req.method.split(".");
	const params = Array.isArray(req.params) ? req.params : [req.params];

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
						transformedContext = await current(transformedContext);
						current = current.next;
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
				throw new Error("Invalid node");
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

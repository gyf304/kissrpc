import type * as z from "zod";

const FunctionTypeSymbol = Symbol("FunctionType");

// TypeSymbol is used to mark the type of a function,
// as typescript is a duck-typed language.
const TypeSymbol = Symbol("Type");

type Awaitable<T> = T | Promise<T>;

export interface Endpoint<T = any> {
	[FunctionTypeSymbol]?: undefined;
	// ideally, we would want to specify that an endpoint function
	// must be using arguments that are subtypes of T, but I don't think
	// that's possible in typescript.
	(...input: any[]): Promise<T>;
}

export interface Validator<Input> {
	[TypeSymbol]: Input;
	(input: unknown): asserts input is Input;
}

export interface EndpointValidator<E extends Endpoint<T>, T = any> {
	[FunctionTypeSymbol]: "EndpointValidator";
	(...input: unknown[]): Promise<E>;
}

export interface ContextUser<Context, N extends Node<Context, T>, T = any> {
	[FunctionTypeSymbol]: "ContextUser";
	(ctx: Context): Promise<N>;
}

export interface ContextProvider<Context, N extends Node<Context, T>, T = any> {
	[FunctionTypeSymbol]: "ContextProvider";
	(): Promise<Context>;
	next: N;
}

export interface Router<Context, T = any> {
	[path: string]: Node<Context, T>;
}

export type Node<Context, T = any> =
	Router<Context, T> |
	EndpointValidator<Endpoint<T>, T> |
	Endpoint<T> |
	ContextUser<Context, Node<any, T>, T> |
	ContextProvider<any, Node<any, T>, T>;

export function useContext<Context, N extends Node<Context>>(f: (ctx: Context) => Awaitable<N>): ContextUser<Context, N> {
	const fCopy = async (ctx: Context) => {
		return await f(ctx);
	};
	return Object.assign(fCopy, { [FunctionTypeSymbol]: "ContextUser" }) as any;
}

export function provideContext<Context, N extends Node<Context>>(next: N, f: () => Awaitable<Context>): ContextProvider<Context, N> {
	const fCopy = async () => {
		return await f();
	}
	return Object.assign(fCopy, { [FunctionTypeSymbol]: "ContextProvider", next }) as any;
}

export function validateInput<E extends Endpoint, Input extends Parameters<E>>(e: E, v: Validator<Input>) {
	const endpointValidator = async (...input: unknown[]) => {
		v(input);
		return e;
	};
	return Object.assign(endpointValidator, { [FunctionTypeSymbol]: "EndpointValidator" }) as EndpointValidator<E>;
}

export function zodValidator<T extends [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]>(...types: T): Validator<T extends [] ? [] : { [K in keyof T]: z.input<T[K]> }> {
	const validator = ((input: unknown) => {
		if (!Array.isArray(input)) {
			// TODO: throw a better error
			throw new Error("Invalid input");
		}
		if (types.length !== input.length) {
			// TODO: throw a better error
			throw new Error("Invalid number of arguments");
		}
		for (let i = 0; i < types.length; i++) {
			try {
				types[i].parse(input[i]);
			} catch (e) {
				const err = e as z.ZodError;
				// TODO: throw a better error
				throw new Error(`Type error at argument ${i}: ${err.errors[0].message}`);
			}
		}
	});
	return validator as unknown as any;
}

export type ToCaller<N extends Node<any>> =
	N extends Endpoint ? N :
	N extends EndpointValidator<infer E> ? E :
	N extends ContextUser<any, infer N2> ? ToCaller<N2>:
	N extends ContextProvider<any, infer N2> ? ToCaller<N2> :
	N extends Router<any> ? { [K in keyof N]: ToCaller<N[K]> } :
	never;

export type ToIOTypes<N extends Node<any>> =
	N extends Endpoint ?
		(unknown extends Parameters<N>[number] ? never : Parameters<N>[number]) |
		(unknown extends Awaited<ReturnType<N>> ? never : Awaited<ReturnType<N>>) :
	N extends EndpointValidator<infer E> ? ToIOTypes<E> :
	N extends ContextUser<any, infer N2> ? ToIOTypes<N2> :
	N extends ContextProvider<any, infer N2> ? ToIOTypes<N2> :
	N extends Router<any> ? ToIOTypes<N[keyof N]> :
	never;

export class NotFoundError extends Error {
	constructor() {
		super("Endpoint not found");
	}
}

export async function contextedCall<Context, N extends Node<Context>>(node: N, path: string[], ctx: Context, args: unknown[]) {
	if (typeof node === "function") {
		const functionType = node[FunctionTypeSymbol];
		if (functionType === "ContextProvider") {
			const next = node.next as Node<Context>;
			const newContext = await node();
			return await contextedCall(next, path, newContext, args);
		} else if (functionType === "ContextUser") {
			const next = await node(ctx);
			return await contextedCall(next, path, ctx, args);
		}
	}

	if (path.length === 0) {
		if (typeof node !== "function") {
			throw new NotFoundError();
		}
		const functionType = node[FunctionTypeSymbol];
		if (functionType === "EndpointValidator") {
			const fn = await node(...args);
			return await fn(...args);
		} else if (functionType === undefined) {
			return await node(...args);
		} else {
			throw new NotFoundError();
		}
	}

	const next = (node as Router<any>)[path[0]];
	if (next === undefined) {
		throw new NotFoundError();
	}

	const rest = path.slice(1);
	return await contextedCall(next, rest, ctx, args);
}

function createCallerImpl(root: Node<any>, ctx: any, path: string[]): any {
	return new Proxy((...args: any[]) => contextedCall(root, path, ctx, args), {
		get(_, key: string) {
			return createCallerImpl(ctx, root, [...path, key]);
		},
	});
}

export function createCaller<Context, N extends Node<Context>>(node: N, ctx: Context): ToCaller<N> {
	return createCallerImpl(node, ctx, []);
}

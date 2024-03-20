import type * as z from "zod";

const FunctionTypeSymbol = Symbol("FunctionType");

// TypeSymbol is used to mark the type of a function,
// as typescript is a duck-typed language.
const TypeSymbol = Symbol("Type");

type Awaitable<T> = T | Promise<T>;

export interface Procedure {
	[FunctionTypeSymbol]?: undefined;
	(...input: any[]): Promise<any>;
}

export interface Validator<Input> {
	[TypeSymbol]: Input;
	(...input: unknown[]): Promise<void>;
}

export interface ParametersValidator<E extends Procedure> {
	[FunctionTypeSymbol]: "ParametersValidator";
	(...input: unknown[]): Promise<void>;
	next: E;
}

export interface ContextUser<Context, N extends Node<Context>> {
	[FunctionTypeSymbol]: "ContextUser";
	(ctx: Context): Promise<N>;
}

export interface ContextProvider<Context, N extends Node<Context>> {
	[FunctionTypeSymbol]: "ContextProvider";
	(): Promise<Context>;
	next: N;
}

export interface Router<Context> {
	[path: string]: Node<Context>;
}

export type Node<Context> =
	Router<Context> |
	ParametersValidator<Procedure> |
	Procedure |
	ContextUser<Context, Node<any>> |
	ContextProvider<any, Node<any>>;

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

export function validateParameters<E extends Procedure, Input extends Parameters<E>>(e: E, v: Validator<Input>) {
	const parametersValidator = async (...input: unknown[]) => {
		await v(input);
	};
	return Object.assign(parametersValidator, {
		[FunctionTypeSymbol]: "ParametersValidator",
		next: e,
	}) as ParametersValidator<E>;
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

type ParametersSerializable<E extends Procedure, T> =
	Parameters<E> extends [] ? true :
	Parameters<E>[number] extends T ? true : false;

type ReturnTypeSerializable<E extends Procedure, T> =
	Awaited<ReturnType<E>> extends T ? true : false;

export type ToInterface<N extends Node<any>, T> =
	N extends Procedure ? (
		ParametersSerializable<N, T> extends true ? (
			ReturnTypeSerializable<N, T> extends true ? N : "Output not serializable"
		) : "Input not serializable"
	) :
	N extends ParametersValidator<infer E> ? E :
	N extends ContextUser<any, infer N2> ? ToInterface<N2, T>:
	N extends ContextProvider<any, infer N2> ? ToInterface<N2, T> :
	N extends Router<any> ? { [K in keyof N]: ToInterface<N[K], T> } :
	never;

export class NotFoundError extends Error {
	constructor() {
		super("Procedure not found");
	}
}

async function contextedCallImpl<Context, N extends Node<Context>>(
	node: N, path: string[], ctx: Context, args: unknown[], noValidate: boolean
) {
	if (typeof node === "function") {
		const functionType = node[FunctionTypeSymbol];
		if (functionType === "ContextProvider") {
			const next = node.next as Node<Context>;
			const newContext = await node();
			return await contextedCallImpl(next, path, newContext, args, noValidate);
		} else if (functionType === "ContextUser") {
			const next = await node(ctx);
			return await contextedCallImpl(next, path, ctx, args, noValidate);
		}
	}

	if (path.length === 0) {
		if (typeof node !== "function") {
			throw new NotFoundError();
		}
		const functionType = node[FunctionTypeSymbol];
		if (functionType === "ParametersValidator") {
			if (!noValidate) {
				await node(...args);
			}
			const fn = node.next;
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
	return await contextedCallImpl(next, rest, ctx, args, noValidate);
}

const illegalPaths = new Set([
	"constructor",
	"prototype",
	"__proto__",
]);

export function contextedCall<Context, N extends Node<Context>>(
	node: N, path: string[], ctx: Context, args: unknown[], noValidate?: boolean
) {
	for (const p of path) {
		if (p.indexOf(".") !== -1) {
			throw new Error(`Invalid path: ${p}, cannot contain "."`);
		}
		if (illegalPaths.has(p)) {
			throw new Error(`Invalid path: ${p}, cannot be a reserved word (${Array.from(illegalPaths).join(", ")})`);
		}
	}
	return contextedCallImpl(node, path, ctx, args, noValidate ?? false);
}

function createLocalInterfaceImpl(
	root: Node<any>, ctx: any, path: string[], noValidate?: boolean
): any {
	return new Proxy((...args: any[]) => contextedCall(root, path, ctx, args, noValidate), {
		get(_, key: string) {
			return createLocalInterfaceImpl(ctx, root, [...path, key], noValidate);
		},
	});
}

export function createLocalInterface<Context, N extends Node<Context>>(
	node: N, ctx: Context, noValidate?: boolean
): ToInterface<N, any> {
	return createLocalInterfaceImpl(node, ctx, [], noValidate);
}

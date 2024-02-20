export class LazyPromise<T> implements Promise<T> {
	private _promise: Promise<T> | undefined;

	public [Symbol.toStringTag] = "Promise";

	constructor(private readonly promiseFactory: () => Promise<T>) {}

	execute() {
		if (this._promise === undefined) {
			this._promise = this.promiseFactory();
		}
		return this._promise!;
	}

	resolve(value: T | PromiseLike<T>): void {
		this._promise = Promise.resolve(value);
	}

	reject(reason: any): void {
		this._promise = Promise.reject(reason);
	}

	get executed() {
		return this._promise !== undefined;
	}

	get then() {
		return this.execute().then.bind(this._promise);
	}

	get catch() {
		return this.execute().catch.bind(this._promise);
	}

	get finally() {
		return this.execute().finally.bind(this._promise);
	}
}

export const PipelinedPromiseSymbol = Symbol("PipelinedPromise");
export class ImproperUseOfPipelinedPromiseError extends Error {
	constructor() {
		super("Improper use of pipelined promise. pipeline() should only be used inside a rpc call.");
	}
}

/**
 * This function is used to mark a promise as a pipelined. The return type
 * is the input promise resolved.
 * This function should not be used outside of a rpc call.
 * Using a pipelined promise outside of a rpc call will throw an error.
 *
 * @param promise The promise to mark as pipelined
 */
export function pipeline<T>(promise: Promise<T>): T {
	return new Proxy({}, {
		get(_, key) {
			if (key === PipelinedPromiseSymbol) {
				return promise;
			}
			throw new ImproperUseOfPipelinedPromiseError();
		},
		set() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		apply() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		construct() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		defineProperty() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		deleteProperty() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		getOwnPropertyDescriptor() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		getPrototypeOf() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		has() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		isExtensible() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
		ownKeys() {
			throw new ImproperUseOfPipelinedPromiseError();
		},
	}) as unknown as T;
}

import type { RPCRequest, RPCResponse } from "@kissrpc/jsonrpc";
export type { RPCRequest, RPCResponse };

import { RPCError } from "@kissrpc/jsonrpc";
import type { PipelinedRPCRequest, PipelinedRPCResponse } from "@kissrpc/jsonrpc";
import { type Requester } from "../rpc.js";
import { ImproperUseOfPipelinedPromiseError, LazyPromise } from "../pipelining.js";

export class FetchRequesterError extends Error { }

function checkRPCResponse(req: RPCRequest, res: unknown): asserts res is RPCResponse {
	if (typeof res !== "object" || res === null) {
		throw new FetchRequesterError("Invalid response");
	}
	const obj = res as Record<string, unknown>;
	if (obj.jsonrpc !== "2.0") {
		throw new FetchRequesterError("Invalid JSON-RPC version");
	}
	if (obj.id !== req.id) {
		throw new FetchRequesterError("Invalid response ID");
	}
}
interface FullFetchRequesterOptions {
	fetch: typeof globalThis.fetch;
	maxBatchSize: number;
	maxBatchWaitMs: number;
	timeoutMs: number;
	init: RequestInit;
}

const fetchTransportOptionsDefault: FullFetchRequesterOptions = {
	fetch: globalThis.fetch,
	maxBatchSize: 1,
	maxBatchWaitMs: 0,
	timeoutMs: 10000,
	init: {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	},
};

export type FetchRequesterOptions = Partial<FullFetchRequesterOptions>;

interface PendingRequest {
	request: RPCRequest;
	resolve: (value: RPCResponse) => void;
	reject: (reason: unknown) => void;
}

export class FetchRequester implements Requester {
	private id = 1;
	private options: FullFetchRequesterOptions;
	private batch: PendingRequest[] = [];
	private timeout: ReturnType<typeof setTimeout> | undefined;

	constructor(private url: string, options?: FetchRequesterOptions) {
		this.options = { ...fetchTransportOptionsDefault, ...options };
	}

	public async flush(): Promise<void> {
		if (this.timeout !== undefined) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}

		const fetch = this.options.fetch;

		const batch = this.batch;
		this.batch = [];

		if (batch.length === 0) {
			return;
		}

		if (batch.length === 1) {
			const req = batch[0].request;
			let stringified: string;
			try {
				stringified = JSON.stringify(req);
			} catch (e) {
				if (e instanceof ImproperUseOfPipelinedPromiseError) {
					throw new FetchRequesterError("FetchRequester does not support pipelined requests");
				}
				throw e;
			}
			const res = await fetch(this.url, {
				signal: AbortSignal.timeout(this.options.timeoutMs),
				...this.options.init,
				headers: {
					...this.options.init.headers,
					"Content-Type": "application/json",
				},
				body: stringified,
			});
			const result = await res.json();
			checkRPCResponse(req, result);
			batch[0].resolve(result);
		} else {
			const requests = batch.map((req) => req.request);
			let stringified: string;
			try {
				stringified = JSON.stringify(requests);
			} catch (e) {
				if (e instanceof ImproperUseOfPipelinedPromiseError) {
					throw new FetchRequesterError("FetchRequester does not support pipelined requests");
				}
				throw e;
			}

			const res = await fetch(this.url, {
				signal: AbortSignal.timeout(this.options.timeoutMs),
				...this.options.init,
				headers: {
					...this.options.init.headers,
					"Content-Type": "application/json",
				},
				body: stringified,
			});

			const results = await res.json();
			if (!Array.isArray(results)) {
				throw new FetchRequesterError("Invalid response");
			}
			if (results.length !== requests.length) {
				throw new FetchRequesterError("Invalid response");
			}
			for (let i = 0; i < requests.length; i++) {
				const req = batch[i];
				const res = results[i];
				try {
					checkRPCResponse(req.request, res);
					req.resolve(res);
				} catch (e) {
					req.reject(e);
				}
			}
		}
	}

	private async queueRequest(req: RPCRequest): Promise<RPCResponse> {
		const promise = new Promise<RPCResponse>((resolve, reject) => {
			this.batch.push({ request: req, resolve, reject });
		});
		if (this.batch.length >= this.options.maxBatchSize) {
			await this.flush();
		} else if (this.timeout === undefined) {
			this.timeout = setTimeout(
				() => this.flush(),
				this.options.maxBatchWaitMs
			);
		}
		return promise;
	}

	public async request(path: string[], args: unknown[]): Promise<unknown> {
		const req: RPCRequest = {
			jsonrpc: "2.0",
			id: this.id++,
			method: path.join("."),
			params: args,
		};
		const resp = await this.queueRequest(req);
		if (resp.error !== undefined) {
			throw new RPCError(resp.error.code, resp.error.message, resp.error.data);
		}
		return resp.result;
	}
}

export class PipelinedFetchRequester implements Requester {
	private id = 1;
	private options: FullFetchRequesterOptions;
	private pendingPromises = new Set<LazyPromise<unknown>>();

	constructor(private url: string, options?: FetchRequesterOptions) {
		this.options = { ...fetchTransportOptionsDefault, ...options };
		this.request = this.request.bind(this);
	}

	public request(path: string[], args: unknown[]): Promise<unknown> {
		const lazyPromise = new LazyPromise(async () => {
			this.pendingPromises.delete(lazyPromise);
			// TODO: Implement pipelined requests
			throw new Error("Not implemented");
		});
		this.pendingPromises.add(lazyPromise);
		return lazyPromise;
	}
}

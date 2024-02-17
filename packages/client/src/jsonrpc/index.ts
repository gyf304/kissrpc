import type { RPCRequest, RPCResponse } from "@kissrpc/jsonrpc";
export type { RPCRequest, RPCResponse };

import { RPCError } from "@kissrpc/jsonrpc";
import type { Requester } from "../rpc.js";

export class RequesterError extends Error { }

function checkRPCResponse(req: RPCRequest, res: unknown): asserts res is RPCResponse {
	if (typeof res !== "object" || res === null) {
		throw new RequesterError("Invalid response");
	}
	const obj = res as Record<string, unknown>;
	if (obj.jsonrpc !== "2.0") {
		throw new RequesterError("Invalid JSON-RPC version");
	}
	if (obj.id !== req.id) {
		throw new RequesterError("Invalid response ID");
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
			const res = await fetch(this.url, {
				signal: AbortSignal.timeout(this.options.timeoutMs),
				...this.options.init,
				headers: {
					...this.options.init.headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(req),
			});
			const result = await res.json();
			checkRPCResponse(req, result);
			batch[0].resolve(result);
		} else {
			const requests = batch.map((req) => req.request);

			const res = await fetch(this.url, {
				signal: AbortSignal.timeout(this.options.timeoutMs),
				...this.options.init,
				headers: {
					...this.options.init.headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requests),
			});

			const results = await res.json();
			if (!Array.isArray(results)) {
				throw new RequesterError("Invalid response");
			}
			if (results.length !== requests.length) {
				throw new RequesterError("Invalid response");
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

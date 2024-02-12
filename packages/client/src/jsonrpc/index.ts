import type { RPCRequest, RPCResponse } from "@kissrpc/jsonrpc";
export type { RPCRequest, RPCResponse };

import { RPCError } from "@kissrpc/jsonrpc";
import { Interface } from "../rpc";

export interface LazyPromise<T> extends Promise<T> {
	execute(): void;
}

export interface RoundTripper {
	roundTrip(req: RPCRequest): Promise<RPCResponse>;
}

export class RoundTripperError extends Error {}

function checkRPCResponse(req: RPCRequest, res: unknown): asserts res is RPCResponse {
	if (typeof res !== "object" || res === null) {
		throw new RoundTripperError("Invalid response");
	}
	const obj = res as Record<string, unknown>;
	if (obj.jsonrpc !== "2.0") {
		throw new RoundTripperError("Invalid JSON-RPC version");
	}
	if (obj.id !== req.id) {
		throw new RoundTripperError("Invalid response ID");
	}
}

class RPCClientImpl {
	private id = 1;
	constructor (public readonly transport: RoundTripper) {}

	private request(path: string[], args: any[]): Promise<any> {
		return this.transport.roundTrip({
			jsonrpc: "2.0",
			id: this.id++,
			method: path.join("."),
			params: args.length > 1 ? args : args[0],
		}).then((res) => {
			if (res.error !== undefined) {
				throw new RPCError(res.error.code, res.error.message, res.error.data);
			}
			return res.result;
		});
	}

	private makeRequester(path: string[]): (...args: any[]) => Promise<any> {
		return (...args: any[]) => this.request(path, args);
	}

	public makeClient(path: string[] = []): any {
		const self = this;
		return new Proxy(self.makeRequester(path), {
			get(_, key: string) {
				return self.makeClient([...path, key]);
			},
		});
	}
}

interface ClientConstructor {
	new <T extends Interface>(transport: RoundTripper): T;
}

function client<T extends Interface>(transport: RoundTripper): T {
	const impl = new RPCClientImpl(transport);
	return impl.makeClient() as T;
}

export const Client = client as unknown as ClientConstructor;


interface FullFetchTransportOptions {
	fetch: typeof globalThis.fetch;
	maxBatchSize: number;
	maxBatchWaitMs: number;
	timeoutMs: number;
	init: RequestInit;
}

const fetchTransportOptionsDefault: FullFetchTransportOptions = {
	fetch: globalThis.fetch,
	maxBatchSize: 10,
	maxBatchWaitMs: 0,
	timeoutMs: 10000,
	init: {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	},
};

export type FetchTransportOptions = Partial<FullFetchTransportOptions>;

interface PendingRequest {
	request: RPCRequest;
	resolve: (value: RPCResponse) => void;
	reject: (reason: unknown) => void;
}

export class FetchTransport {
	private options: FullFetchTransportOptions;
	private batch: PendingRequest[] = [];
	private timeout: ReturnType<typeof setTimeout> | undefined;

	constructor(private url: string, options?: FetchTransportOptions) {
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
			throw new RoundTripperError("Invalid response");
		}
		if (results.length !== requests.length) {
			throw new RoundTripperError("Invalid response");
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

	public roundTrip(req: RPCRequest): Promise<RPCResponse> {
		return new Promise((resolve, reject) => {
			this.batch.push({ request: req, resolve, reject });
			if (this.batch.length >= this.options.maxBatchSize) {
				this.flush();
				return;
			}
			if (this.timeout === undefined) {
				this.timeout = setTimeout(() => {
					this.timeout = undefined;
					this.flush();
				}, this.options.maxBatchWaitMs);
			}
		});
	}
}

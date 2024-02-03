import type { RPCRequest, RPCResponse } from "@kissrpc/server";

export class RPCError extends Error {
	constructor(public readonly code: number, message: string, public readonly data?: unknown) {
		super(message);
		this.name = "RPCError";
	}
}

export interface RPCRoundTripper {
	roundTrip(req: RPCRequest): Promise<RPCResponse>;
}

interface Client {
	[key: string]: ((...args: any[]) => Promise<any>) | Client;
}

export class RPCRoundTripperError extends Error {}

function checkRPCResponse(req: RPCRequest, res: unknown): void {
	if (typeof res !== "object" || res === null) {
		throw new RPCRoundTripperError("Invalid response");
	}
	const obj = res as Record<string, unknown>;
	if (obj.jsonrpc !== "2.0") {
		throw new RPCRoundTripperError("Invalid JSON-RPC version");
	}
	if (obj.id !== req.id) {
		throw new RPCRoundTripperError("Invalid response ID");
	}
}

function makeRequester(transport: RPCRoundTripper, path: string[]): (...args: any[]) => Promise<any> {
	return (...args: any[]) => {
		return transport.roundTrip({
			jsonrpc: "2.0",
			id: null,
			method: path.join("."),
			params: args.length > 1 ? args : args[0],
		}).then((res) => {
			if (res.error !== undefined) {
				throw new RPCError(res.error.code, res.error.message, res.error.data);
			}
			return res.result;
		});
	};
}

function makeClient(transport: RPCRoundTripper, path: string[]): any {
	return new Proxy(makeRequester(transport, path), {
		get(_, key: string) {
			return makeClient(transport, [...path, key]);
		},
	});
}

export function client<T extends Client>(transport: RPCRoundTripper): T {
	return makeClient(transport, []) as T;
}

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
	private id = 1;

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
			throw new RPCRoundTripperError("Invalid response");
		}
		if (results.length !== requests.length) {
			throw new RPCRoundTripperError("Invalid response");
		}
		for (let i = 0; i < requests.length; i++) {
			const req = batch[i];
			const res = results[i];
			try {
				checkRPCResponse(req.request, res);
				req.resolve(res as RPCResponse);
			} catch (e) {
				req.reject(e);
			}
		}
	}

	public roundTrip(req: RPCRequest): Promise<RPCResponse> {
		return new Promise((resolve, reject) => {
			this.batch.push({ request: { ...req, id: this.id++ }, resolve, reject });
			if (this.batch.length >= this.options.maxBatchSize) {
				this.flush();
				return;
			}
			if (this.timeout === undefined) {
				this.timeout = setTimeout(() => {
					this.timeout = undefined;
					this.flush().catch((e) => {
						console.error(e);
					});
				}, this.options.maxBatchWaitMs);
			}
		});
	}
}

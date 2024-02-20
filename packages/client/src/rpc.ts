export interface Interface {
	[key: string]: ((...args: any[]) => Promise<any>) | Interface;
}

export interface Requester {
	supportsPipelining?: boolean;
	request(path: string[], args: unknown[]): Promise<unknown>;
}

function purify(value: unknown, strict: boolean): unknown {
	const type = typeof value;
	switch (type) {
		case "string":
		case "number":
		case "boolean":
		case "undefined":
		case "bigint":
			return value;
		case "object":
		case "function":
			if (value === null) {
				return null;
			}
			if (value === undefined) {
				return undefined;
			}
			if (Array.isArray(value)) {
				return value.map((v) => purify(v, strict));
			}
			if (strict && value?.constructor !== Object) {
				throw new Error(`${value.toString()} is not a plain object`);
			}
			const obj: Record<string, unknown> = {};
			for (const key of Object.keys(value)) {
				obj[key] = purify((value as Record<string, unknown>)[key], strict);
			}
			return obj;
		default:
			throw new Error(`Unsupported type: ${type}`);
	}
}

class RPCClientImpl {
	constructor (public readonly requester: Requester) {
		this.makeClient = this.makeClient.bind(this);
		this.makeRequester = this.makeRequester.bind(this);
	}

	private makeRequester(path: string[]): (...args: any[]) => Promise<any> {
		return (...args: any[]) => {
			return this.requester.request(path, purify(args, true) as unknown[]);
		};
	}

	public makeClient(path: string[] = []): any {
		const self = this;
		return new Proxy(self.makeRequester(path), {
			get(_, key: unknown) {
				if (typeof key !== "string") {
					return undefined;
				}
				if (key === "constructor" || key === "prototype") {
					throw new Error(`Invalid path name: ${key}`);
				}
				return self.makeClient([...path, key]);
			},
		});
	}
}

interface ClientConstructor {
	new <T extends Interface>(requester: Requester): T;
}

function client<T extends Interface>(requester: Requester): T {
	const impl = new RPCClientImpl(requester);
	return impl.makeClient() as T;
}

export const Client = client as unknown as ClientConstructor;

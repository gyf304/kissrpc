import { Requester } from "./requester.js";

export interface Interface {
	[key: string]: ((...args: any[]) => Promise<any>) | Interface;
}

class RPCClientImpl {
	constructor (public readonly requester: Requester) {
		this.makeClient = this.makeClient.bind(this);
		this.makeRequester = this.makeRequester.bind(this);
	}

	private makeRequester(path: string[]): (...args: any[]) => Promise<any> {
		return (...args: any[]) => {
			return this.requester.request(path, args);
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

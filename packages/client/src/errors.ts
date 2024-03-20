export class NotPlainObjectError extends Error {
	constructor(path: (string | number)[]) {
		super(`Object at "${path.join(".")}" is not a plain object. Check the parameters.`);
	}
}

export class PipeliningNotSupportedError extends Error {
	constructor() {
		super("Pipelining is not supported by the requester");
	}
}

export class PipeliningUnavailableError extends Error {
	constructor() {
		super("Pipelining is not available. Hint: use pipeline option when creating the client.");
	}
}

export class RequesterMismatchError extends Error {
	constructor(path: (string | number)[]) {
		super(`Pipelined promise at "${path.join(".")}" is from different client / requester`);
	}
}

export class ImproperUseOfPipelinedPromiseError extends Error {
	constructor() {
		super("Improper use of pipelined promise. pipeline() should only be used inside a rpc call.");
	}
}

export class PromiseNotPipelinableError extends Error {
	constructor() {
		super([
			"Promise is not pipelinable. The promise needs to be a LazyRPCPromise.",
			`Did you forget to use "pipeline" option when creating the client?`,
		].join(" "));
	}
}

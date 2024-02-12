import * as k from "@kissrpc/server";
import * as z from "zod";

// We define a new context here
// We define a new context that includes the user agent
export interface Context {
	agent: string;
}

// Since the context of the router we are defining is different from the parent context,
// we need to transform the context to the new context
export default k.useContext((ctx: Context) => ({
	hello: k.validateInput(
		async (name: string) => `Hello, ${name}! You are using ${ctx.agent}`,
		k.zodValidator(z.string()),
	),
}));

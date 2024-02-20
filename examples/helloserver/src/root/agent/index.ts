import { useContext, validateParameters, zodValidator } from "@kissrpc/server";
import * as z from "zod";

// We define a new context here
// We define a new context that includes the user agent
export interface Context {
	agent: string;
}

// Since the context of the router we are defining is different from the parent context,
// we need to transform the context to the new context
export default useContext((ctx: Context) => ({
	hello: validateParameters(
		async (name: string) => `Hello, ${name}! You are using ${ctx.agent}`,
		zodValidator(z.string()),
	),
}));

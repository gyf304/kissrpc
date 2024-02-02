import * as k from "@kissrpc/server";
import * as z from "zod";

import type { Context as ParentContext } from "../index";

// We define a new context here
// In this case, we add an agent field to the context,
// which is the user agent of the request
export interface Context extends ParentContext {
	agent: string;
}

// r is the rpc helper
// which is used to define endpoints, routers, and context transformers
// with a specific context
const r = k.rpc<Context>();

// Since the context of the router we are defining is different from the parent context,
// we need to transform the context to the new context
export const node = k.rpc<ParentContext>().transform((ctx) => ({
	...ctx,
	agent: ctx.req.headers["user-agent"] ?? "unknown",
}))
// We then define the router as normal
.next(r.router({
	hello: r.endpoint
		.zod(z.string())
		.handler((ctx, name) => {
			// We can now use the agent field in the context
			return `Hello, ${name}! You are using ${ctx.agent}`;
		}),
}));

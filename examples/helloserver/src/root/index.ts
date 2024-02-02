import * as k from "@kissrpc/server";
import * as z from "zod";

import type { Context as ParentContext } from "../index";

import { node as agent } from "./agent";

export type Context = ParentContext;

// r is the rpc helper
// which is used to define endpoints, routers, and context transformers
// with a specific context
const r = k.rpc<Context>();

export const node = r.router({
	hello: r.endpoint
		// a `.zod` helper is used here to create a validator from a zod tuple schema
		.zod(z.string())
		// handler has a call signature of (context: Context, ...input: Input) => Promise<Output>
		.handler((ctx, name) => {
			return `Hello, ${name}!`;
		}),

	add: r.endpoint
		.zod(z.number(), z.number())
		.handler((ctx, a, b) => {
			return a + b;
		}),

	subtract: r.endpoint
		.zod(z.number(), z.number())
		.handler((ctx, a, b) => {
			return a - b;
		}),

	wait: r.endpoint
		.zod(z.number())
		// the handler can be an async function
		.handler(async (ctx, ms) => {
			await new Promise((resolve) => {
				setTimeout(() => resolve(ms), ms);
			});
			return `Waited for ${ms}ms`;
		}),

	noop: r.endpoint
		.handler((ctx) => {
			return null;
		}),

	// agent is a sub-router node, defined in agent/index.ts
	agent,
});

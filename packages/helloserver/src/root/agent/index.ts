import * as kissrpc from "@kissrpc/server";
import * as z from "zod";

import type { Context as ParentContext } from "../index";

export interface Context extends ParentContext {
	agent: string;
}

const r = kissrpc.rpc<Context>();
export const node = kissrpc.rpc<ParentContext>().transform((ctx) => ({
	...ctx,
	agent: ctx.req.headers["user-agent"] ?? "unknown",
})).next(r.router({
	hello: r.endpoint
		.validator(kissrpc.zod(z.tuple([z.string()])))
		.handler((ctx, name) => {
			return `Hello, ${name}! You are using ${ctx.agent}`;
	}),
}));

import * as kissrpc from "@kissrpc/server";
import * as z from "zod";

import type { Context as ParentContext } from "../index";

import { node as agent } from "./agent";

export type Context = ParentContext;

const r = kissrpc.rpc<Context>();
export const node = r.router({
	hello: r.endpoint
		.validator(kissrpc.zod(z.tuple([z.string()])))
		.handler((ctx, name) => {
			return `Hello, ${name}!`;
		}),
	agent,
});

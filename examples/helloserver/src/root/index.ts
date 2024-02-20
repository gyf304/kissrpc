import { useContext, provideContext, validateParameters, zodValidator } from "@kissrpc/server";
import * as z from "zod";

import type { Context as ParentContext } from "../index";

import agent from "./agent";
import { JSONSerializable } from "@kissrpc/jsonrpc";

export type Context = ParentContext;

export default useContext((ctx: Context) => ({
	hello: validateParameters(
		async (name: string) => `Hello, ${name}!`,
		zodValidator(z.string()),
	),
	add: validateParameters(
		async (a: number, b: number) => a + b,
		zodValidator(z.number(), z.number()),
	),
	wait: validateParameters(
		async (ms: number) => {
			await new Promise((resolve) => setTimeout(resolve, ms));
			return `Waited for ${ms}ms`;
		},
		zodValidator(z.number()),
	),
	error: async () => {
		throw new Error("This is a custom error");
	},
	echo: async <T extends JSONSerializable>(x: T) => x,
	agent: provideContext(agent, () => ({
		agent: ctx.req.headers["user-agent"] ?? "Unknown",
	})),
}));

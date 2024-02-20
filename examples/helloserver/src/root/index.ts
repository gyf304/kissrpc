import * as k from "@kissrpc/server";
import * as z from "zod";

import type { Context as ParentContext } from "../index";

import agent from "./agent";
import { JSONSerializable } from "@kissrpc/jsonrpc";

export type Context = ParentContext;

export default k.useContext((ctx: Context) => ({
	hello: k.validateInput(
		async (name: string) => `Hello, ${name}!`,
		k.zodValidator(z.string()),
	),
	add: k.validateInput(
		async (a: number, b: number) => a + b,
		k.zodValidator(z.number(), z.number()),
	),
	wait: k.validateInput(
		async (ms: number) => {
			await new Promise((resolve) => setTimeout(resolve, ms));
			return `Waited for ${ms}ms`;
		},
		k.zodValidator(z.number()),
	),
	error: async () => {
		throw new Error("This is a custom error");
	},
	echo: async <T extends JSONSerializable>(x: T) => x,
	agent: k.provideContext(agent, () => ({
		agent: ctx.req.headers["user-agent"] ?? "Unknown",
	})),
}));

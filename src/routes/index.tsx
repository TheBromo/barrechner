import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

const hello = createServerFn().handler(async () => ({ host: getRequestHeader("host") ?? "" }));

export const Route = createFileRoute("/")({ loader: () => hello(), component: () => <h1>Hallo {Route.useLoaderData().host}</h1> });

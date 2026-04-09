#!/usr/bin/env bun
// Web UI entry point

import { createWebApp } from "./composition-root.js";

const port = parseInt(process.env["PORT"] ?? "4747", 10);
const { webAdapter } = createWebApp();
await webAdapter.start(port);

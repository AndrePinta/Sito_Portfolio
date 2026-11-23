import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime"
};
const port = Number(process.env.PORT || 4173);

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const file = pathname === "/" || /^\/projects(?:\/[^/]+)?\/?$/.test(pathname)
    ? path.join(root, "index.html")
    : path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  let resolved;
  let info;
  try {
    resolved = await realpath(file);
    info = await stat(resolved);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      response.writeHead(404).end("Not found");
      return;
    }
    console.error("Could not read requested file:", error);
    response.writeHead(500).end("Internal server error");
    return;
  }
  if (!resolved.startsWith(`${root}${path.sep}`) || !info.isFile()) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  response.writeHead(200, {
    "Content-Type": types[path.extname(resolved).toLowerCase()] || "application/octet-stream",
    "Content-Length": info.size,
    "X-Content-Type-Options": "nosniff"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(resolved);
  stream.on("error", (error) => {
    console.error("Could not stream requested file:", error);
    response.destroy(error);
  });
  stream.pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Portfolio available at http://127.0.0.1:${port}/`);
});

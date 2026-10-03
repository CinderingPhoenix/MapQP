import fs from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function editorApi(): Plugin {
  return {
    name: "mapqp-editor-api",
    configureServer(server) {
      server.middlewares.use("/maps", async (request, response) => {
        const mapsDirectory = path.resolve(__dirname, "maps");
        const relativePath = decodeURIComponent(request.url?.split("?")[0] ?? "").replace(/^[/\\]+/, "");
        const absolutePath = path.resolve(mapsDirectory, relativePath);
        if (absolutePath !== mapsDirectory && !absolutePath.startsWith(`${mapsDirectory}${path.sep}`)) {
          response.statusCode = 400;
          response.end("Invalid map path");
          return;
        }
        try {
          const content = await fs.readFile(absolutePath);
          const extension = path.extname(absolutePath).toLowerCase();
          const contentType = extension === ".png" ? "image/png" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/webp";
          response.setHeader("Content-Type", contentType);
          response.end(content);
        } catch {
          response.statusCode = 404;
          response.end("Map image not found");
        }
      });
      server.middlewares.use("/api/maps", async (_request, response) => {
        const mapsDirectory = path.resolve(__dirname, "maps");
        const entries: { path: string; name: string; networkPath: string }[] = [];
        async function walk(directory: string) {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) await walk(absolute);
            else if (/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) {
              const relative = path.relative(mapsDirectory, absolute).replace(/\\/g, "/");
              entries.push({
                path: relative,
                name: relative.replace(/\.[^.]+$/, ""),
                networkPath: `${relative.replace(/\.[^.]+$/, "")}.json`,
              });
            }
          }
        }
        await walk(mapsDirectory);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(entries));
      });
      server.middlewares.use("/api/map-network", async (request, response) => {
        const mapsDirectory = path.resolve(__dirname, "maps");
        const requestedPath = request.url?.split("?path=")[1];
        if (!requestedPath) {
          response.statusCode = 400;
          response.end("Missing map path");
          return;
        }
        const networkPath = decodeURIComponent(requestedPath);
        const absolutePath = path.resolve(mapsDirectory, networkPath);
        if (
          (absolutePath !== mapsDirectory && !absolutePath.startsWith(`${mapsDirectory}${path.sep}`))
          || !absolutePath.endsWith(".json")
        ) {
          response.statusCode = 400;
          response.end("Invalid map path");
          return;
        }
        if (request.method === "GET") {
          try {
            const content = await fs.readFile(absolutePath, "utf8");
            response.setHeader("Content-Type", "application/json");
            response.end(content);
          } catch {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ nodes: [], connections: {} }));
          }
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("GET or POST required");
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, `${JSON.stringify(data.network, null, 2)}\n`);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error("Floor map save failed:", error);
          response.statusCode = 500;
          response.end("Unable to save floor map network");
        }
      });
      server.middlewares.use("/api/map-links", async (request, response) => {
        const linksPath = path.resolve(__dirname, "maps", "map-links.json");
        if (request.method === "GET") {
          try {
            response.setHeader("Content-Type", "application/json");
            response.end(await fs.readFile(linksPath, "utf8"));
          } catch {
            response.setHeader("Content-Type", "application/json");
            response.end("[]");
          }
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("GET or POST required");
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!Array.isArray(data.links)) throw new Error("Links must be an array");
          await fs.mkdir(path.dirname(linksPath), { recursive: true });
          await fs.writeFile(linksPath, `${JSON.stringify(data.links, null, 2)}\n`);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error("Map link save failed:", error);
          response.statusCode = 500;
          response.end("Unable to save map links");
        }
      });
      server.middlewares.use("/api/editor", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("POST required");
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const dataDirectory = path.resolve(__dirname, "../src/data");
          const routePoints = {
            nodes: data.nodes,
            connections: data.connections,
          };
          await fs.writeFile(path.join(dataDirectory, "route-points.json"), `${JSON.stringify(routePoints, null, 2)}\n`);
          await fs.writeFile(path.join(dataDirectory, "wpi-buildings.json"), `${JSON.stringify(data.buildings, null, 2)}\n`);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error("Editor save failed:", error);
          response.statusCode = 500;
          response.end("Unable to save editor data");
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), editorApi()],
  resolve: {
    alias: {
      "react-leaflet": "react-leaflet",
    },
  },
});

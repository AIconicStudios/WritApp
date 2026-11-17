import type { NextConfig } from "next";
import path from "node:path";

/**
 * Two builds from one codebase:
 *   npm run build           → web server (Node, SQLite file, API routes)
 *   npm run build:mobile    → static files for the Android app (MOBILE=1). Everything runs on the phone:
 *                             the same API handlers are called in-process, SQLite runs as WebAssembly,
 *                             and server-only modules are swapped for their phone versions below.
 */
const MOBILE = process.env.MOBILE === "1";
const src = (p: string) => path.resolve(__dirname, "src", p);

const webConfig: NextConfig = {
  output: "standalone",
  env: { NEXT_PUBLIC_MOBILE: "0" }, // compile-time constant so phone-only code is removed from the web bundle
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "mammoth", "nspell", "dictionary-en", "pdfkit", "docx", "jszip", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  poweredByHeader: false,
  webpack(config, { webpack }) {
    // Phone-only modules (on-device engine bootstrap, in-app router) are not part of the web build.
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^@\/mobile\/(boot|router|files)$/, src("mobile/stub.ts")));
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

const mobileConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  pageExtensions: ["page.tsx", "tsx"], // excludes route.ts (API) and middleware.ts — the phone calls handlers directly
  env: { NEXT_PUBLIC_MOBILE: "1" },
  typescript: { ignoreBuildErrors: false },
  webpack(config, { isServer, webpack }) {
    const swap = (re: RegExp, file: string) => new webpack.NormalModuleReplacementPlugin(re, (r: any) => {
      if (r.createData?.resource) r.createData.resource = file;
      else r.request = file;
    });
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (r: any) => {
        r.request = r.request.replace(/^node:/, "");
      }),
      swap(/src[\\/]lib[\\/]secure\.ts$/, src("mobile/secure.ts")),
      swap(/src[\\/]lib[\\/]auth\.ts$/, src("mobile/auth.ts")),
      swap(/src[\\/]lib[\\/]http\.ts$/, src("mobile/http.ts")),
      swap(/src[\\/]lib[\\/]engine[\\/]spell\.ts$/, src("mobile/spell.ts")),
    );
    config.resolve.alias = {
      ...config.resolve.alias,
      "better-sqlite3$": src("mobile/sqlite.ts"),
      "pdf-parse/lib/pdf-parse.js$": src("mobile/pdfparse.ts"),
      "mammoth$": src("mobile/mammoth.ts"),
      "pdfkit$": path.resolve(__dirname, "node_modules/pdfkit/js/pdfkit.standalone.js"),
    };
    if (!isServer) {
      config.resolve.alias = { ...config.resolve.alias, "fs$": src("mobile/fs.ts"), "path$": require.resolve("path-browserify") };
      config.resolve.fallback = { ...config.resolve.fallback, crypto: false, stream: false, zlib: false, canvas: false, http: false, https: false, url: false };
      config.plugins.push(new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }));
    }
    config.experiments = { ...config.experiments, topLevelAwait: true, asyncWebAssembly: true };
    return config;
  },
};

export default MOBILE ? mobileConfig : webConfig;

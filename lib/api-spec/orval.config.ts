import { defineConfig, InputTransformerFn } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      // Only the versioned specification is trusted; no local/remote external refs.
      parserOptions: { externalRefs: { allow: [] } },
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      // Keep the handwritten root barrel out of Orval's workspace index writer.
      target: path.resolve(apiClientReactSrc, "generated/api.ts"),
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      formatter: "prettier",
      indexFiles: true,
      override: {
        query: { version: 5 },
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      parserOptions: { externalRefs: { allow: [] } },
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      formatter: "prettier",
      indexFiles: false,
      override: {
        zod: {
          version: 3,
          coerce: {
            query: ["boolean", "number", "string"],
            param: ["boolean", "number", "string"],
          },
        },
        useDates: true,
      },
    },
  },
});

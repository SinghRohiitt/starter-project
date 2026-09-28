# my-api

Express + TypeScript backend scaffolded with
[create-rohit-app](https://www.npmjs.com/package/create-rohit-app).

## Getting started

```bash
npm install
npm run dev
```

The server listens on `http://localhost:3000` and exposes `GET /health`.

## Scripts

| Script               | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the dev server with hot reload (`tsx watch`) |
| `npm run build`      | Compile TypeScript to `dist/`                |
| `npm start`          | Run the compiled server                      |
| `npm run typecheck`  | Type-check without emitting output           |

## Project structure

```
src/
├── app.ts               Express app assembly: middleware, routes, error handling
├── server.ts            Process lifecycle: startup hooks, listening, graceful shutdown
├── bootstrap/           Modules that register startup/shutdown hooks (database, cache, ...)
├── config/              Environment parsing and feature configuration
├── controllers/         HTTP layer: read the request, write the response
├── middleware/          Cross-cutting concerns: logging, request ids, 404, errors
├── routes/              Route tables that bind controllers to paths
├── services/            Business logic, independent of HTTP
└── utils/               Small shared helpers (logger, ApiError)
```

The layering is one-directional: `routes` -> `controllers` -> `services`. A
service never touches `req`/`res`, and a controller never contains business
logic, so either layer can be replaced without touching the other.

## Configuration

Environment variables are read from `.env` at startup and validated with a schema
in `src/config/env.ts`. An invalid value stops the process with a readable
message instead of failing later with `undefined is not a function`.

Start from `.env.example`:

```bash
cp .env.example .env
```

`.env` is gitignored, so each developer and each deployed environment supplies
its own values.

## Error handling

Controllers throw; they do not build error responses. Throw an `ApiError` from
`src/utils/api-error.ts` for expected failures (bad input, missing record,
unauthorized) and the single error middleware turns it into a consistent JSON
body:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cannot GET /missing"
  }
}
```

Anything that is not an `ApiError` is treated as a bug, logged with its stack,
and reported to the client as a generic `500`. Express 5 forwards rejected
promises from async handlers to the error handler, so a controller can simply
`throw` after an `await`.

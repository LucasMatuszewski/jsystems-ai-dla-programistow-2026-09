const configuredOrigin = new URL(process.env.TEST_APP_ORIGIN ?? "http://127.0.0.1:3000");
if (configuredOrigin.protocol !== "http:" || configuredOrigin.hostname !== "127.0.0.1") throw new Error("Integration app origin must use local loopback HTTP");
export const APP_ORIGIN = configuredOrigin.origin;

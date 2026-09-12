import { describe, expect, it } from "vitest";
import {
  originFromEnv,
  originFromHeaders,
  resolvePublicOrigin,
  rewriteShareUrlForClient,
} from "./app-url";

describe("app url", () => {
  it("prefers the forwarded production host over localhost env", () => {
    const headers = new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "poc-home-visualizer.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(originFromHeaders(headers)).toBe(
      "https://poc-home-visualizer.vercel.app",
    );
    expect(
      resolvePublicOrigin(new Request("http://localhost:3000/api/tours", { headers })),
    ).toBe("https://poc-home-visualizer.vercel.app");
  });

  it("rewrites a stored localhost share link on the deployed origin", () => {
    expect(
      rewriteShareUrlForClient(
        "http://localhost:3000/tour/architectural-walkthrough-1-89e971",
        "https://poc-home-visualizer.vercel.app",
      ),
    ).toBe(
      "https://poc-home-visualizer.vercel.app/tour/architectural-walkthrough-1-89e971",
    );
  });

  it("keeps localhost links while developing locally", () => {
    expect(
      rewriteShareUrlForClient(
        "http://localhost:3000/tour/demo",
        "http://localhost:3000",
      ),
    ).toBe("http://localhost:3000/tour/demo");
  });

  it("uses VERCEL_URL when no request host is available", () => {
    const previous = process.env.VERCEL_URL;
    process.env.VERCEL_URL = "poc-home-visualizer.vercel.app";
    expect(originFromEnv()).toBe("https://poc-home-visualizer.vercel.app");
    if (previous == null) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previous;
  });
});

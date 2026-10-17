import assert from "node:assert/strict";
import { test } from "node:test";
import { mentions } from "../src/sources.js";

test("GitHub mentions are literal-verified against descriptions and READMEs", async () => {
  const originalFetch = globalThis.fetch;
  const readmes = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("hn.algolia.com")) return Response.json({ hits: [] });
    if (url.includes("api.github.com/search/repositories")) {
      return Response.json({
        total_count: 40,
        items: [
          { full_name: "other/description-match", html_url: "https://github.com/other/description-match", owner: { login: "other" }, description: "Using ID-ME.AI for identity", stargazers_count: 3 },
          { full_name: "other/readme-match", html_url: "https://github.com/other/readme-match", owner: { login: "other" }, description: "No mention here", stargazers_count: 2 },
          { full_name: "other/false-positive", html_url: "https://github.com/other/false-positive", owner: { login: "other" }, description: "No mention here either", stargazers_count: 1 },
          { full_name: "own/private-project", html_url: "https://github.com/own/private-project", owner: { login: "own" }, description: "ID-ME.AI", stargazers_count: 1 },
        ],
      });
    }
    if (url.includes("api.github.com/repos/other/")) {
      readmes.push(url);
      return new Response(url.includes("readme-match") ? "This README mentions id-me.ai." : "No literal mention.", { status: 200 });
    }
    if (url.includes("reddit.com")) return Response.json({ data: { children: [] } });
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const result = await mentions({ MENTION_QUERY: "id-me.ai", GITHUB_REPO: "own/igl" });
    assert.deepEqual(result.githubRepos, {
      verifiedCount: 2,
      checkedCount: 3,
      searchTotal: 40,
      items: [
        { name: "other/description-match", url: "https://github.com/other/description-match", stars: 3, description: "Using ID-ME.AI for identity" },
        { name: "other/readme-match", url: "https://github.com/other/readme-match", stars: 2, description: "No mention here" },
      ],
    });
    assert.equal(readmes.length, 2);
    assert(readmes.some((url) => url.includes("readme-match")));
    assert(readmes.some((url) => url.includes("false-positive")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

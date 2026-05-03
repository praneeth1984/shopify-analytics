import { describe, expect, it } from "vitest";
import { parseUTM } from "../utm-parse.js";

describe("parseUTM", () => {
  it("marks direct when no UTM and no referrer", () => {
    expect(parseUTM(null, null).channel).toBe("direct");
  });

  it("classifies paid CPC", () => {
    const r = parseUTM("/landing?utm_source=google&utm_medium=cpc&utm_campaign=spring", null);
    expect(r.channel).toBe("paid");
    expect(r.utmSource).toBe("google");
    expect(r.utmCampaign).toBe("spring");
  });

  it("classifies email medium", () => {
    const r = parseUTM("/page?utm_source=klaviyo&utm_medium=email", null);
    expect(r.channel).toBe("email");
  });

  it("classifies social source", () => {
    const r = parseUTM("/page?utm_source=instagram&utm_medium=story", null);
    expect(r.channel).toBe("social");
  });

  it("classifies social by referrer domain when no UTM", () => {
    const r = parseUTM(null, "https://www.facebook.com/ads");
    expect(r.channel).toBe("social");
    expect(r.referrer).toBe("facebook.com");
  });

  it("classifies referral when unknown referrer and no UTM", () => {
    const r = parseUTM(null, "https://myblog.com/post");
    expect(r.channel).toBe("referral");
    expect(r.referrer).toBe("myblog.com");
  });

  it("handles organic (UTM present but not paid/email/social)", () => {
    const r = parseUTM("/page?utm_source=google&utm_medium=organic", null);
    expect(r.channel).toBe("organic");
  });

  it("handles absolute landing page URL", () => {
    const r = parseUTM("https://shop.example.com/landing?utm_source=fb&utm_medium=paid", null);
    expect(r.channel).toBe("paid");
  });

  it("returns null fields when nothing present", () => {
    const r = parseUTM("/simple-page", null);
    expect(r.utmSource).toBeNull();
    expect(r.utmMedium).toBeNull();
    expect(r.utmCampaign).toBeNull();
    expect(r.channel).toBe("direct");
  });
});

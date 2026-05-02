/**
 * F01 — Geographic Analytics aggregator.
 *
 * Converts raw order data (with shippingAddress) into:
 *   - clusters: pre-aggregated heat-map points (one per country on Free,
 *     one per 0.1° grid cell on Pro)
 *   - regions: hierarchical country → province → city table rows
 *   - no-location summary for orders missing a shipping address
 *
 * Privacy guarantee: individual order coordinates are never returned.
 * Cluster radius = country centroid on Free, 0.1° (~11 km) on Pro.
 */

import type { GeoOrderNode } from "./queries.js";
import type { GeoCluster, GeographyClusterPrecision, Money, RegionRow } from "@fbc/shared";
import type { Plan } from "@fbc/shared";
import { getCountryCentroid } from "../data/country-centroids.js";

type CountryAccum = {
  country_code: string;
  country_name: string;
  orders: number;
  revenue_minor: bigint;
  currency_code: string;
  unique_customer_ids: Set<string>;
  provinces: Map<string, ProvinceAccum>;
};

type ProvinceAccum = {
  province: string;
  orders: number;
  revenue_minor: bigint;
  currency_code: string;
  unique_customer_ids: Set<string>;
  cities: Map<string, CityAccum>;
};

type CityAccum = {
  city: string;
  orders: number;
  revenue_minor: bigint;
  currency_code: string;
  unique_customer_ids: Set<string>;
};

type ClusterKey = string;

type ClusterAccum = {
  lat: number;
  lng: number;
  orders: number;
  revenue_minor: bigint;
  currency_code: string;
};

/** Parse a decimal amount string into integer minor units (× 100). */
function toMinorUnits(amount: string): bigint {
  // Shopify returns amounts like "12.50", "0.00", "1234.99"
  const parts = amount.split(".");
  const whole = parts[0] ?? "0";
  const frac = (parts[1] ?? "").padEnd(2, "0").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(frac);
}

function minorToMoney(minor: bigint, currency_code: string): Money {
  const abs = minor < 0n ? -minor : minor;
  const sign = minor < 0n ? "-" : "";
  const whole = abs / 100n;
  const cents = abs % 100n;
  return {
    amount: `${sign}${whole}.${String(cents).padStart(2, "0")}`,
    currency_code,
  };
}


export type GeographyData = {
  clusters: GeoCluster[];
  regions: RegionRow[];
  no_location_count: number;
  no_location_revenue: Money | null;
  cluster_precision: GeographyClusterPrecision;
};


function snapToGrid(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.round(lat * 10) / 10,
    lng: Math.round(lng * 10) / 10,
  };
}

export function computeGeography(orders: GeoOrderNode[], plan: Plan): GeographyData {
  const isPro = plan === "pro" || plan === "insights";

  const countries = new Map<string, CountryAccum>();
  const clusters = new Map<ClusterKey, ClusterAccum>();

  let noLocationCount = 0;
  let noLocationRevenue = 0n;
  let currencyCode = "USD";

  for (const order of orders) {
    const revMinor = toMinorUnits(order.totalPriceSet.shopMoney.amount);
    currencyCode = order.totalPriceSet.shopMoney.currencyCode;
    const customerId = order.customer?.id ?? null;

    const addr = order.shippingAddress;
    const rawCountryCode = addr?.countryCode;
    if (!addr || !rawCountryCode) {
      noLocationCount += 1;
      noLocationRevenue += revMinor;
      continue;
    }

    const cc = rawCountryCode.toUpperCase();
    const centroid = getCountryCentroid(cc);

    // --- Cluster ---
    let clat: number;
    let clng: number;
    let clusterKey: string;

    if (isPro && addr.latitude != null && addr.longitude != null) {
      const snapped = snapToGrid(addr.latitude, addr.longitude);
      clat = snapped.lat;
      clng = snapped.lng;
      clusterKey = `${clat},${clng}`;
    } else {
      clat = centroid.lat;
      clng = centroid.lng;
      clusterKey = cc;
    }

    const existing = clusters.get(clusterKey);
    if (existing) {
      existing.orders += 1;
      existing.revenue_minor += revMinor;
    } else {
      clusters.set(clusterKey, {
        lat: clat,
        lng: clng,
        orders: 1,
        revenue_minor: revMinor,
        currency_code: currencyCode,
      });
    }

    // --- Region table ---
    let countryAccum = countries.get(cc);
    if (!countryAccum) {
      countryAccum = {
        country_code: cc,
        country_name: centroid.name,
        orders: 0,
        revenue_minor: 0n,
        currency_code: currencyCode,
        unique_customer_ids: new Set(),
        provinces: new Map(),
      };
      countries.set(cc, countryAccum);
    }
    countryAccum.orders += 1;
    countryAccum.revenue_minor += revMinor;
    if (customerId) countryAccum.unique_customer_ids.add(customerId);

    // Province breakdown
    const provinceKey = addr.province ?? "";
    let provinceAccum = countryAccum.provinces.get(provinceKey);
    if (!provinceAccum) {
      provinceAccum = {
        province: addr.province ?? "",
        orders: 0,
        revenue_minor: 0n,
        currency_code: currencyCode,
        unique_customer_ids: new Set(),
        cities: new Map(),
      };
      countryAccum.provinces.set(provinceKey, provinceAccum);
    }
    provinceAccum.orders += 1;
    provinceAccum.revenue_minor += revMinor;
    if (customerId) provinceAccum.unique_customer_ids.add(customerId);

    // City breakdown (Pro only — Free still accumulates but we'll filter on output)
    const cityKey = addr.city ?? "";
    let cityAccum = provinceAccum.cities.get(cityKey);
    if (!cityAccum) {
      cityAccum = {
        city: addr.city ?? "",
        orders: 0,
        revenue_minor: 0n,
        currency_code: currencyCode,
        unique_customer_ids: new Set(),
      };
      provinceAccum.cities.set(cityKey, cityAccum);
    }
    cityAccum.orders += 1;
    cityAccum.revenue_minor += revMinor;
    if (customerId) cityAccum.unique_customer_ids.add(customerId);
  }

  // Total revenue for pct calculation
  let totalRevenue = 0n;
  for (const c of countries.values()) totalRevenue += c.revenue_minor;

  // Build sorted regions array
  const regions: RegionRow[] = [];

  const sortedCountries = [...countries.values()].sort(
    (a, b) => Number(b.revenue_minor - a.revenue_minor),
  );

  for (const country of sortedCountries) {
    const countryRevenueMoney = minorToMoney(country.revenue_minor, country.currency_code);
    const countryAovMinor =
      country.orders > 0 ? country.revenue_minor / BigInt(country.orders) : 0n;

    regions.push({
      country_code: country.country_code,
      country_name: country.country_name,
      province: null,
      city: null,
      orders: country.orders,
      revenue: countryRevenueMoney,
      aov: minorToMoney(countryAovMinor, country.currency_code),
      revenue_pct: totalRevenue > 0n ? Number(country.revenue_minor * 10000n / totalRevenue) / 10000 : 0,
      unique_customers: country.unique_customer_ids.size,
    });

    const sortedProvinces = [...country.provinces.values()].sort(
      (a, b) => Number(b.revenue_minor - a.revenue_minor),
    );

    for (const province of sortedProvinces) {
      if (!province.province) continue; // skip blank province bucket
      const provRevMoney = minorToMoney(province.revenue_minor, province.currency_code);
      const provAovMinor =
        province.orders > 0 ? province.revenue_minor / BigInt(province.orders) : 0n;

      regions.push({
        country_code: country.country_code,
        country_name: country.country_name,
        province: province.province,
        city: null,
        orders: province.orders,
        revenue: provRevMoney,
        aov: minorToMoney(provAovMinor, province.currency_code),
        revenue_pct: totalRevenue > 0n ? Number(province.revenue_minor * 10000n / totalRevenue) / 10000 : 0,
        unique_customers: province.unique_customer_ids.size,
      });

      if (isPro) {
        const sortedCities = [...province.cities.values()].sort(
          (a, b) => Number(b.revenue_minor - a.revenue_minor),
        );
        for (const city of sortedCities) {
          if (!city.city) continue;
          const cityRevMoney = minorToMoney(city.revenue_minor, city.currency_code);
          const cityAovMinor =
            city.orders > 0 ? city.revenue_minor / BigInt(city.orders) : 0n;

          regions.push({
            country_code: country.country_code,
            country_name: country.country_name,
            province: province.province,
            city: city.city,
            orders: city.orders,
            revenue: cityRevMoney,
            aov: minorToMoney(cityAovMinor, city.currency_code),
            revenue_pct: totalRevenue > 0n ? Number(city.revenue_minor * 10000n / totalRevenue) / 10000 : 0,
            unique_customers: city.unique_customer_ids.size,
          });
        }
      }
    }
  }

  // Build cluster output
  const clusterOutput: GeoCluster[] = [...clusters.values()].map((c) => ({
    lat: c.lat,
    lng: c.lng,
    orders: c.orders,
    revenue_minor: Number(c.revenue_minor),
    currency_code: c.currency_code,
  }));

  return {
    clusters: clusterOutput,
    regions,
    no_location_count: noLocationCount,
    no_location_revenue:
      noLocationCount > 0 ? minorToMoney(noLocationRevenue, currencyCode) : null,
    cluster_precision: isPro ? "grid_0.1deg" : "country",
  };
}

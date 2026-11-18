import "server-only";
import type { LatLng } from "@/lib/geo";
import {
  summarizeTransit,
  summarizeWalk,
  type TransitSummary,
  type WalkSummary,
} from "@/lib/leg-display";

// Google Places API (New) Place Details 와 Routes API computeRoutes 호출.
// 서버 키는 머리글로만 보내고, 로그에는 태그·동작·HTTP 상태·Google 의 error.status 만 남긴다.

const PLACES_URL = "https://places.googleapis.com/v1/places";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 5000;

const TRANSIT_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.polyline.encodedPolyline",
  "routes.legs.steps.transitDetails.transitLine.nameShort",
  "routes.legs.steps.transitDetails.transitLine.name",
  "routes.legs.steps.transitDetails.transitLine.vehicle.type",
].join(",");
const WALK_FIELD_MASK = "routes.duration,routes.polyline.encodedPolyline";

type Result = { ok: true; body: unknown } | { ok: false; status: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function serverKey(): string | null {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  return key ? key : null;
}

// Google 오류 본문의 error.status("NOT_FOUND" 등)만 꺼낸다. 본문 전체는 쓰지 않는다.
function errorStatus(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const s = body.error.status;
  return typeof s === "string" ? s : null;
}

async function call(
  tag: "places" | "routes",
  operation: string,
  key: string,
  url: string,
  fieldMask: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<(Result & { googleStatus?: string | null }) | null> {
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fieldMask,
        ...(init.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const gs = errorStatus(body);
      console.error(
        `[${tag}] ${operation}: HTTP ${res.status}${gs ? ` ${gs}` : ""}`,
      );
      return { ok: false, status: res.status, googleStatus: gs };
    }
    return { ok: true, body };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    console.error(`[${tag}] ${operation}: 요청 실패 ${name}`);
    return null;
  }
}

function placeUrl(googlePlaceId: string): string {
  return `${PLACES_URL}/${encodeURIComponent(googlePlaceId)}`;
}

export async function fetchPlaceCoords(
  googlePlaceId: string,
): Promise<
  { ok: true; lat: number; lng: number } | { ok: false; notFound: boolean }
> {
  const key = serverKey();
  if (!key) return { ok: false, notFound: false };
  const res = await call(
    "places",
    "coords",
    key,
    placeUrl(googlePlaceId),
    "location",
    { method: "GET" },
  );
  if (!res) return { ok: false, notFound: false };
  if (!res.ok) {
    return {
      ok: false,
      notFound: res.status === 404 || res.googleStatus === "NOT_FOUND",
    };
  }
  const loc = isRecord(res.body) ? res.body.location : null;
  if (
    isRecord(loc) &&
    typeof loc.latitude === "number" &&
    typeof loc.longitude === "number" &&
    Number.isFinite(loc.latitude) &&
    Number.isFinite(loc.longitude)
  ) {
    return { ok: true, lat: loc.latitude, lng: loc.longitude };
  }
  console.error("[places] coords: 응답 형식 오류");
  return { ok: false, notFound: false };
}

// 나라 코드와 시간대. 어떤 실패든 null 이다(호출한 쪽은 안내와 시간 계산을 건너뛴다).
export async function fetchPlaceRegion(
  googlePlaceId: string,
): Promise<{ countryCode: string | null; timeZone: string | null } | null> {
  const key = serverKey();
  if (!key) return null;
  const res = await call(
    "places",
    "region",
    key,
    placeUrl(googlePlaceId),
    "addressComponents,timeZone",
    { method: "GET" },
  );
  if (!res || !res.ok || !isRecord(res.body)) return null;

  let countryCode: string | null = null;
  if (Array.isArray(res.body.addressComponents)) {
    for (const c of res.body.addressComponents) {
      if (
        isRecord(c) &&
        Array.isArray(c.types) &&
        c.types.includes("country") &&
        typeof c.shortText === "string" &&
        c.shortText !== ""
      ) {
        countryCode = c.shortText;
        break;
      }
    }
  }
  const tz = res.body.timeZone;
  const timeZone =
    isRecord(tz) && typeof tz.id === "string" && tz.id !== "" ? tz.id : null;
  return { countryCode, timeZone };
}

function waypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

export async function fetchTransit(
  from: LatLng,
  to: LatLng,
  at: { kind: "arrival" | "departure"; instant: Date } | null,
): Promise<{ ok: true; summary: TransitSummary | null } | { ok: false }> {
  const key = serverKey();
  if (!key) return { ok: false };
  const body: Record<string, unknown> = {
    origin: waypoint(from),
    destination: waypoint(to),
    travelMode: "TRANSIT",
    languageCode: "ko",
  };
  if (at) {
    body[at.kind === "arrival" ? "arrivalTime" : "departureTime"] =
      at.instant.toISOString();
  }
  const res = await call(
    "routes",
    "transit",
    key,
    ROUTES_URL,
    TRANSIT_FIELD_MASK,
    { method: "POST", body },
  );
  if (!res || !res.ok) return { ok: false };
  return { ok: true, summary: summarizeTransit(res.body) };
}

export async function fetchWalk(
  from: LatLng,
  to: LatLng,
): Promise<{ ok: true; summary: WalkSummary | null } | { ok: false }> {
  const key = serverKey();
  if (!key) return { ok: false };
  const res = await call("routes", "walk", key, ROUTES_URL, WALK_FIELD_MASK, {
    method: "POST",
    body: {
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: "WALK",
      languageCode: "ko",
    },
  });
  if (!res || !res.ok) return { ok: false };
  return { ok: true, summary: summarizeWalk(res.body) };
}

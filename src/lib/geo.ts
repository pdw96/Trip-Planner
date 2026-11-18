// 순수 모듈: 좌표 거리 계산·표기·가까운 순 정렬. import 하지 않는다(node --test 로 시험).

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

// 하버사인 공식으로 두 좌표 사이의 대원 거리(미터)를 구한다.
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 1000 m 미만은 "850m", 그 이상은 "3.4km", 100 km 이상은 "123km".
export function formatDistance(meters: number): string {
  const rounded = Math.round(meters);
  if (rounded < 1000) return `${rounded}m`;
  const tenthsOfKm = Math.round(meters / 100);
  if (tenthsOfKm >= 1000) return `${Math.round(meters / 1000)}km`;
  return `${(tenthsOfKm / 10).toFixed(1)}km`;
}

// 좌표가 있는 항목은 가까운 순으로, 없는 항목은 원래 순서대로 맨 뒤에 둔다(meters: null).
export function sortByDistance<
  T extends { lat: number | null; lng: number | null },
>(items: T[], from: LatLng): { item: T; meters: number | null }[] {
  const located: { item: T; meters: number | null }[] = [];
  const unlocated: { item: T; meters: number | null }[] = [];
  for (const item of items) {
    if (item.lat === null || item.lng === null) {
      unlocated.push({ item, meters: null });
    } else {
      located.push({
        item,
        meters: distanceMeters(from, { lat: item.lat, lng: item.lng }),
      });
    }
  }
  located.sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0));
  return [...located, ...unlocated];
}

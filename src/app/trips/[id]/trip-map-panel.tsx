"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatDistance, sortByDistance } from "@/lib/geo";
import { directionsUrl, legText } from "@/lib/leg-display";
import type { DayRouteResult } from "../day-route-loader";
import { SAVE_FAILED } from "../messages";
import { setTripBaseAction } from "../place-actions";
import { inputClass } from "../styles";
import { DayLegs, type LegRow } from "./day-legs";
import {
  CATEGORY_ICONS,
  circled,
  lodgingFirst,
  type PanelDay,
  type PanelPlace,
} from "./map-types";
import { PlaceAddForm } from "./place-add-form";
import { PlaceRow } from "./place-row";
import { type MapLine, type MapPin, TripMapCanvas } from "./trip-map-canvas";

// 여행 화면의 지도 칸과 "가 볼 곳"(§5.1). 탭([전체] + N일차), 기준점, 구간 목록, 장소 목록을 묶는다.
// 데이터는 map-section(서버)이 준비한다. 구간 이동 정보는 N일차 탭을 열 때만 Route Handler(./day-route)로 묻고
// ([전체]·열지 않은 날은 묻지 않는다, §5.3), 기다리는 동안 서버가 넘긴 동선으로 직선 거리와 점선을 보인다.
// Server Action 으로 묻지 않는 까닭: Server Action 은 하나씩 차례로 보내져 저장이 Google 응답을 기다린다(#39).

type Maps = { browserKey: string; mapId: string };

type Props = {
  tripId: string;
  places: PanelPlace[];
  days: PanelDay[];
  // "all" 또는 날짜.
  initialTab: string;
  overviewBaseIds: string[];
  defaultOverviewBaseId: string | null;
  // 없으면 지도·장소 검색 대신 "지도를 쓸 수 없어요"(§3.3).
  maps: Maps | null;
};

const ERROR_VISIBLE_MS = 4000;
const EMPTY_ROUTE: DayRouteResult = { ok: true, legs: [], notices: [] };

// N일차 기준점으로 고른 값. 저장 중이거나, 저장됐지만 서버가 새로 그린 값이 아직 오지 않은 동안 이 값을 보인다.
type BaseChoice = { value: string | null; saving: boolean };

export function TripMapPanel(props: Props) {
  const body = <PanelBody {...props} />;
  if (!props.maps) return body;
  return (
    <APIProvider apiKey={props.maps.browserKey} language="ko">
      {body}
    </APIProvider>
  );
}

function PanelBody({
  tripId,
  places,
  days,
  initialTab,
  overviewBaseIds,
  defaultOverviewBaseId,
  maps,
}: Props) {
  const [tab, setTab] = useState(initialTab);
  const [overviewBaseId, setOverviewBaseId] = useState(defaultOverviewBaseId);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ placeId: string; seq: number } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  // 날짜별로 고른 기준점. 고르기 칸은 탭마다 새로 그려지므로(key) 고른 값은 여기 둔다(#39).
  const [baseChoices, setBaseChoices] = useState<Record<string, BaseChoice>>(
    {},
  );
  const [baseError, setBaseError] = useState<{ date: string } | null>(null);

  // 화면을 떠날 때 열린 고치기 칸과 강조를 닫는다(Activity 보관, docs/status.md).
  useLayoutEffect(
    () => () => {
      setEditingId(null);
      setHighlightedId(null);
    },
    [],
  );

  const placesById = useMemo(
    () => new Map(places.map((p) => [p.id, p])),
    [places],
  );
  // 저장이 끝난 고른 값은 서버 값이 따라오면 내려놓는다. 그 날이 없어졌거나 고른 장소가 지워졌어도 내려놓는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 서버 값이 저장보다 먼저 와도 저장이 끝난 뒤 다시 보도록 baseChoices 도 지켜본다
  useEffect(() => {
    setBaseChoices((prev) => {
      let next: Record<string, BaseChoice> | null = null;
      for (const [date, choice] of Object.entries(prev)) {
        if (choice.saving) continue;
        const serverBase = days.find((d) => d.date === date)?.baseId;
        const placeGone =
          choice.value !== null && !placesById.has(choice.value);
        if (
          serverBase === undefined ||
          serverBase === choice.value ||
          placeGone
        ) {
          next ??= { ...prev };
          delete next[date];
        }
      }
      return next ?? prev;
    });
  }, [days, placesById, baseChoices]);

  useEffect(() => {
    if (!baseError) return;
    const timer = setTimeout(() => setBaseError(null), ERROR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [baseError]);

  // 바꾸면 바로 보이고 저장한다. 실패하면 서버 값으로 돌아가고 문구를 보인다.
  // 저장되면 화면이 새로 그려지고, 동선 모양이 바뀌었으면 useDayRoute 가 구간 정보를 다시 묻는다.
  async function chooseBase(date: string, value: string | null) {
    setBaseError(null);
    setBaseChoices((prev) => ({ ...prev, [date]: { value, saving: true } }));
    const ok = await setTripBaseAction(tripId, date, value).then(
      (result) => result.ok,
      () => false,
    );
    setBaseChoices((prev) => {
      const next = { ...prev };
      if (ok) next[date] = { value, saving: false };
      else delete next[date];
      return next;
    });
    if (!ok) setBaseError({ date });
  }

  // 여행 날짜가 바뀌어 열린 날이 사라졌으면 [전체]로 본다.
  const day = tab === "all" ? null : (days.find((d) => d.date === tab) ?? null);
  const { result: routeResult, reload } = useDayRoute(tripId, day);

  function selectTab(next: string) {
    setHighlightedId(null);
    if (next === tab) {
      // 같은 탭을 다시 열면 다시 묻는다(구간 정보는 저장하지 않는다, §3.2).
      if (next !== "all") reload();
      return;
    }
    setTab(next);
  }

  // [전체] 보기의 기준점(저장하지 않는 화면 상태). 후보에서 사라졌으면(장소 삭제) 없음으로 본다.
  const overviewBase =
    overviewBaseId !== null && overviewBaseIds.includes(overviewBaseId)
      ? (placesById.get(overviewBaseId) ?? null)
      : null;
  const overviewBaseCoords =
    overviewBase && overviewBase.lat !== null && overviewBase.lng !== null
      ? { lat: overviewBase.lat, lng: overviewBase.lng }
      : null;

  const view = day
    ? dayView(day, placesById, routeResult)
    : overviewView(places, overviewBase?.id ?? null, overviewBaseCoords);
  // 이 날 보기에 핀이 없는 장소(다른 날·일정에 없는 장소)는 [전체]로 바꿔 그 핀을 보인다. [전체]는 구간을 묻지 않는다.
  // 포커스는 탭이 바뀐 다음 그려질 때 FocusPin 이 새 핀으로 적용한다. 좌표가 없으면 보일 것이 없으므로 탭은 그대로 둔다.
  function showOnMap(placeId: string) {
    if (
      day &&
      !view.pins.some((p) => p.placeId === placeId) &&
      positionOf(placesById.get(placeId)) !== null
    ) {
      setTab("all");
    }
    setHighlightedId(placeId);
    setFocus((f) => ({ placeId, seq: (f?.seq ?? 0) + 1 }));
  }

  const fitKey = `${tab}|${view.pins.map((p) => p.key).join(",")}`;

  // 전체 보기에서 기준점이 있으면 가까운 순과 거리, 아니면 넣은 순서.
  const listed: { place: PanelPlace; distance: string | null }[] =
    !day && overviewBase && overviewBaseCoords
      ? sortByDistance(places, overviewBaseCoords).map(({ item, meters }) => ({
          place: item,
          distance:
            item.id === overviewBase.id
              ? "기준점"
              : meters === null
                ? null
                : formatDistance(meters),
        }))
      : places.map((place) => ({ place, distance: null }));

  return (
    <>
      <section aria-labelledby="map-heading" className="flex flex-col gap-4">
        <h2 id="map-heading" className="text-xl font-semibold">
          지도
        </h2>
        <DayTabs
          days={days}
          selected={day?.date ?? "all"}
          onSelect={selectTab}
        />
        {maps ? (
          <div className="flex flex-col gap-2">
            <TripMapCanvas
              mapId={maps.mapId}
              pins={view.pins}
              lines={view.lines}
              fitKey={fitKey}
              highlightedId={highlightedId}
              focus={focus}
              onPinClick={setHighlightedId}
            />
            <GoogleTermsLine />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">지도를 쓸 수 없어요.</p>
        )}
        {day ? (
          <div className="flex flex-col gap-3">
            {places.length > 0 && (
              <DayBasePicker
                key={day.date}
                day={day}
                places={places}
                value={
                  baseChoices[day.date]
                    ? baseChoices[day.date].value
                    : day.baseId
                }
                saving={baseChoices[day.date]?.saving ?? false}
                error={baseError?.date === day.date ? SAVE_FAILED : null}
                onChange={(value) => void chooseBase(day.date, value)}
              />
            )}
            {/* 위치 정보 문구는 좌표가 없어 빠진 장소가 있을 때만. 기준점만 이어진 날도 번호 장소가 없으므로
                아래 문구가 보인다(지도에는 기준점이 보인다). */}
            {day.stops.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {day.unlocatedCount > 0
                  ? "고른 장소의 위치 정보가 없어요"
                  : "이 날 일정에 고른 장소가 없어요"}
              </p>
            ) : (
              <DayLegs
                rows={legRows(day, placesById, routeResult)}
                notices={routeResult?.ok ? routeResult.notices : []}
              />
            )}
          </div>
        ) : (
          overviewBaseIds.length > 0 && (
            <OverviewBasePicker
              candidates={lodgingFirst(
                overviewBaseIds
                  .map((id) => placesById.get(id))
                  .filter((p): p is PanelPlace => p !== undefined),
              )}
              value={overviewBase?.id ?? null}
              onChange={setOverviewBaseId}
            />
          )
        )}
      </section>

      <section aria-labelledby="places-heading" className="flex flex-col gap-4">
        <h2 id="places-heading" className="text-xl font-semibold">
          가 볼 곳
        </h2>
        {maps && <PlaceAddForm tripId={tripId} />}
        {listed.length > 0 ? (
          <ul className="flex flex-col">
            {listed.map(({ place, distance }) => (
              <PlaceRow
                key={place.id}
                tripId={tripId}
                place={place}
                highlighted={place.id === highlightedId}
                distance={distance}
                editing={editingId === place.id}
                onEdit={() => setEditingId(place.id)}
                onCloseEdit={() =>
                  setEditingId((current) =>
                    current === place.id ? null : current,
                  )
                }
                onShowOnMap={maps ? () => showOnMap(place.id) : null}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">아직 넣은 장소가 없어요</p>
        )}
      </section>
    </>
  );
}

// --- 구간 이동 정보 묻기 ---

type RouteState = { date: string; signature: string; result: DayRouteResult };

// 그날 동선의 모양(기준점·장소 순서)과 구간 시각. 바뀌면(일정·기준점을 고친 뒤 새로 그려지면) 다시 묻는다.
function routeSignature(day: PanelDay): string {
  return `${day.routeBaseId}|${day.legs.map((l) => `${l.fromId}>${l.toId}@${l.timing}`).join(",")}`;
}

// 연결이 끊기거나 서버가 실패(401·404·500)를 돌려줘도 화면을 깨지 않고 "불러오지 못했어요"로 둔다.
async function fetchDayRoute(
  tripId: string,
  date: string,
  signal: AbortSignal,
): Promise<DayRouteResult> {
  try {
    const response = await fetch(
      `/trips/${encodeURIComponent(tripId)}/day-route?date=${encodeURIComponent(date)}`,
      { cache: "no-store", signal },
    );
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as DayRouteResult;
    return body?.ok === true &&
      Array.isArray(body.legs) &&
      Array.isArray(body.notices)
      ? body
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

// N일차 탭이 열려 있을 때만 묻는다. 결과는 화면 상태로만 두고 저장하지 않는다.
// result 가 null 이면 기다리는 중이다.
function useDayRoute(
  tripId: string,
  day: PanelDay | null,
): { result: DayRouteResult | null; reload: () => void } {
  const [route, setRoute] = useState<RouteState | null>(null);
  // 마지막으로 보낸 요청. 늦게 온 이전 요청의 결과는 버린다.
  const requestRef = useRef<{
    date: string;
    signature: string;
    seq: number;
  } | null>(null);
  const seqRef = useRef(0);
  // 아직 답이 오지 않은 요청. 새로 묻거나 탭을 바꾸거나 화면을 떠나면 끊는다.
  const inFlightRef = useRef<AbortController | null>(null);

  const date = day?.date ?? null;
  const signature = day ? routeSignature(day) : "";
  const hasLegs = (day?.legs.length ?? 0) > 0;

  function load(date: string, signature: string) {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    const seq = ++seqRef.current;
    requestRef.current = { date, signature, seq };
    setRoute(null);
    void fetchDayRoute(tripId, date, controller.signal).then((result) => {
      if (controller.signal.aborted || requestRef.current?.seq !== seq) return;
      inFlightRef.current = null;
      setRoute({ date, signature, result });
    });
  }

  // 탭을 열 때(처음 열린 오늘 탭 포함), 그리고 열린 날의 동선이 바뀌었을 때. 구간이 없는 날은 묻지 않는다.
  // 화면을 떠났다 돌아와 effect 가 다시 돌아도, 같은 날·같은 동선을 이미 받아 두었으면 다시 묻지 않는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 날짜·동선이 바뀔 때만 묻는다(load 는 매 렌더 새 함수)
  useEffect(() => {
    if (date === null || !hasLegs) {
      requestRef.current = null;
      return;
    }
    const current = requestRef.current;
    if (!current || current.date !== date || current.signature !== signature) {
      load(date, signature);
    }
    return () => {
      // 탭을 바꾸거나 화면을 떠나면 답을 기다리던 요청을 끊고, 돌아왔을 때 다시 묻도록 기록을 지운다.
      if (inFlightRef.current) {
        inFlightRef.current.abort();
        inFlightRef.current = null;
        requestRef.current = null;
      }
    };
  }, [date, signature, hasLegs]);

  let result: DayRouteResult | null = null;
  if (day && !hasLegs) {
    result = EMPTY_ROUTE;
  } else if (route && route.date === date && route.signature === signature) {
    result = route.result;
  }

  return {
    result,
    reload: () => {
      if (date !== null && hasLegs) load(date, signature);
    },
  };
}

// --- 보기 만들기 ---

function positionOf(place: PanelPlace | undefined) {
  return place && place.lat !== null && place.lng !== null
    ? { lat: place.lat, lng: place.lng }
    : null;
}

// 서버가 준 구간 결과 중 이 뼈대 구간과 같은 장소 쌍인 것(동선이 그 사이 바뀌었으면 없음).
function matchedLeg(
  result: DayRouteResult | null,
  index: number,
  fromId: string,
  toId: string,
) {
  if (!result?.ok) return null;
  const leg = result.legs[index];
  return leg && leg.fromId === fromId && leg.toId === toId ? leg : null;
}

function dayView(
  day: PanelDay,
  placesById: Map<string, PanelPlace>,
  result: DayRouteResult | null,
): { pins: MapPin[]; lines: MapLine[] } {
  const pins: MapPin[] = [];
  const base = day.routeBaseId ? placesById.get(day.routeBaseId) : undefined;
  const basePosition = positionOf(base);
  if (base && basePosition) {
    pins.push({
      key: `base:${base.id}`,
      placeId: base.id,
      position: basePosition,
      text: CATEGORY_ICONS.lodging,
      kind: "base",
      title: `기준점: ${base.label}`,
    });
  }
  // 같은 장소를 두 번 들르면 핀 하나에 번호를 함께("1·3").
  const numbers = new Map<string, number[]>();
  for (const stop of day.stops) {
    numbers.set(stop.placeId, [
      ...(numbers.get(stop.placeId) ?? []),
      stop.number,
    ]);
  }
  for (const [placeId, nums] of numbers) {
    const place = placesById.get(placeId);
    const position = positionOf(place);
    if (!place || !position) continue;
    pins.push({
      key: `stop:${placeId}`,
      placeId,
      position,
      text: nums.join("·"),
      kind: "stop",
      title: `${nums.join("·")}. ${place.label}`,
    });
  }

  const lines: MapLine[] = [];
  day.legs.forEach((leg, i) => {
    const from = positionOf(placesById.get(leg.fromId));
    const to = positionOf(placesById.get(leg.toId));
    if (!from || !to) return;
    const server = matchedLeg(result, i, leg.fromId, leg.toId);
    const encodedPath =
      server?.result.kind === "transit"
        ? server.result.transit.polyline
        : server?.result.kind === "walk"
          ? server.result.walk.polyline
          : null;
    lines.push(
      encodedPath
        ? {
            key: `leg:${i}:route`,
            style: "route",
            path: [from, to],
            encodedPath,
          }
        : { key: `leg:${i}:straight`, style: "straight", path: [from, to] },
    );
  });
  return { pins, lines };
}

function overviewView(
  places: PanelPlace[],
  baseId: string | null,
  baseCoords: { lat: number; lng: number } | null,
): { pins: MapPin[]; lines: MapLine[] } {
  const pins: MapPin[] = [];
  const lines: MapLine[] = [];
  for (const place of places) {
    const position = positionOf(place);
    if (!position) continue;
    const isBase = place.id === baseId;
    pins.push({
      key: `place:${place.id}`,
      placeId: place.id,
      position,
      text: CATEGORY_ICONS[place.category],
      kind: isBase ? "base" : "place",
      title: isBase ? `기준점: ${place.label}` : place.label,
    });
    if (baseCoords && !isBase) {
      lines.push({
        key: `from-base:${place.id}`,
        style: "faint",
        path: [baseCoords, position],
      });
    }
  }
  return { pins, lines };
}

// 기준점은 🏨, 들르는 장소는 ①② 순서. 번호는 buildDayRoute 와 같이 기준점이 아닌 점을 차례로 센다.
function legRows(
  day: PanelDay,
  placesById: Map<string, PanelPlace>,
  result: DayRouteResult | null,
): LegRow[] {
  if (day.legs.length === 0) return [];
  const points = [
    { id: day.legs[0].fromId, isBase: day.legs[0].fromIsBase },
    ...day.legs.map((leg) => ({ id: leg.toId, isBase: leg.toIsBase })),
  ];
  let count = 0;
  const markers = points.map((p) => (p.isBase ? "🏨" : circled(++count)));

  const rows: LegRow[] = [];
  day.legs.forEach((leg, i) => {
    const from = placesById.get(leg.fromId);
    const to = placesById.get(leg.toId);
    if (!from || !to) return;
    let text: string | null;
    if (result === null) {
      text = null;
    } else if (!result.ok) {
      text = legText({ kind: "failed" });
    } else {
      // 서버가 본 동선이 그 사이 바뀌어 맞는 구간이 없으면 실패와 같게 보인다(빈칸으로 두지 않는다).
      text =
        matchedLeg(result, i, leg.fromId, leg.toId)?.text ??
        legText({ kind: "failed" });
    }
    rows.push({
      key: `${i}:${leg.fromId}>${leg.toId}`,
      fromMarker: markers[i],
      toMarker: markers[i + 1],
      toLabel: leg.toIsBase ? null : to.label,
      text,
      distanceText: leg.distanceText,
      directionsUrl: directionsUrl(from, to),
    });
  });
  return rows;
}

// --- 작은 조각 ---

function DayTabs({
  days,
  selected,
  onSelect,
}: {
  days: PanelDay[];
  selected: string;
  onSelect: (tab: string) => void;
}) {
  const tabs = [
    { value: "all", label: "전체", title: "모든 장소" },
    ...days.map((d) => ({
      value: d.date,
      label: `${d.dayNumber}일차`,
      title: d.label,
    })),
  ];
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const active = t.value === selected;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            aria-pressed={active}
            title={t.title}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-foreground text-background"
                : "border border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function GoogleTermsLine() {
  const linkClass = "underline hover:text-zinc-700 dark:hover:text-zinc-300";
  return (
    <p className="text-xs text-zinc-500">
      지도·장소·길찾기 정보: Google 지도 ·{" "}
      <a
        href="https://maps.google.com/help/terms_maps/"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Google 지도 추가 약관
      </a>{" "}
      ·{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Google 개인정보처리방침
      </a>
    </p>
  );
}

const selectClass = `${inputClass} w-auto max-w-full py-1.5 text-sm`;

// N일차 기준점. 고른 값·저장 중·실패 문구는 패널이 날짜별로 가진다(chooseBase).
function DayBasePicker({
  day,
  places,
  value,
  saving,
  error,
  onChange,
}: {
  day: PanelDay;
  places: PanelPlace[];
  value: string | null;
  saving: boolean;
  error: string | null;
  onChange: (placeId: string | null) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {day.dayNumber}일차 기준점
        </label>
        <select
          id={id}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={saving}
          className={selectClass}
        >
          <option value="">없음</option>
          {lodgingFirst(places).map((place) => (
            <option key={place.id} value={place.id}>
              {CATEGORY_ICONS[place.category]} {place.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">이 날부터 바뀌어요</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// [전체] 보기의 기준점. 저장하지 않는다(§5.5).
function OverviewBasePicker({
  candidates,
  value,
  onChange,
}: {
  candidates: PanelPlace[];
  value: string | null;
  onChange: (placeId: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        기준점
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className={selectClass}
      >
        <option value="">없음</option>
        {candidates.map((place) => (
          <option key={place.id} value={place.id}>
            {CATEGORY_ICONS[place.category]} {place.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-zinc-500">고르면 가까운 순으로 보여요</span>
    </div>
  );
}

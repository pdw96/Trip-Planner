"use client";

import {
  AdvancedMarker,
  ColorScheme,
  Map as GoogleMap,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

// 지도 그림만 맡는다: 핀(Advanced Marker), 선, 핀 맞추기. 무엇을 그릴지는 trip-map-panel 이 정한다.
// APIProvider 안에서만 쓴다(지도 ID 가 있어야 Advanced Marker 가 그려진다).

export type LatLngLiteral = { lat: number; lng: number };

export type MapPin = {
  key: string;
  placeId: string;
  position: LatLngLiteral;
  // 핀 안 글자: 번호("1", "1·3") 또는 종류 그림(🏨 등).
  text: string;
  kind: "base" | "stop" | "place";
  title: string;
};

// route: Google 경로 선(인코딩 폴리라인, 실선). straight: 직선 점선(직선 구간·실패·기다리는 중).
// faint: 전체 보기에서 기준점 → 각 장소의 옅은 직선.
export type MapLine = {
  key: string;
  style: "route" | "straight" | "faint";
  path: LatLngLiteral[];
  encodedPath?: string;
};

// 지도가 처음 보일 곳(핀이 없을 때). 서울 시청.
const FALLBACK_CENTER: LatLngLiteral = { lat: 37.5665, lng: 126.978 };
const SINGLE_PIN_ZOOM = 15;
const FIT_PADDING = 48;

const LINE_COLOR = "#2563eb";

const DASH_ICONS: google.maps.IconSequence[] = [
  {
    icon: {
      path: "M 0,-1 0,1",
      strokeOpacity: 0.9,
      strokeColor: LINE_COLOR,
      scale: 3,
    },
    offset: "0",
    repeat: "12px",
  },
];

export function TripMapCanvas({
  mapId,
  pins,
  lines,
  fitKey,
  highlightedId,
  focus,
  onPinClick,
}: {
  mapId: string;
  pins: MapPin[];
  lines: MapLine[];
  // 바뀌면 모든 핀이 들어오게 다시 맞춘다(탭 바꾸기, 핀 더하기·빼기).
  fitKey: string;
  highlightedId: string | null;
  // 목록에서 "지도에서 보기"를 누를 때마다 seq 가 바뀐다.
  focus: { placeId: string; seq: number } | null;
  onPinClick: (placeId: string) => void;
}) {
  return (
    <div className="h-[50vh] max-h-[480px] min-h-[240px] w-full overflow-hidden rounded-2xl">
      <GoogleMap
        mapId={mapId}
        // 지나온 화면에서 돌아올 때 지도를 새로 만들지 않는다(하루 지도 불러오기 한도, §3.3).
        reuseMaps
        defaultCenter={pins[0]?.position ?? FALLBACK_CENTER}
        defaultZoom={12}
        gestureHandling="cooperative"
        mapTypeControl={false}
        streetViewControl={false}
        clickableIcons={false}
        colorScheme={ColorScheme.FOLLOW_SYSTEM}
        style={{ width: "100%", height: "100%" }}
      >
        {lines.map((line) =>
          line.style === "route" && line.encodedPath ? (
            <Polyline
              key={line.key}
              encodedPath={line.encodedPath}
              strokeColor={LINE_COLOR}
              strokeOpacity={0.85}
              strokeWeight={5}
            />
          ) : line.style === "faint" ? (
            <Polyline
              key={line.key}
              path={line.path}
              strokeColor="#71717a"
              strokeOpacity={0.35}
              strokeWeight={2}
            />
          ) : (
            <Polyline
              key={line.key}
              path={line.path}
              strokeOpacity={0}
              icons={DASH_ICONS}
            />
          ),
        )}
        {pins.map((pin) => {
          const highlighted = pin.placeId === highlightedId;
          return (
            <AdvancedMarker
              key={pin.key}
              position={pin.position}
              title={pin.title}
              anchorLeft="-50%"
              anchorTop="-50%"
              zIndex={highlighted ? 1000 : pin.kind === "base" ? 500 : 1}
              onClick={() => onPinClick(pin.placeId)}
            >
              <PinBody pin={pin} highlighted={highlighted} />
            </AdvancedMarker>
          );
        })}
        <FitToPins pins={pins} fitKey={fitKey} />
        <FocusPin pins={pins} focus={focus} />
      </GoogleMap>
    </div>
  );
}

function PinBody({ pin, highlighted }: { pin: MapPin; highlighted: boolean }) {
  const ring = highlighted
    ? "ring-4 ring-amber-400 scale-125"
    : "ring-2 ring-white";
  if (pin.kind === "stop") {
    return (
      <span
        className={`flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-600 px-1.5 text-sm font-semibold text-white shadow ${ring}`}
      >
        {pin.text}
      </span>
    );
  }
  return (
    <span
      className={`flex size-8 items-center justify-center rounded-full bg-white text-base shadow ${ring}`}
    >
      {pin.text}
    </span>
  );
}

// fitKey 가 바뀔 때만 맞춘다. 강조·선 모양이 바뀔 때는 지도를 움직이지 않는다.
function FitToPins({ pins, fitKey }: { pins: MapPin[]; fitKey: string }) {
  const map = useMap();
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  // biome-ignore lint/correctness/useExhaustiveDependencies: fitKey 가 바뀔 때만 다시 맞춘다(핀은 ref 로 읽는다)
  useEffect(() => {
    if (!map) return;
    const positions = pinsRef.current.map((pin) => pin.position);
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setCenter(positions[0]);
      map.setZoom(SINGLE_PIN_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const position of positions) bounds.extend(position);
    map.fitBounds(bounds, FIT_PADDING);
  }, [map, fitKey]);

  return null;
}

function FocusPin({
  pins,
  focus,
}: {
  pins: MapPin[];
  focus: { placeId: string; seq: number } | null;
}) {
  const map = useMap();
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  useEffect(() => {
    if (!map || !focus) return;
    const pin = pinsRef.current.find((p) => p.placeId === focus.placeId);
    if (pin) map.panTo(pin.position);
  }, [map, focus]);

  return null;
}

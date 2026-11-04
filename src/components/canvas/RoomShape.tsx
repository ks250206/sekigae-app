/**
 * 1 部屋の描画: 床テクスチャ・部屋色のティント・障害物・壁（void 境界を自動トレース）・
 * 入口・席・名前タブ。部屋ローカル座標に translate した <g> を返す。
 *
 * - 形状（cells）が変わらない限り床・壁は再計算しない（RoomBase を memo）。
 * - 席は SeatGlyph（memo）で描くので、選択変更で再描画されるのは状態が変わった席だけ。
 * - 名前タブ（ヘッダー）は data-room-header 属性を持つので、利用側でドラッグ移動のハンドルにできる。
 */
import { memo, useMemo, type ReactNode } from "react";
import type { ID, Room, Seat } from "@/domain/schema";
import { readableText } from "@/graphics/palette";
import { defUrl, DEF } from "./defs";
import { useLod } from "./context";
import { DoorGlyph } from "./DoorGlyph";
import { cellsPath, fitText, floorPath, ROOM_HEADER, textWidth, wallPath } from "./geometry";
import { SeatGlyph, type SeatVisualState } from "./SeatGlyph";

export interface RoomShapeProps {
  room: Room;
  selected?: boolean;
  /** 外周を警告色で描く（重なりなど） */
  warning?: boolean;
  dimmed?: boolean;
  /** ヘッダーのカーソルを通常にする */
  readOnly?: boolean;
  /** 部屋範囲内の void を薄い斜線で示す（エディタ用） */
  showBounds?: boolean;
  /** ヘッダー右側の小さな表示（例: "12 席"） */
  badge?: string;
  /** ヘッダーに警告アイコンを出す（例: 入口なし） */
  alert?: boolean;
  /** 席ごとの表示状態 */
  seatStates?: ReadonlyMap<ID, SeatVisualState>;
  /** 席ごとのアクセント色（割当済みの役職色など） */
  seatAccents?: ReadonlyMap<ID, string>;
  /** 席の描画を差し替える（席配置画面のチップなど）。既定は SeatGlyph */
  renderSeat?: (seat: Seat, state: SeatVisualState | undefined) => ReactNode;
  /** 席を描かない（プレビュー用） */
  hideSeats?: ID[] | ReadonlySet<ID>;
  selectedEntranceIds?: ReadonlySet<ID>;
  /** 部屋ローカル座標で上に重ねる要素（ハンドル等） */
  children?: ReactNode;
}

export const RoomShape = memo(function RoomShape({
  room,
  selected,
  warning,
  dimmed,
  readOnly,
  showBounds,
  badge,
  alert,
  seatStates,
  seatAccents,
  renderSeat,
  hideSeats,
  selectedEntranceIds,
  children,
}: RoomShapeProps) {
  const lod = useLod();
  const hidden = hideSeats ? new Set(hideSeats) : null;
  return (
    <g
      className={dimmed ? "sk-room sk-room-dimmed" : "sk-room"}
      transform={`translate(${room.position.x} ${room.position.y})`}
      data-room-id={room.id}
      data-readonly={readOnly ? "true" : undefined}
    >
      <RoomBase
        width={room.width}
        height={room.height}
        cells={room.cells}
        color={room.color}
        showBounds={showBounds}
      />
      {room.entrances.map((e) => (
        <DoorGlyph
          key={e.id}
          x={e.x}
          y={e.y}
          side={e.side}
          entranceId={e.id}
          selected={selectedEntranceIds?.has(e.id)}
        />
      ))}
      <g data-layer="seats">
        {room.seats.map((s) => {
          if (hidden?.has(s.id)) return null;
          const st = seatStates?.get(s.id);
          if (renderSeat) return <g key={s.id}>{renderSeat(s, st)}</g>;
          return (
            <SeatGlyph
              key={s.id}
              seatId={s.id}
              x={s.x}
              y={s.y}
              facing={s.facing}
              label={s.label}
              accent={seatAccents?.get(s.id)}
              lod={lod}
              {...st}
            />
          );
        })}
      </g>
      {(selected || warning) && (
        <rect
          className={`sk-room-outline sk-px2 ${warning ? "sk-marching" : ""}`}
          x={-0.18}
          y={-ROOM_HEADER - 0.18}
          width={room.width + 0.36}
          height={room.height + ROOM_HEADER + 0.36}
          rx={0.3}
          fill="none"
          stroke={warning ? "var(--canvas-violation)" : "var(--canvas-selection)"}
          pointerEvents="none"
        />
      )}
      <RoomHeader
        roomId={room.id}
        name={room.name}
        color={room.color}
        width={room.width}
        badge={badge}
        alert={alert}
        selected={selected}
      />
      {lod === "far" && (
        <text
          className="sk-far-label"
          x={room.width / 2}
          y={room.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--canvas-label)"
        >
          {room.name}
        </text>
      )}
      {children}
    </g>
  );
});

/** 床・ティント・障害物・壁。形状が変わらない限り再描画しない */
const RoomBase = memo(function RoomBase({
  width,
  height,
  cells,
  color,
  showBounds,
}: {
  width: number;
  height: number;
  cells: Room["cells"];
  color: string;
  showBounds?: boolean;
}) {
  const paths = useMemo(() => {
    const r = { width, height, cells };
    return {
      floor: floorPath(r),
      obstacle: cellsPath(r, (k) => k === "obstacle"),
      voids: cellsPath(r, (k) => k === "void"),
      walls: wallPath(r),
      obstacles: cells
        .map((k, i) => (k === "obstacle" ? { x: i % width, y: Math.floor(i / width) } : null))
        .filter((p) => p !== null),
    };
  }, [width, height, cells]);
  return (
    <g>
      {showBounds && paths.voids && (
        <path d={paths.voids} fill={defUrl(DEF.void)} pointerEvents="none" />
      )}
      <path className="sk-room-floor" d={paths.floor} fill={defUrl(DEF.floor)} />
      <path d={paths.floor} fill={color} style={{ fillOpacity: "var(--sk-floor-tint)" }} />
      {paths.obstacles.map((p) => (
        <g key={`${p.x},${p.y}`}>
          <rect
            x={p.x + 0.04}
            y={p.y + 0.04}
            width={0.92}
            height={0.92}
            rx={0.08}
            fill={defUrl(DEF.hatch)}
            stroke="var(--sk-obstacle-edge)"
            strokeWidth={0.04}
          />
          <rect
            x={p.x + 0.04}
            y={p.y + 0.04}
            width={0.92}
            height={0.2}
            rx={0.08}
            fill="white"
            opacity={0.12}
          />
        </g>
      ))}
      <path
        d={paths.walls}
        fill="none"
        stroke="var(--canvas-wall)"
        strokeWidth={0.12}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </g>
  );
});

const RoomHeader = memo(function RoomHeader({
  roomId,
  name,
  color,
  width,
  badge,
  alert,
  selected,
}: {
  roomId: ID;
  name: string;
  color: string;
  width: number;
  badge?: string;
  alert?: boolean;
  selected?: boolean;
}) {
  const fg = readableText(color);
  const h = ROOM_HEADER;
  const r = 0.22;
  const fs = 0.4;
  const badgeW = badge ? textWidth(badge, 0.3) + 0.3 : 0;
  const alertW = alert ? 0.5 : 0;
  const nameW = Math.max(0.5, width - 0.5 - badgeW - alertW);
  return (
    <g className="sk-room-header" data-room-header={roomId} aria-label={name}>
      <path
        d={`M0 0V${-h + r}A${r} ${r} 0 0 1 ${r} ${-h}H${width - r}A${r} ${r} 0 0 1 ${width} ${-h + r}V0Z`}
        fill={color}
        stroke={selected ? "var(--canvas-selection)" : "none"}
        className="sk-px1-5"
      />
      <path d={`M0 ${-0.06}H${width}V0H0Z`} fill="black" opacity={0.15} />
      <text
        x={0.25}
        y={-h / 2}
        dominantBaseline="central"
        fontWeight={650}
        fill={fg}
        style={{ fontSize: `min(${fs}px, calc(var(--sk-u) * 15px))` }}
      >
        {fitText(name, nameW, fs)}
      </text>
      {badge && (
        <text
          x={width - 0.25}
          y={-h / 2}
          textAnchor="end"
          dominantBaseline="central"
          fontWeight={500}
          style={{ fontSize: "min(0.3px, calc(var(--sk-u) * 12px))" }}
          fill={fg}
          opacity={0.85}
        >
          {badge}
        </text>
      )}
      {alert && (
        <g transform={`translate(${width - 0.25 - badgeW - 0.22} ${-h / 2})`}>
          <path
            d="M0 -0.2L0.2 0.16H-0.2Z"
            fill="var(--canvas-floor)"
            stroke={fg}
            strokeWidth={0.03}
          />
          <path d="M0 -0.07V0.04M0 0.09V0.1" stroke="var(--canvas-violation)" strokeWidth={0.05} />
        </g>
      )}
    </g>
  );
});

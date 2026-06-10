import React from "react";
import { Door, WindowLayout } from "./types";

interface DoorRenderProps {
  door: Door;
  isSelected: boolean;
  themeMode: "blueprint" | "classic";
}

export function DoorElement({ door, isSelected, themeMode }: DoorRenderProps) {
  const size = door.width;
  const doorType = door.doorType ?? "hinged";
  const stroke = isSelected ? "#6366F1" : "#E11D48";
  const arcStroke =
    themeMode === "blueprint" ? "rgba(225, 29, 72, 0.4)" : "rgba(225, 29, 72, 0.3)";

  if (doorType === "sliding") {
    const isH = door.orientation === "h";
    return (
      <g className="cursor-move">
        <circle cx={door.x} cy={door.y} r="3" className={themeMode === "blueprint" ? "fill-sky-400" : "fill-sky-600"} />
        {isH ? (
          <>
            <line x1={door.x} y1={door.y - 5} x2={door.x + size} y2={door.y - 5} stroke={stroke} strokeWidth="2.5" />
            <line x1={door.x} y1={door.y + 5} x2={door.x + size} y2={door.y + 5} stroke={stroke} strokeWidth="2.5" />
            <polygon
              points={`${door.x + size * 0.7},${door.y - 8} ${door.x + size * 0.85},${door.y} ${door.x + size * 0.7},${door.y + 8}`}
              fill={stroke}
            />
          </>
        ) : (
          <>
            <line x1={door.x - 5} y1={door.y} x2={door.x - 5} y2={door.y + size} stroke={stroke} strokeWidth="2.5" />
            <line x1={door.x + 5} y1={door.y} x2={door.x + 5} y2={door.y + size} stroke={stroke} strokeWidth="2.5" />
            <polygon
              points={`${door.x - 8},${door.y + size * 0.7} ${door.x},${door.y + size * 0.85} ${door.x + 8},${door.y + size * 0.7}`}
              fill={stroke}
            />
          </>
        )}
        <text
          x={door.x + (isH ? size / 2 : 0)}
          y={door.y + (isH ? 18 : size / 2)}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          className={themeMode === "blueprint" ? "fill-sky-400" : "fill-sky-700"}
        >
          SLIDE
        </text>
      </g>
    );
  }

  if (doorType === "folding") {
    const isH = door.orientation === "h";
    const panels = 4;
    const panelSize = size / panels;
    const lines = [];
    for (let i = 0; i <= panels; i++) {
      const offset = i * panelSize;
      if (isH) {
        lines.push(
          <line
            key={i}
            x1={door.x + offset}
            y1={door.y - 6}
            x2={door.x + offset}
            y2={door.y + 6}
            stroke={stroke}
            strokeWidth="2"
          />
        );
      } else {
        lines.push(
          <line
            key={i}
            x1={door.x - 6}
            y1={door.y + offset}
            x2={door.x + 6}
            y2={door.y + offset}
            stroke={stroke}
            strokeWidth="2"
          />
        );
      }
    }
    return (
      <g className="cursor-move">
        <circle cx={door.x} cy={door.y} r="3" className={themeMode === "blueprint" ? "fill-amber-400" : "fill-amber-600"} />
        {lines}
        <text
          x={door.x + (isH ? size / 2 : 0)}
          y={door.y + (isH ? 18 : size / 2)}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          className={themeMode === "blueprint" ? "fill-amber-400" : "fill-amber-700"}
        >
          FOLD
        </text>
      </g>
    );
  }

  if (doorType === "pocket") {
    const isH = door.orientation === "h";
    return (
      <g className="cursor-move">
        <circle cx={door.x} cy={door.y} r="3" className={themeMode === "blueprint" ? "fill-violet-400" : "fill-violet-600"} />
        {isH ? (
          <>
            <line x1={door.x} y1={door.y} x2={door.x + size} y2={door.y} stroke={stroke} strokeWidth="2.5" strokeDasharray="6,3" />
            <rect x={door.x + size * 0.6} y={door.y - 4} width={size * 0.35} height="8" fill="none" stroke={stroke} strokeWidth="1.5" />
          </>
        ) : (
          <>
            <line x1={door.x} y1={door.y} x2={door.x} y2={door.y + size} stroke={stroke} strokeWidth="2.5" strokeDasharray="6,3" />
            <rect x={door.x - 4} y={door.y + size * 0.6} width="8" height={size * 0.35} fill="none" stroke={stroke} strokeWidth="1.5" />
          </>
        )}
        <text
          x={door.x + (isH ? size / 2 : 0)}
          y={door.y + (isH ? 18 : size / 2)}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          className={themeMode === "blueprint" ? "fill-violet-400" : "fill-violet-700"}
        >
          POCKET
        </text>
      </g>
    );
  }

  if (doorType === "double") {
    const half = size / 2;
    const isH = door.orientation === "h";
    return (
      <g className="cursor-move">
        <circle cx={door.x} cy={door.y} r="3" className={themeMode === "blueprint" ? "fill-rose-400" : "fill-rose-600"} />
        {isH ? (
          <g>
            <line x1={door.x} y1={door.y} x2={door.x} y2={door.y - half} stroke={stroke} strokeWidth="3" />
            <path
              d={`M ${door.x} ${door.y - half} A ${half} ${half} 0 0 1 ${door.x + half} ${door.y}`}
              fill="none"
              stroke={arcStroke}
              strokeWidth="1.5"
              strokeDasharray="4,4"
            />
            <line x1={door.x + size} y1={door.y} x2={door.x + size} y2={door.y - half} stroke={stroke} strokeWidth="3" />
            <path
              d={`M ${door.x + size} ${door.y - half} A ${half} ${half} 0 0 0 ${door.x + half} ${door.y}`}
              fill="none"
              stroke={arcStroke}
              strokeWidth="1.5"
              strokeDasharray="4,4"
            />
          </g>
        ) : (
          <g>
            <line x1={door.x} y1={door.y} x2={door.x - half} y2={door.y} stroke={stroke} strokeWidth="3" />
            <path
              d={`M ${door.x - half} ${door.y} A ${half} ${half} 0 0 1 ${door.x} ${door.y + half}`}
              fill="none"
              stroke={arcStroke}
              strokeWidth="1.5"
              strokeDasharray="4,4"
            />
            <line x1={door.x} y1={door.y + size} x2={door.x - half} y2={door.y + size} stroke={stroke} strokeWidth="3" />
            <path
              d={`M ${door.x - half} ${door.y + size} A ${half} ${half} 0 0 0 ${door.x} ${door.y + half}`}
              fill="none"
              stroke={arcStroke}
              strokeWidth="1.5"
              strokeDasharray="4,4"
            />
          </g>
        )}
        <text
          x={door.x + (isH ? size / 2 : 0)}
          y={door.y + (isH ? 18 : size / 2)}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          className={themeMode === "blueprint" ? "fill-rose-400" : "fill-rose-700"}
        >
          DOUBLE
        </text>
      </g>
    );
  }

  // Default: hinged door with swing arc
  return (
    <g className="cursor-move">
      <circle
        cx={door.x}
        cy={door.y}
        r="4"
        className={themeMode === "blueprint" ? "fill-rose-400" : "fill-rose-600"}
      />
      {door.orientation === "h" ? (
        <g>
          <line
            x1={door.x}
            y1={door.y}
            x2={door.x}
            y2={door.swing === "n" ? door.y - size : door.y + size}
            stroke={stroke}
            strokeWidth="3.5"
          />
          <path
            d={`M ${door.x} ${door.swing === "n" ? door.y - size : door.y + size} A ${size} ${size} 0 0 1 ${
              door.swing === "n" ? door.x + size : door.x + size
            } ${door.y}`}
            fill="none"
            stroke={arcStroke}
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
          <rect
            x={door.x}
            y={door.y - 4}
            width={size}
            height="8"
            fill="transparent"
            stroke={themeMode === "blueprint" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
            strokeWidth="1"
          />
        </g>
      ) : (
        <g>
          <line
            x1={door.x}
            y1={door.y}
            x2={door.swing === "w" ? door.x - size : door.x + size}
            y2={door.y}
            stroke={stroke}
            strokeWidth="3.5"
          />
          <path
            d={`M ${door.swing === "w" ? door.x - size : door.x + size} ${door.y} A ${size} ${size} 0 0 1 ${door.x} ${door.y + size}`}
            fill="none"
            stroke={arcStroke}
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
        </g>
      )}
      <text
        x={door.x + (door.orientation === "h" ? size / 2 : 0)}
        y={door.y + (door.orientation === "h" ? 18 : size / 2)}
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        className={themeMode === "blueprint" ? "fill-rose-400" : "fill-rose-700"}
      >
        D
      </text>
    </g>
  );
}

interface WindowRenderProps {
  win: WindowLayout;
  isSelected: boolean;
  themeMode: "blueprint" | "classic";
}

export function WindowElement({ win, isSelected, themeMode }: WindowRenderProps) {
  const w = win.width;
  const windowType = win.windowType ?? "fixed";
  const widthVal = win.orientation === "h" ? w : 12;
  const heightVal = win.orientation === "v" ? w : 12;
  const stroke = isSelected ? "#6366F1" : "#4F46E5";

  if (windowType === "sliding") {
    return (
      <g>
        <rect
          x={win.x - widthVal / 2}
          y={win.y - heightVal / 2}
          width={widthVal}
          height={heightVal}
          fill={themeMode === "blueprint" ? "#0F172A" : "#FFFFFF"}
          stroke={stroke}
          strokeWidth="2.5"
          className="cursor-move"
        />
        {win.orientation === "h" ? (
          <>
            <line x1={win.x - w / 4} y1={win.y - 4} x2={win.x - w / 4} y2={win.y + 4} stroke="#818CF8" strokeWidth="2" />
            <line x1={win.x + w / 4} y1={win.y - 4} x2={win.x + w / 4} y2={win.y + 4} stroke="#818CF8" strokeWidth="2" />
            <polygon points={`${win.x + w * 0.15},${win.y - 6} ${win.x + w * 0.3},${win.y} ${win.x + w * 0.15},${win.y + 6}`} fill="#818CF8" />
          </>
        ) : (
          <>
            <line x1={win.x - 4} y1={win.y - w / 4} x2={win.x + 4} y2={win.y - w / 4} stroke="#818CF8" strokeWidth="2" />
            <line x1={win.x - 4} y1={win.y + w / 4} x2={win.x + 4} y2={win.y + w / 4} stroke="#818CF8" strokeWidth="2" />
            <polygon points={`${win.x - 6},${win.y + w * 0.15} ${win.x},${win.y + w * 0.3} ${win.x + 6},${win.y + w * 0.15}`} fill="#818CF8" />
          </>
        )}
        <text
          x={win.x}
          y={win.orientation === "h" ? win.y - 12 : win.y}
          transform={win.orientation === "v" ? `rotate(-90 ${win.x} ${win.y})` : undefined}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          className={themeMode === "blueprint" ? "fill-indigo-400" : "fill-indigo-700"}
        >
          SLIDE
        </text>
      </g>
    );
  }

  if (windowType === "casement") {
    const arcR = w * 0.4;
    return (
      <g>
        <rect
          x={win.x - widthVal / 2}
          y={win.y - heightVal / 2}
          width={widthVal}
          height={heightVal}
          fill={themeMode === "blueprint" ? "#0F172A" : "#FFFFFF"}
          stroke={stroke}
          strokeWidth="2.5"
          className="cursor-move"
        />
        {win.orientation === "h" ? (
          <path
            d={`M ${win.x - w / 2} ${win.y} A ${arcR} ${arcR} 0 0 1 ${win.x + w / 2} ${win.y}`}
            fill="none"
            stroke="#818CF8"
            strokeWidth="1.5"
            strokeDasharray="3,3"
          />
        ) : (
          <path
            d={`M ${win.x} ${win.y - w / 2} A ${arcR} ${arcR} 0 0 1 ${win.x} ${win.y + w / 2}`}
            fill="none"
            stroke="#818CF8"
            strokeWidth="1.5"
            strokeDasharray="3,3"
          />
        )}
        <text
          x={win.x}
          y={win.orientation === "h" ? win.y - 12 : win.y}
          transform={win.orientation === "v" ? `rotate(-90 ${win.x} ${win.y})` : undefined}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          className={themeMode === "blueprint" ? "fill-indigo-400" : "fill-indigo-700"}
        >
          CASE
        </text>
      </g>
    );
  }

  if (windowType === "bay") {
    const depth = 18;
    return (
      <g>
        <rect
          x={win.x - widthVal / 2}
          y={win.y - heightVal / 2}
          width={widthVal}
          height={heightVal}
          fill={themeMode === "blueprint" ? "#0F172A" : "#FFFFFF"}
          stroke={stroke}
          strokeWidth="2.5"
          className="cursor-move"
        />
        {win.orientation === "h" ? (
          <polygon
            points={`${win.x - w / 2},${win.y + 6} ${win.x},${win.y + 6 + depth} ${win.x + w / 2},${win.y + 6}`}
            fill="none"
            stroke="#818CF8"
            strokeWidth="2"
          />
        ) : (
          <polygon
            points={`${win.x + 6},${win.y - w / 2} ${win.x + 6 + depth},${win.y} ${win.x + 6},${win.y + w / 2}`}
            fill="none"
            stroke="#818CF8"
            strokeWidth="2"
          />
        )}
        <text
          x={win.x}
          y={win.orientation === "h" ? win.y - 12 : win.y}
          transform={win.orientation === "v" ? `rotate(-90 ${win.x} ${win.y})` : undefined}
          textAnchor="middle"
          fontSize="8"
          fontWeight="bold"
          className={themeMode === "blueprint" ? "fill-indigo-400" : "fill-indigo-700"}
        >
          BAY
        </text>
      </g>
    );
  }

  // Default: fixed window
  return (
    <g>
      <rect
        x={win.x - widthVal / 2}
        y={win.y - heightVal / 2}
        width={widthVal}
        height={heightVal}
        fill={themeMode === "blueprint" ? "#0F172A" : "#FFFFFF"}
        stroke={stroke}
        strokeWidth="2.5"
        className="cursor-move"
      />
      {win.orientation === "h" ? (
        <line x1={win.x - w / 2} y1={win.y} x2={win.x + w / 2} y2={win.y} stroke="#818CF8" strokeWidth="2" />
      ) : (
        <line x1={win.x} y1={win.y - w / 2} x2={win.x} y2={win.y + w / 2} stroke="#818CF8" strokeWidth="2" />
      )}
      <text
        x={win.x}
        y={win.orientation === "h" ? win.y - 12 : win.y}
        transform={win.orientation === "v" ? `rotate(-90 ${win.x} ${win.y})` : undefined}
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        className={themeMode === "blueprint" ? "fill-indigo-400" : "fill-indigo-700"}
      >
        W
      </text>
    </g>
  );
}

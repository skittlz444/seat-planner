import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  MousePointer,
  Type,
  Minus,
  RotateCw,
  Trash2,
  Plus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Guest, Table } from "../shared/types";

// ── Canvas item types ────────────────────────────────────────────────────────

interface CanvasTableItem {
  type: "table";
  id: string;
  tableId: string;
  x: number;
  y: number;
  rotation: number;
}

interface CanvasTextItem {
  type: "text";
  id: string;
  x: number;
  y: number;
  text: string;
}

interface CanvasLineItem {
  type: "line";
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type CanvasItem = CanvasTableItem | CanvasTextItem | CanvasLineItem;
type Tool = "select" | "text" | "line";

// ── Constants ────────────────────────────────────────────────────────────────

const CANVAS_WIDTH = 4000;
const CANVAS_HEIGHT = 3000;
const TABLE_WIDTH = 110;
const ROW_HEIGHT = 20;
const TABLE_HEADER_HEIGHT = 24;

function uid(): string {
  return crypto.randomUUID();
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

const TableLayoutPage = ({ onBack }: Props) => {
  // Data from API
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  // Canvas state
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);

  // Drag state
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Rotation drag state
  const [rotating, setRotating] = useState<{
    id: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);

  // Line-drawing state
  const [lineStart, setLineStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [linePreviewEnd, setLinePreviewEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Text editing state
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutLoadedRef = useRef(false);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [guestsRes, tablesRes, layoutRes] = await Promise.all([
        fetch("/api/guests"),
        fetch("/api/tables"),
        fetch("/api/canvas-layout"),
      ]);
      if (!guestsRes.ok || !tablesRes.ok) throw new Error("Failed to fetch");

      const guestsData: Guest[] = await guestsRes.json();
      const tablesData: Array<{
        id: string;
        name: string;
        max_seats: number;
      }> = await tablesRes.json();

      setTables(
        tablesData.map((t) => ({
          ...t,
          guests: guestsData
            .filter((g) => g.table_id === t.id)
            .sort(
              (a, b) => (a.table_position ?? 0) - (b.table_position ?? 0)
            ),
        }))
      );

      // Load canvas layout from DB
      if (layoutRes.ok) {
        const layoutData: CanvasItem[] = await layoutRes.json();
        if (Array.isArray(layoutData)) {
          setItems(layoutData);
        }
      }
      layoutLoadedRef.current = true;
    } catch {
      /* silently fail — data just won't show */
      layoutLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Persist layout to DB (debounced) whenever items change
  useEffect(() => {
    // Don't save until we've loaded from DB first
    if (!layoutLoadedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/canvas-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      }).catch(() => {
        /* silently fail */
      });
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [items]);

  // ── Coordinate helpers ───────────────────────────────────────────────────

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const scrollTop = containerRef.current.scrollTop;
      return {
        x: (e.clientX - rect.left + scrollLeft) / zoom,
        y: (e.clientY - rect.top + scrollTop) / zoom,
      };
    },
    [zoom]
  );

  // ── Item helpers ─────────────────────────────────────────────────────────

  const updateItem = useCallback(
    (id: string, patch: Partial<CanvasItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it)) as CanvasItem[]
      );
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const addTableToCanvas = useCallback(
    (tableId: string) => {
      // Place at a default position that's visible in the scrollable area
      const scrollLeft = containerRef.current?.scrollLeft ?? 0;
      const scrollTop = containerRef.current?.scrollTop ?? 0;
      const x = scrollLeft / zoom + 100 + Math.random() * 200;
      const y = scrollTop / zoom + 100 + Math.random() * 200;
      const item: CanvasTableItem = {
        type: "table",
        id: uid(),
        tableId,
        x,
        y,
        rotation: 0,
      };
      setItems((prev) => [...prev, item]);
    },
    [zoom]
  );

  const isTableOnCanvas = useCallback(
    (tableId: string) =>
      items.some((it) => it.type === "table" && it.tableId === tableId),
    [items]
  );

  // ── Mouse handlers ───────────────────────────────────────────────────────

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left-click on canvas background
      if (e.button !== 0) return;

      if (tool === "select") {
        // Clicking on empty canvas deselects
        if (e.target === e.currentTarget) {
          setSelectedId(null);
        }
      }
    },
    [tool]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only respond to clicks directly on the canvas (not bubbled from children)
      if (e.target !== e.currentTarget) return;

      const coords = getCanvasCoords(e);

      if (tool === "text") {
        const newText: CanvasTextItem = {
          type: "text",
          id: uid(),
          x: coords.x,
          y: coords.y,
          text: "",
        };
        setItems((prev) => [...prev, newText]);
        setEditingTextId(newText.id);
        setEditingTextValue("");
        setSelectedId(newText.id);
      } else if (tool === "line") {
        if (!lineStart) {
          setLineStart(coords);
        } else {
          const newLine: CanvasLineItem = {
            type: "line",
            id: uid(),
            x1: lineStart.x,
            y1: lineStart.y,
            x2: coords.x,
            y2: coords.y,
          };
          setItems((prev) => [...prev, newLine]);
          setLineStart(null);
          setLinePreviewEnd(null);
          setSelectedId(newLine.id);
        }
      }
    },
    [tool, lineStart, getCanvasCoords]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const coords = getCanvasCoords(e);

      // Rotating an item
      if (rotating) {
        const dx = coords.x - rotating.centerX;
        const dy = coords.y - rotating.centerY;
        const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        const deltaAngle = currentAngle - rotating.startAngle;
        let newRotation = (rotating.startRotation + deltaAngle) % 360;
        if (newRotation < 0) newRotation += 360;
        updateItem(rotating.id, { rotation: newRotation } as Partial<CanvasItem>);
        return;
      }

      // Dragging an item
      if (dragging) {
        updateItem(dragging.id, {
          x: coords.x - dragging.offsetX,
          y: coords.y - dragging.offsetY,
        } as Partial<CanvasItem>);
        return;
      }

      // Line preview
      if (tool === "line" && lineStart) {
        setLinePreviewEnd(coords);
      }
    },
    [rotating, dragging, tool, lineStart, getCanvasCoords, updateItem]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (dragging) setDragging(null);
    if (rotating) setRotating(null);
  }, [dragging, rotating]);

  // Also handle mouseup outside canvas
  useEffect(() => {
    const handler = () => {
      setDragging(null);
      setRotating(null);
    };
    window.addEventListener("mouseup", handler);
    return () => window.removeEventListener("mouseup", handler);
  }, []);

  const startDrag = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.stopPropagation();
      if (tool !== "select") return;

      const coords = getCanvasCoords(e);
      const item = items.find((it) => it.id === itemId);
      if (!item || item.type === "line") return;

      setDragging({
        id: itemId,
        offsetX: coords.x - item.x,
        offsetY: coords.y - item.y,
      });
      setSelectedId(itemId);
    },
    [tool, items, getCanvasCoords]
  );

  const startRotate = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.stopPropagation();
      e.preventDefault();
      const item = items.find((it) => it.id === itemId);
      if (!item || item.type !== "table") return;

      const tableItem = item as CanvasTableItem;
      const table = tables.find((t) => t.id === tableItem.tableId);
      const height = table ? getTableHeight(table.max_seats) : 100;

      // Center of the table in canvas coords
      const centerX = tableItem.x + TABLE_WIDTH / 2;
      const centerY = tableItem.y + height / 2;

      const coords = getCanvasCoords(e);
      const startAngle = Math.atan2(coords.y - centerY, coords.x - centerX) * (180 / Math.PI);

      setRotating({
        id: itemId,
        centerX,
        centerY,
        startAngle,
        startRotation: tableItem.rotation,
      });
    },
    [items, tables, getCanvasCoords]
  );

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't delete if editing text or any input/textarea is focused
        if (editingTextId) return;
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        if (selectedId) {
          removeItem(selectedId);
        }
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setLineStart(null);
        setLinePreviewEnd(null);
        setEditingTextId(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, editingTextId, removeItem]);

  // ── Table dimensions ─────────────────────────────────────────────────────

  const getTableHeight = (maxSeats: number) => {
    const rows = Math.ceil(maxSeats / 2);
    return TABLE_HEADER_HEIGHT + rows * ROW_HEIGHT + 4; // 4px bottom padding
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderCanvasTable = (item: CanvasTableItem) => {
    const table = tables.find((t) => t.id === item.tableId);
    if (!table) return null;

    const rows = Math.ceil(table.max_seats / 2);
    const height = getTableHeight(table.max_seats);
    const isSelected = selectedId === item.id;

    return (
      <div
        key={item.id}
        className="absolute select-none"
        style={{
          left: item.x,
          top: item.y,
          width: TABLE_WIDTH,
          height,
          transform: `rotate(${item.rotation}deg)`,
          transformOrigin: "center center",
          zIndex: isSelected ? 20 : 10,
        }}
        onMouseDown={(e) => startDrag(e, item.id)}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(item.id);
        }}
      >
        {/* Table rectangle */}
        <div
          className={`w-full h-full rounded-lg border-2 overflow-hidden ${
            isSelected
              ? "border-indigo-500 shadow-lg shadow-indigo-200"
              : "border-amber-700 shadow-md"
          }`}
          style={{ backgroundColor: "#f5e6d3" }}
        >
          {/* Header */}
          <div
            className="px-2 py-1 text-center font-bold text-xs truncate"
            style={{
              backgroundColor: "#d4a574",
              color: "#3d2b1f",
              height: TABLE_HEADER_HEIGHT,
              lineHeight: `${TABLE_HEADER_HEIGHT - 4}px`,
            }}
          >
            {table.name}
            <span className="ml-1 font-normal opacity-70">
              {table.guests.length}/{table.max_seats}
            </span>
          </div>

          {/* Guest rows */}
          <div className="px-1" style={{ fontSize: 10 }}>
            {Array.from({ length: rows }).map((_, rowIdx) => {
              const leftGuest = table.guests[rowIdx * 2]; // position 0,2,4,...
              const rightGuest = table.guests[rowIdx * 2 + 1]; // position 1,3,5,...
              return (
                <div
                  key={rowIdx}
                  className="flex items-center"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Left side */}
                  <div className="flex-1 flex items-center gap-0.5 min-w-0">
                    {leftGuest ? (
                      <>
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: leftGuest.color }}
                        />
                        <span
                          className="truncate font-medium"
                          style={{ color: "#3d2b1f" }}
                        >
                          {leftGuest.name.charAt(0)}
                        </span>
                      </>
                    ) : (
                      <span className="w-2 h-2 rounded-full border border-amber-300 opacity-40 shrink-0" />
                    )}
                  </div>

                  {/* Divider */}
                  <div className="w-px h-3 bg-amber-400 opacity-40 mx-0.5" />

                  {/* Right side */}
                  <div className="flex-1 flex items-center gap-0.5 justify-end min-w-0">
                    {rightGuest ? (
                      <>
                        <span
                          className="truncate font-medium"
                          style={{ color: "#3d2b1f" }}
                        >
                          {rightGuest.name.charAt(0)}
                        </span>
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: rightGuest.color }}
                        />
                      </>
                    ) : (
                      <span className="w-2 h-2 rounded-full border border-amber-300 opacity-40 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls when selected */}
        {isSelected && (
          <>
            {/* Rotation drag handle — positioned above the table center */}
            <div
              className="absolute flex flex-col items-center"
              style={{
                left: "50%",
                top: -32,
                transform: `translateX(-50%) rotate(${-item.rotation}deg)`,
              }}
            >
              <div
                className="w-5 h-5 bg-indigo-600 rounded-full shadow cursor-grab active:cursor-grabbing flex items-center justify-center hover:bg-indigo-700 transition-colors"
                title="Drag to rotate"
                onMouseDown={(e) => startRotate(e, item.id)}
              >
                <RotateCw size={10} className="text-white" />
              </div>
              <div className="w-px h-2 bg-indigo-400" />
            </div>

            {/* Delete button */}
            <div
              className="absolute -top-8 right-0"
              style={{ transform: `rotate(${-item.rotation}deg)` }}
            >
              <button
                className="p-1 bg-red-600 text-white rounded shadow hover:bg-red-700"
                title="Remove from canvas"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderCanvasText = (item: CanvasTextItem) => {
    const isSelected = selectedId === item.id;
    const isEditing = editingTextId === item.id;

    return (
      <div
        key={item.id}
        className={`absolute ${isEditing ? "" : "select-none"} ${
          isSelected ? "ring-2 ring-indigo-500 ring-offset-1" : ""
        }`}
        style={{
          left: item.x,
          top: item.y,
          zIndex: isSelected ? 20 : 5,
          minWidth: 60,
        }}
        onMouseDown={(e) => {
          if (!isEditing) startDrag(e, item.id);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(item.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingTextId(item.id);
          setEditingTextValue(item.text);
        }}
      >
        {isEditing ? (
          <input
            type="text"
            autoFocus
            value={editingTextValue}
            onChange={(e) => setEditingTextValue(e.target.value)}
            onBlur={() => {
              updateItem(item.id, { text: editingTextValue } as Partial<CanvasItem>);
              setEditingTextId(null);
              if (!editingTextValue.trim()) removeItem(item.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateItem(item.id, {
                  text: editingTextValue,
                } as Partial<CanvasItem>);
                setEditingTextId(null);
                if (!editingTextValue.trim()) removeItem(item.id);
              }
              if (e.key === "Escape") {
                setEditingTextId(null);
                if (!item.text.trim()) removeItem(item.id);
              }
            }}
            className="px-2 py-1 border-2 border-indigo-500 rounded text-sm font-medium bg-white outline-none min-w-[120px] select-text cursor-text"
          />
        ) : (
          <div className="px-2 py-1 text-sm font-medium text-slate-800 cursor-move whitespace-nowrap">
            {item.text || (
              <span className="italic text-slate-400">Double-click to edit</span>
            )}
          </div>
        )}

        {/* Delete control */}
        {isSelected && !isEditing && (
          <button
            className="absolute -top-6 right-0 p-1 bg-red-600 text-white rounded shadow hover:bg-red-700"
            title="Delete text"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              removeItem(item.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    );
  };

  const renderCanvasLine = (item: CanvasLineItem) => {
    const isSelected = selectedId === item.id;
    return (
      <g key={item.id}>
        {/* Wider invisible line for easier clicking */}
        <line
          x1={item.x1}
          y1={item.y1}
          x2={item.x2}
          y2={item.y2}
          stroke="transparent"
          strokeWidth={12}
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(item.id);
          }}
        />
        <line
          x1={item.x1}
          y1={item.y1}
          x2={item.x2}
          y2={item.y2}
          stroke={isSelected ? "#6366f1" : "#64748b"}
          strokeWidth={isSelected ? 3 : 2}
          strokeLinecap="round"
          strokeDasharray={isSelected ? "none" : "8 4"}
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(item.id);
          }}
        />
        {isSelected && (
          <>
            <circle
              cx={item.x1}
              cy={item.y1}
              r={5}
              fill="#6366f1"
              stroke="white"
              strokeWidth={2}
            />
            <circle
              cx={item.x2}
              cy={item.y2}
              r={5}
              fill="#6366f1"
              stroke="white"
              strokeWidth={2}
            />
            {/* Delete button at midpoint */}
            <foreignObject
              x={(item.x1 + item.x2) / 2 - 10}
              y={(item.y1 + item.y2) / 2 - 24}
              width={20}
              height={20}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
                className="w-5 h-5 bg-red-600 text-white rounded-full shadow flex items-center justify-center hover:bg-red-700"
                title="Delete line"
              >
                <Trash2 size={10} />
              </button>
            </foreignObject>
          </>
        )}
      </g>
    );
  };

  // ── Grid pattern background ──────────────────────────────────────────────

  const gridSize = 40;

  // ── Zoom controls ────────────────────────────────────────────────────────

  const zoomIn = () => setZoom((z) => Math.min(z + 0.1, 2));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.2));

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading layout...</div>
      </div>
    );
  }

  const canvasTableItems = items.filter(
    (it): it is CanvasTableItem => it.type === "table"
  );
  const canvasTextItems = items.filter(
    (it): it is CanvasTextItem => it.type === "text"
  );
  const canvasLineItems = items.filter(
    (it): it is CanvasLineItem => it.type === "line"
  );

  const selectedItem = items.find((it) => it.id === selectedId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-slate-100 font-sans text-slate-900 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Planner
        </button>
        <h1 className="text-lg font-bold text-slate-800">Table Layout</h1>

        {/* Toolbar */}
        <div className="flex items-center gap-1 ml-4 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => {
              setTool("select");
              setLineStart(null);
              setLinePreviewEnd(null);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tool === "select"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MousePointer size={14} /> Select
          </button>
          <button
            onClick={() => {
              setTool("text");
              setLineStart(null);
              setLinePreviewEnd(null);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tool === "text"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Type size={14} /> Text
          </button>
          <button
            onClick={() => {
              setTool("line");
              setLineStart(null);
              setLinePreviewEnd(null);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tool === "line"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Minus size={14} /> Line
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={zoomOut}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-semibold text-slate-500 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Delete selected */}
        {selectedItem && (
          <button
            onClick={() => removeItem(selectedId!)}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-md text-xs font-semibold hover:bg-red-200 transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>
        )}

        {/* Rotate hint if table selected */}
        {selectedItem && selectedItem.type === "table" && (
          <span className="flex items-center gap-1 px-3 py-1.5 text-indigo-600 text-xs font-semibold">
            <RotateCw size={14} /> Drag handle to rotate
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 bg-white border-r border-slate-200 overflow-y-auto shrink-0 p-3">
          <h2 className="text-sm font-bold text-slate-700 mb-3">Tables</h2>
          <div className="space-y-2">
            {tables.map((table) => {
              const onCanvas = isTableOnCanvas(table.id);
              return (
                <div
                  key={table.id}
                  className={`p-2 rounded-lg border text-xs ${
                    onCanvas
                      ? "border-green-200 bg-green-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-800 truncate">
                      {table.name}
                    </span>
                    <span className="text-slate-400 shrink-0 ml-1">
                      {table.guests.length}/{table.max_seats}
                    </span>
                  </div>
                  {/* Guest preview dots */}
                  <div className="flex flex-wrap gap-0.5 mb-1.5">
                    {table.guests.map((g) => (
                      <span
                        key={g.id}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: g.color }}
                        title={g.name}
                      />
                    ))}
                  </div>
                  {!onCanvas ? (
                    <button
                      onClick={() => addTableToCanvas(table.id)}
                      className="flex items-center gap-1 w-full justify-center py-1 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      <Plus size={12} /> Add to Canvas
                    </button>
                  ) : (
                    <span className="block text-center text-green-600 font-semibold py-1">
                      ✓ On Canvas
                    </span>
                  )}
                </div>
              );
            })}
            {tables.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-4">
                No tables yet. Create tables in the Planner view.
              </p>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-6 p-3 bg-slate-50 rounded-lg">
            <h3 className="text-xs font-bold text-slate-600 mb-2">
              How to use
            </h3>
            <ul className="text-[10px] text-slate-500 space-y-1.5">
              <li>
                <strong>Select:</strong> Click &amp; drag to move items.
                Click table to select, drag the handle above to rotate.
              </li>
              <li>
                <strong>Text:</strong> Click on canvas to place text.
                Double-click to edit.
              </li>
              <li>
                <strong>Line:</strong> Click to set start point, click again
                to set end point. Great for drawing aisles.
              </li>
              <li>
                <strong>Delete:</strong> Select an item, then press
                Delete/Backspace or use the delete button.
              </li>
              <li>
                <strong>Esc:</strong> Deselect &amp; cancel current action.
              </li>
            </ul>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto relative"
          style={{ cursor: { text: "text" as const, line: "crosshair" as const, select: "default" as const }[tool] }}
        >
          {/* Scaled canvas wrapper — the outer div sizes the scroll area */}
          <div
            style={{
              width: CANVAS_WIDTH * zoom,
              height: CANVAS_HEIGHT * zoom,
            }}
          >
            {/* Inner canvas at natural size, scaled via transform */}
            <div
              className="relative"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
              }}
              onMouseDown={handleCanvasMouseDown}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            >
              {/* Grid background */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
              >
                <defs>
                  <pattern
                    id="grid"
                    width={gridSize}
                    height={gridSize}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth={1}
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="#f8fafc" />
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {/* Lines SVG layer */}
              <svg
                className="absolute inset-0"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                style={{ pointerEvents: "none" }}
              >
                <g style={{ pointerEvents: "auto" }}>
                  {canvasLineItems.map(renderCanvasLine)}
                </g>

                {/* Line preview */}
                {lineStart && linePreviewEnd && (
                  <line
                    x1={lineStart.x}
                    y1={lineStart.y}
                    x2={linePreviewEnd.x}
                    y2={linePreviewEnd.y}
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    opacity={0.6}
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* Line start indicator */}
                {lineStart && (
                  <circle
                    cx={lineStart.x}
                    cy={lineStart.y}
                    r={4}
                    fill="#6366f1"
                    opacity={0.8}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </svg>

              {/* Text items */}
              {canvasTextItems.map(renderCanvasText)}

              {/* Table items */}
              {canvasTableItems.map(renderCanvasTable)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableLayoutPage;

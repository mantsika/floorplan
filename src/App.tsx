import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Upload,
  Download,
  Pencil,
  MousePointer2,
  Ruler,
  Trash2,
  Grid,
  Sparkles,
  Undo2,
  Redo2,
  Plus,
  Printer,
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  Check,
  Home,
  RefreshCw,
  Sliders,
  ChevronRight,
  ChevronDown,
  Layers,
  MapPin,
  Compass,
  Menu,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Settings,
  Share2,
  Code,
  User,
  FileCode,
  Save,
  FolderOpen,
} from "lucide-react";
import {
  Wall,
  Door,
  WindowLayout,
  Room,
  ScaleConfig,
  EditorTool,
  FloorplanData,
  HistoryItem,
  BgImageCard,
  DimensionLine,
  Fixture,
  DoorType,
  WindowType,
  WallType,
  MissedItemHighlight,
  PlaygroundSheet,
  DEFAULT_SHEET_ID,
} from "./types";
import { filterBySheet } from "./lib/sheetFilter";
import { templates, EMPTY_FLOORPLAN } from "./templates";
import { DEFAULT_EXTRACTION_MODEL, EXTRACTION_MODELS } from "./openRouterModels";
import { buildWindowFacingHint } from "./floorplanExtraction";
import {
  WALL_ITEMS,
  DOOR_ITEMS,
  WINDOW_ITEMS,
  getWallStyle,
  getFixtureDefaultSize,
  normalizeWallType,
  normalizeDoorType,
  normalizeWindowType,
  normalizeOrientation,
  normalizeSwing,
} from "./architecturalItems";
import { DoorElement, WindowElement } from "./renderElements";
import { apiUrl, uploadImageToR2, isCloudApiEnabled, resolveImageForApi, claimTempAccount } from "./lib/api";
import {
  getRoomGroupBounds,
  isPointInRoomGroup,
  getFixtureLocalCoords,
  isPointInFixture,
  inferGroupWindowFacing,
} from "./lib/roomGroup";
import { normalizeFixtureRotation } from "./extractionPostProcess";
import {
  mapImageLocalToCanvas,
  mapImageLocalToCanvasSize,
  mapCanvasToImageLocal,
} from "./lib/imageCoords";
import {
  getWallsBbox,
  resolveRoomDimensionsM,
  scaleRoomGroupToRealWorld,
  PLAYGROUND_PX_PER_M,
  DRAWING_SCALE_LABEL,
  SHEET_WIDTH_METERS,
} from "./lib/roomScale";
import {
  DEFAULT_PLAYGROUND_VIEW,
  computeContentBounds,
  fitViewBoxToBounds,
  zoomViewBoxAtPoint,
  panViewBox,
  viewBoxZoomPercent,
  normalizePlaygroundView,
  type PlaygroundViewBox,
} from "./lib/playgroundView";
import {
  getUserSession,
  useTestUser,
  completeSignup,
  getTempUserIdForClaim,
  type UserSession,
} from "./lib/userId";

export default function App() {
  // Current edited floorplan state
  const [walls, setWalls] = useState<Wall[]>(EMPTY_FLOORPLAN.walls);
  const [doors, setDoors] = useState<Door[]>(EMPTY_FLOORPLAN.doors);
  const [windows, setWindows] = useState<WindowLayout[]>(EMPTY_FLOORPLAN.windows);
  const [rooms, setRooms] = useState<Room[]>(EMPTY_FLOORPLAN.rooms);
  const [scale, setScale] = useState<ScaleConfig>(EMPTY_FLOORPLAN.scale);
  const [bgImages, setBgImages] = useState<BgImageCard[]>([]);
  const [selectedBgId, setSelectedBgId] = useState<string | null>(null);

  // Precision Architectural Annotation & Custom Rulers State
  const [dimensionLines, setDimensionLines] = useState<DimensionLine[]>([]);
  const [pendingDimension, setPendingDimension] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dimLengthInput, setDimLengthInput] = useState<string>("5.0");
  const [dimNoteInput, setDimNoteInput] = useState<string>("");

  // Placed Fixtures & Furniture Stamps
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixtureType, setSelectedFixtureType] = useState<string>("bed");
  const [selectedDoorType, setSelectedDoorType] = useState<DoorType>("hinged");
  const [selectedWindowType, setSelectedWindowType] = useState<WindowType>("fixed");
  const [selectedWallType, setSelectedWallType] = useState<WallType>("interior");
  const [isAddMenuOpen, setIsAddMenuOpen] = useState<boolean>(false);

  // Undo / Redo histories
  const [undoStack, setUndoStack] = useState<HistoryItem[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryItem[]>([]);

  // Editor configuration
  const [tool, setTool] = useState<EditorTool>("select");
  const [gridSnapping, setGridSnapping] = useState<boolean>(true);
  const [themeMode, setThemeMode] = useState<"blueprint" | "classic">("classic");
  const [compassAngle, setCompassAngle] = useState<number>(0);
  
  // Elements Selection
  const [selectedElement, setSelectedElement] = useState<{
    type: "wall" | "door" | "window" | "room" | "dimension" | "fixture" | "none";
    id: string;
  }>({ type: "none", id: "" });

  // Upload & Conversion states
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageOpacity, setImageOpacity] = useState<number>(0.4);
  const [showTracingImages, setShowTracingImages] = useState<boolean>(true);
  const [missedHighlights, setMissedHighlights] = useState<MissedItemHighlight[]>([]);
  const [drawingHighlightStart, setDrawingHighlightStart] = useState<{ x: number; y: number } | null>(null);
  const [highlightItemType, setHighlightItemType] = useState<"door" | "window" | "fixture">("door");
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [additionalContext, setAdditionalContext] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_EXTRACTION_MODEL;
    return localStorage.getItem("floorplan_ai_model") || DEFAULT_EXTRACTION_MODEL;
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Drawing & Interaction states
  const [drawingWallStart, setDrawingWallStart] = useState<{ x: number; y: number } | null>(null);
  const [tempMousePos, setTempMousePos] = useState<{ x: number; y: number } | null>(null);
  const [draggingJoint, setDraggingJoint] = useState<{ x: number; y: number; originalX: number; originalY: number } | null>(null);
  const [draggingElement, setDraggingElement] = useState<{
    type: "door" | "window" | "room" | "bg_image" | "room_group" | "fixture" | "fixture_rotate" | "fixture_scale";
    id: string;
    offsetX?: number;
    offsetY?: number;
    startAngle?: number;
    startRotation?: number;
    startDist?: number;
    startWidth?: number;
    startHeight?: number;
  } | null>(null);
  
  // Calibration auxiliary state
  const [calibrationPoint, setCalibrationPoint] = useState<{ x: number; y: number } | null>(null);
  const [calibrationValue, setCalibrationValue] = useState<string>("5.0");
  const [nudgeStep, setNudgeStep] = useState<number>(5);

  // Project details (shown on blueprint and printable sheet)
  const [projectTitle, setProjectTitle] = useState<string>("Untitled Project");
  const [clientName, setClientName] = useState<string>("");
  const [contractorNotes, setContractorNotes] = useState<string>("Calibrated for structural frame estimates. All dimensions to be validated before partition installation.");
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<"properties" | "templates">("properties");
  
  // Navigation & Drawer states
  const [activePage, setActivePage] = useState<"settings" | "publish" | "vector" | "profile">("settings");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [defaultWallThickness, setDefaultWallThickness] = useState<number>(15);
  const [defaultDoorWidth, setDefaultDoorWidth] = useState<number>(80);
  const [backupInterval, setBackupInterval] = useState<number>(60);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [userSession, setUserSession] = useState<UserSession>(getUserSession);
  const [signupUsername, setSignupUsername] = useState<string>("");
  const [isClaiming, setIsClaiming] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [playgroundView, setPlaygroundView] = useState<PlaygroundViewBox>(DEFAULT_PLAYGROUND_VIEW);
  const [isPanningView, setIsPanningView] = useState(false);
  const panViewStartRef = useRef<{ clientX: number; clientY: number; viewBox: PlaygroundViewBox } | null>(null);
  const [autoFitViewPending, setAutoFitViewPending] = useState(false);
  const [playgroundSheets, setPlaygroundSheets] = useState<PlaygroundSheet[]>([
    { id: DEFAULT_SHEET_ID, name: "Ground Floor" },
  ]);
  const [activeSheetId, setActiveSheetId] = useState(DEFAULT_SHEET_ID);

  const sheetWalls = useMemo(() => filterBySheet(walls, activeSheetId), [walls, activeSheetId]);
  const sheetDoors = useMemo(() => filterBySheet(doors, activeSheetId), [doors, activeSheetId]);
  const sheetWindows = useMemo(() => filterBySheet(windows, activeSheetId), [windows, activeSheetId]);
  const sheetRooms = useMemo(() => filterBySheet(rooms, activeSheetId), [rooms, activeSheetId]);
  const sheetFixtures = useMemo(() => filterBySheet(fixtures, activeSheetId), [fixtures, activeSheetId]);
  const sheetBgImages = useMemo(() => filterBySheet(bgImages, activeSheetId), [bgImages, activeSheetId]);
  const sheetDimensionLines = useMemo(
    () => filterBySheet(dimensionLines, activeSheetId),
    [dimensionLines, activeSheetId]
  );
  const sheetHighlights = useMemo(
    () => filterBySheet(missedHighlights, activeSheetId),
    [missedHighlights, activeSheetId]
  );

  const switchPlaygroundSheet = useCallback(
    (nextSheetId: string) => {
      setPlaygroundSheets((prev) =>
        prev.map((s) =>
          s.id === activeSheetId ? { ...s, viewBox: playgroundView } : s
        )
      );
      const nextSheet = playgroundSheets.find((s) => s.id === nextSheetId);
      setActiveSheetId(nextSheetId);
      setPlaygroundView(
        normalizePlaygroundView(nextSheet?.viewBox ?? DEFAULT_PLAYGROUND_VIEW)
      );
      setSelectedBgId(null);
      setSelectedElement({ type: "none", id: "" });
    },
    [activeSheetId, playgroundView, playgroundSheets]
  );

  const addPlaygroundSheet = () => {
    const id = `sheet_${Date.now()}`;
    const name = `Floor ${playgroundSheets.length + 1}`;
    setPlaygroundSheets((prev) => [...prev, { id, name }]);
    setPlaygroundView(DEFAULT_PLAYGROUND_VIEW);
    setActiveSheetId(id);
    setSelectedBgId(null);
    setSelectedElement({ type: "none", id: "" });
    triggerNotification(`Added worksheet "${name}" — arrange rooms for another floor or wing.`);
  };

  const deletePlaygroundSheet = (sheetId: string) => {
    if (playgroundSheets.length <= 1) return;
    const target = playgroundSheets.find((s) => s.id === sheetId);
    if (!window.confirm(`Delete worksheet "${target?.name}" and all its content?`)) return;
    saveHistoryState();
    const belongs = (sid?: string) => (sid ?? DEFAULT_SHEET_ID) !== sheetId;
    setWalls((prev) => prev.filter((w) => belongs(w.sheetId)));
    setDoors((prev) => prev.filter((d) => belongs(d.sheetId)));
    setWindows((prev) => prev.filter((w) => belongs(w.sheetId)));
    setRooms((prev) => prev.filter((r) => belongs(r.sheetId)));
    setFixtures((prev) => prev.filter((f) => belongs(f.sheetId)));
    setBgImages((prev) => prev.filter((b) => belongs(b.sheetId)));
    setDimensionLines((prev) => prev.filter((d) => belongs(d.sheetId)));
    setMissedHighlights((prev) => prev.filter((h) => belongs(h.sheetId)));
    setPlaygroundSheets((prev) => prev.filter((s) => s.id !== sheetId));
    if (activeSheetId === sheetId) {
      const remaining = playgroundSheets.filter((s) => s.id !== sheetId);
      const fallback = remaining[0]?.id ?? DEFAULT_SHEET_ID;
      setActiveSheetId(fallback);
      setPlaygroundView(remaining[0]?.viewBox ?? DEFAULT_PLAYGROUND_VIEW);
    }
  };

  // Unit Conversion helper
  const convertDistanceValue = (value: number, from: "m" | "cm" | "ft" | "in", to: "m" | "cm" | "ft" | "in"): number => {
    if (from === to) return value;
    let meters = value;
    if (from === "cm") meters = value / 100;
    else if (from === "ft") meters = value * 0.3048;
    else if (from === "in") meters = value * 0.0254;

    if (to === "m") return meters;
    if (to === "cm") return meters * 100;
    if (to === "ft") return meters / 0.3048;
    if (to === "in") return meters / 0.0254;
    return value;
  };

  const handleUnitChange = (newUnit: "m" | "cm" | "ft" | "in") => {
    saveHistoryState();
    const oldUnit = scale.unit;
    const oldVal = scale.physicalLength;
    const newVal = convertDistanceValue(oldVal, oldUnit, newUnit);
    setScale((prev) => ({
      ...prev,
      unit: newUnit,
      physicalLength: parseFloat(newVal.toFixed(3)),
    }));
    triggerNotification(`Display metrics switched to ${newUnit === "m" ? "Meters" : newUnit === "cm" ? "Centimeters" : newUnit === "ft" ? "Feet" : "Inches"}`);
  };

  // Push current state to undo history
  const saveHistoryState = () => {
    const backup: HistoryItem = {
      walls: JSON.parse(JSON.stringify(walls)),
      doors: JSON.parse(JSON.stringify(doors)),
      windows: JSON.parse(JSON.stringify(windows)),
      rooms: JSON.parse(JSON.stringify(rooms)),
      scale: { ...scale },
      bgImages: JSON.parse(JSON.stringify(bgImages)),
      dimensionLines: JSON.parse(JSON.stringify(dimensionLines)),
      fixtures: JSON.parse(JSON.stringify(fixtures)),
      missedHighlights: JSON.parse(JSON.stringify(missedHighlights)),
      playgroundSheets: JSON.parse(JSON.stringify(playgroundSheets)),
      activeSheetId,
    };
    setUndoStack((prev) => [...prev, backup]);
    setRedoStack([]); // Clear redo
  };

  // Trigger undo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    
    // Backup current state to redo
    const current: HistoryItem = {
      walls: JSON.parse(JSON.stringify(walls)),
      doors: JSON.parse(JSON.stringify(doors)),
      windows: JSON.parse(JSON.stringify(windows)),
      rooms: JSON.parse(JSON.stringify(rooms)),
      scale: { ...scale },
      bgImages: JSON.parse(JSON.stringify(bgImages)),
      dimensionLines: JSON.parse(JSON.stringify(dimensionLines)),
      fixtures: JSON.parse(JSON.stringify(fixtures)),
      missedHighlights: JSON.parse(JSON.stringify(missedHighlights)),
      playgroundSheets: JSON.parse(JSON.stringify(playgroundSheets)),
      activeSheetId,
    };
    setRedoStack((prev) => [...prev, current]);

    // Restore previous
    setWalls(previous.walls);
    setDoors(previous.doors);
    setWindows(previous.windows);
    setRooms(previous.rooms);
    setScale(previous.scale);
    setBgImages(previous.bgImages || []);
    setDimensionLines(previous.dimensionLines || []);
    setFixtures(previous.fixtures || []);
    setMissedHighlights(previous.missedHighlights || []);
    if (previous.playgroundSheets) setPlaygroundSheets(previous.playgroundSheets);
    if (previous.activeSheetId) setActiveSheetId(previous.activeSheetId);

    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setSelectedElement({ type: "none", id: "" });
  };

  // Trigger redo
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];

    // Backup current to undo
    const current: HistoryItem = {
      walls: JSON.parse(JSON.stringify(walls)),
      doors: JSON.parse(JSON.stringify(doors)),
      windows: JSON.parse(JSON.stringify(windows)),
      rooms: JSON.parse(JSON.stringify(rooms)),
      scale: { ...scale },
      bgImages: JSON.parse(JSON.stringify(bgImages)),
      dimensionLines: JSON.parse(JSON.stringify(dimensionLines)),
      fixtures: JSON.parse(JSON.stringify(fixtures)),
      missedHighlights: JSON.parse(JSON.stringify(missedHighlights)),
      playgroundSheets: JSON.parse(JSON.stringify(playgroundSheets)),
      activeSheetId,
    };
    setUndoStack((prev) => [...prev, current]);

    // Restore next
    setWalls(next.walls);
    setDoors(next.doors);
    setWindows(next.windows);
    setRooms(next.rooms);
    setScale(next.scale);
    setBgImages(next.bgImages || []);
    setDimensionLines(next.dimensionLines || []);
    setFixtures(next.fixtures || []);
    setMissedHighlights(next.missedHighlights || []);
    if (next.playgroundSheets) setPlaygroundSheets(next.playgroundSheets);
    if (next.activeSheetId) setActiveSheetId(next.activeSheetId);

    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setSelectedElement({ type: "none", id: "" });
  };

  // Persistence to LocalStorage
  const handleSaveToLocalStorage = () => {
    const localData = {
      walls,
      doors,
      windows,
      rooms,
      scale,
      projectTitle,
      clientName,
      contractorNotes,
      bgImages,
      dimensionLines,
      fixtures,
      missedHighlights,
      playgroundSheets,
      activeSheetId,
    };
    localStorage.setItem("blueprint_floorplan_saved", JSON.stringify(localData));
    triggerNotification("Progress saved locally!");
  };

  const handleLoadFromLocalStorage = () => {
    const saved = localStorage.getItem("blueprint_floorplan_saved");
    if (saved) {
      try {
        const loaded = JSON.parse(saved);
        saveHistoryState();
        setWalls(loaded.walls || []);
        setDoors(loaded.doors || []);
        setWindows(loaded.windows || []);
        setRooms(loaded.rooms || []);
        setScale(loaded.scale || { calibrated: false, pixelDistance: 1, physicalLength: 1, unit: "m" });
        setBgImages(loaded.bgImages || []);
        setDimensionLines(loaded.dimensionLines || []);
        setFixtures(loaded.fixtures || []);
        setMissedHighlights(loaded.missedHighlights || []);
        if (loaded.playgroundSheets?.length) {
          setPlaygroundSheets(loaded.playgroundSheets);
          setActiveSheetId(loaded.activeSheetId ?? DEFAULT_SHEET_ID);
          const active = loaded.playgroundSheets.find(
            (s: PlaygroundSheet) => s.id === (loaded.activeSheetId ?? DEFAULT_SHEET_ID)
          );
          if (active?.viewBox) {
            setPlaygroundView(normalizePlaygroundView(active.viewBox));
          }
        }
        if (loaded.projectTitle) setProjectTitle(loaded.projectTitle);
        if (loaded.clientName) setClientName(loaded.clientName);
        if (loaded.contractorNotes) setContractorNotes(loaded.contractorNotes);
        triggerNotification("Loaded saved progress successfully.");
      } catch (e) {
        triggerNotification("Could not load local data.", true);
      }
    } else {
      triggerNotification("No local saved blueprints found.", true);
    }
  };

  const triggerNotification = (text: string, isError = false) => {
    if (isError) {
      setApiError(text);
      setTimeout(() => setApiError(null), 4000);
    } else {
      setSuccessMessage(text);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  const collectPlaygroundContentPoints = (): Array<{ x: number; y: number }> => {
    const points: Array<{ x: number; y: number }> = [];
    sheetWalls.forEach((w) => {
      points.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
    });
    sheetDoors.forEach((d) => points.push({ x: d.x, y: d.y }));
    sheetWindows.forEach((w) => points.push({ x: w.x, y: w.y }));
    sheetFixtures.forEach((f) => points.push({ x: f.x, y: f.y }));
    sheetBgImages.forEach((bg) => points.push({ x: bg.x, y: bg.y }));
    return points;
  };

  const fitPlaygroundToContent = () => {
    const bounds = computeContentBounds(collectPlaygroundContentPoints());
    if (bounds) {
      setPlaygroundView(normalizePlaygroundView(fitViewBoxToBounds(bounds)));
    }
  };

  const zoomPlaygroundAtCenter = (zoomIn: boolean) => {
    setPlaygroundView((prev) => {
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      return normalizePlaygroundView(zoomViewBoxAtPoint(prev, cx, cy, zoomIn));
    });
  };

  // Convert screen coordinates to SVG playground space (respects zoom/pan viewBox)
  const getSvgCoordinates = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: playgroundView.x + ((e.clientX - rect.left) / rect.width) * playgroundView.w,
      y: playgroundView.y + ((e.clientY - rect.top) / rect.height) * playgroundView.h,
    };
  };

  useEffect(() => {
    if (!isCloudApiEnabled()) return;
    fetch(apiUrl("/api/health"))
      .then((r) => r.json())
      .then((health: { extractionReady?: boolean; provider?: string }) => {
        if (health.extractionReady === false) {
          triggerNotification(
            "AI extraction is not configured on the server. Set OPENROUTER_API_KEY or GEMINI_API_KEY on the Worker.",
            true
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const svg = el.querySelector("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setPlaygroundView((prev) => {
        const focusX = prev.x + ((e.clientX - rect.left) / rect.width) * prev.w;
        const focusY = prev.y + ((e.clientY - rect.top) / rect.height) * prev.h;
        return normalizePlaygroundView(
          zoomViewBoxAtPoint(prev, focusX, focusY, e.deltaY < 0)
        );
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!autoFitViewPending) return;
    const bounds = computeContentBounds(collectPlaygroundContentPoints());
    if (bounds) {
      const contentW = bounds.maxX - bounds.minX;
      const contentH = bounds.maxY - bounds.minY;
      const overflowsSheet =
        contentW > 880 ||
        contentH > 880 ||
        bounds.minX < 20 ||
        bounds.minY < 20 ||
        bounds.maxX > 980 ||
        bounds.maxY > 980;
      setPlaygroundView(
        overflowsSheet ? fitViewBoxToBounds(bounds) : DEFAULT_PLAYGROUND_VIEW
      );
    } else {
      setPlaygroundView(DEFAULT_PLAYGROUND_VIEW);
    }
    setAutoFitViewPending(false);
  }, [autoFitViewPending, sheetWalls, sheetDoors, sheetWindows, sheetFixtures, sheetBgImages]);

  useEffect(() => {
    if (!isPanningView) return;
    const onMove = (e: MouseEvent) => {
      const start = panViewStartRef.current;
      const container = canvasContainerRef.current;
      if (!start || !container) return;
      const svg = container.querySelector("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - start.clientX) / rect.width) * start.viewBox.w;
      const dy = ((e.clientY - start.clientY) / rect.height) * start.viewBox.h;
      setPlaygroundView(panViewBox(start.viewBox, dx, dy));
    };
    const onUp = () => {
      setIsPanningView(false);
      panViewStartRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isPanningView]);

  // Snap engine for grids & joints
  const getSnappedCoords = (x: number, y: number): { x: number; y: number; snapped: string } => {
    let finalX = Math.round(x);
    let finalY = Math.round(y);

    // 1. Joint Snapping (Very helpful for wall joints!)
    const JOINT_RADIUS = 20;
    for (const w of sheetWalls) {
      if (Math.hypot(w.x1 - x, w.y1 - y) < JOINT_RADIUS) {
        return { x: w.x1, y: w.y1, snapped: "joint" };
      }
      if (Math.hypot(w.x2 - x, w.y2 - y) < JOINT_RADIUS) {
        return { x: w.x2, y: w.y2, snapped: "joint" };
      }
    }

    // 2. Grid Snapping
    if (gridSnapping) {
      const GRID_BOX = 25;
      finalX = Math.round(finalX / GRID_BOX) * GRID_BOX;
      finalY = Math.round(finalY / GRID_BOX) * GRID_BOX;
      return { x: finalX, y: finalY, snapped: "grid" };
    }

    return { x: finalX, y: finalY, snapped: "none" };
  };

  // Compute wall distance
  const getWallLength = (w: { x1: number; y1: number; x2: number; y2: number }): number => {
    return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  };

  const getMetersPerPixelForWall = (w: { bgImageId?: string }): number | null => {
    if (w.bgImageId) {
      const bg = bgImages.find((b) => b.id === w.bgImageId);
      if (bg?.metersPerPixel) return bg.metersPerPixel;
    }
    if (scale.calibrated && scale.pixelDistance > 0) {
      return scale.physicalLength / scale.pixelDistance;
    }
    return null;
  };

  const getWallPhysicalLengthStr = (w: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    bgImageId?: string;
  }): string => {
    const pixelLen = getWallLength(w);
    const mPerPx = getMetersPerPixelForWall(w);
    if (mPerPx) {
      return `${(pixelLen * mPerPx).toFixed(2)} m`;
    }
    return `${Math.round(pixelLen)}px`;
  };

  const getRoomAreaStr = (room: Room): string => {
    if (room.estimatedAreaM2) {
      if (scale.calibrated) {
        const unit = scale.unit;
        let convertedArea = room.estimatedAreaM2;
        let unitLabel = "m²";
        
        if (unit === "cm") {
          convertedArea = room.estimatedAreaM2 * 10000;
          unitLabel = "cm²";
        } else if (unit === "ft") {
          convertedArea = room.estimatedAreaM2 * 10.763915;
          unitLabel = "sq ft";
        } else if (unit === "in") {
          convertedArea = room.estimatedAreaM2 * 1550.0031;
          unitLabel = "sq in";
        }
        
        return `${convertedArea.toFixed(1)} ${unitLabel}`;
      }
      return `${room.estimatedAreaM2.toFixed(1)} px²`;
    }
    return "Click to set size";
  };

  // Astronomical solar window-exposure calculation based on current compass setting
  const getFacingDirections = (orientation: "h" | "v") => {
    const angleUp = (0 - compassAngle + 360) % 360;
    const angleDown = (180 - compassAngle + 360) % 360;
    const angleRight = (90 - compassAngle + 360) % 360;
    const angleLeft = (270 - compassAngle + 360) % 360;

    const degreesToDirectionText = (deg: number) => {
      if (deg >= 337.5 || deg < 22.5) return "North (Indirect Stable Skylight)";
      if (deg >= 22.5 && deg < 67.5) return "North-East (Gentle Morning Sun)";
      if (deg >= 67.5 && deg < 112.5) return "East (Direct Morning Sun)";
      if (deg >= 112.5 && deg < 157.5) return "South-East (Bright Warm Skylight)";
      if (deg >= 157.5 && deg < 202.5) return "South (Intense All-Day Sun Exposure)";
      if (deg >= 202.5 && deg < 247.5) return "South-West (Warm Afternoon Sun)";
      if (deg >= 247.5 && deg < 292.5) return "West (Late Intense Afternoon Heat)";
      return "North-West (Cool Late Evening Skylight)";
    };

    if (orientation === "h") {
      return {
        sideA: `${angleUp.toFixed(0)}° - ${degreesToDirectionText(angleUp)}`,
        sideB: `${angleDown.toFixed(0)}° - ${degreesToDirectionText(angleDown)}`,
      };
    } else {
      return {
        sideA: `${angleRight.toFixed(0)}° - ${degreesToDirectionText(angleRight)}`,
        sideB: `${angleLeft.toFixed(0)}° - ${degreesToDirectionText(angleLeft)}`,
      };
    }
  };

  // Handles presets
  const handleLoadTemplate = (index: number) => {
    saveHistoryState();
    const t = templates[index].data;
    setWalls(t.walls);
    setDoors(t.doors);
    setWindows(t.windows);
    setRooms(t.rooms);
    setScale(t.scale);
    setSelectedElement({ type: "none", id: "" });
    triggerNotification(`Loaded template: "${templates[index].name}"`);
  };

  const persistImageToStorage = async (file: File, dataUrl: string): Promise<string> => {
    if (!isCloudApiEnabled()) {
      triggerNotification("R2 upload requires VITE_API_URL. Image kept in browser only.", true);
      return dataUrl;
    }
    try {
      const session = getUserSession();
      const result = await uploadImageToR2(file, dataUrl, session);
      triggerNotification(`Saved to R2: floorplan/${result.key}`);
      return result.url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      triggerNotification(`R2 upload failed (${msg}). Using local preview.`, true);
      return dataUrl;
    }
  };

  const handleClaimAccount = async () => {
    const tempId = getTempUserIdForClaim();
    if (!tempId) {
      triggerNotification("You already have a permanent account.", true);
      return;
    }
    const username = signupUsername.trim();
    if (!username) {
      triggerNotification("Enter a username to save your work permanently.", true);
      return;
    }

    setIsClaiming(true);
    try {
      const result = await claimTempAccount(tempId, username);
      const session = completeSignup(username);
      setUserSession(session);
      setSignupUsername("");
      triggerNotification(
        `Account claimed! Moved ${result.movedFiles} file(s) to floorplan/${session.r2Prefix}/`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      triggerNotification(msg, true);
    } finally {
      setIsClaiming(false);
    }
  };

  // Handles user file uploading & reading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === "string") {
        const imageUrl = await persistImageToStorage(file, reader.result);
        setUploadedImage(imageUrl);
        triggerNotification("Floorplan image uploaded successfully. You can now overlay and run the AI scanner!");
      }
    };
    reader.onerror = () => {
      triggerNotification("Failed to read image file.", true);
    };
    reader.readAsDataURL(file);
  };

  // Modern unified helper to load single/multiple images as LEGO tracing blocks
  const processFiles = (filesList: File[] | FileList) => {
    const files = Array.from(filesList);
    if (files.length === 0) return;

    saveHistoryState();
    const count = files.length;
    let loadedCount = 0;
    const addedBlocks: BgImageCard[] = [];

    files.forEach((file: File, index) => {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === "string") {
          const imageUrl = await persistImageToStorage(file, reader.result);
          const dims = await new Promise<{ w: number; h: number }>((resolve) => {
            const probe = new Image();
            probe.onload = () => {
              const aspect = probe.width / probe.height;
              const base = 380;
              resolve(
                aspect >= 1
                  ? { w: base, h: Math.round(base / aspect) }
                  : { w: Math.round(base * aspect), h: base }
              );
            };
            probe.onerror = () => resolve({ w: 380, h: 380 });
            probe.src = reader.result as string;
          });
          const newCard: BgImageCard = {
            id: `bg_img_${Date.now()}_${index}`,
            url: imageUrl,
            name: file.name.substring(0, file.name.lastIndexOf(".")) || `Room Segment ${bgImages.length + index + 1}`,
            x: 140 + (index % 2) * 420,
            y: 140 + Math.floor(index / 2) * 380,
            scale: 1,
            rotation: 0,
            width: dims.w,
            height: dims.h,
            windowFacing: "north",
            sheetId: activeSheetId,
          };
          
          addedBlocks.push(newCard);
          setBgImages((prev) => [...prev, newCard]);
          setSelectedBgId(newCard.id);
          setShowTracingImages(true);
          
          if (!uploadedImage) {
            setUploadedImage(imageUrl);
          }
          
          loadedCount++;
          if (loadedCount === count) {
            triggerNotification(
              `Added ${count} room image${count > 1 ? "s" : ""}. AI is reconstructing floor plans for each block...`
            );
            handleDigitizeAllBlocks(addedBlocks);
          }
        }
      };
      reader.onerror = () => {
        triggerNotification(`Failed to read file: ${file.name}`, true);
      };
      reader.readAsDataURL(file);
    });
  };

  // Handles multiple floorplan images (room blocks/sketches) arranged like lego pieces
  const handleMultipleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
  };

  // Drag and Drop event handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    
    const dataTransferFiles = e.dataTransfer?.files;
    if (dataTransferFiles && dataTransferFiles.length > 0) {
      const imageFiles: File[] = (Array.from(dataTransferFiles) as File[]).filter((file: File) => 
        file.type.startsWith("image/")
      );
      if (imageFiles.length > 0) {
        processFiles(imageFiles);
      } else {
        triggerNotification("Only image files (.png, .jpg, .webp, etc.) are supported as templates.", true);
      }
    }
  };

  const isBgImageCard = (value: unknown): value is BgImageCard =>
    Boolean(value && typeof value === "object" && "id" in value && "url" in value);

  const applyExtractionToCanvas = (parsedResult: FloorplanData, selectedBgObj: BgImageCard | null) => {
      let processedWalls: Wall[] = [];
      let processedDoors: Door[] = [];
      let processedWindows: WindowLayout[] = [];
      let processedRooms: Room[] = [];
      let processedFixtures: Fixture[] = [];

      if (selectedBgObj) {
        const bg = selectedBgObj;

        processedWalls = (parsedResult.walls || []).map((w, index) => {
          const p1 = mapImageLocalToCanvas(bg, w.x1, w.y1);
          const p2 = mapImageLocalToCanvas(bg, w.x2, w.y2);
          return {
            ...w,
            id: w.id || `ai_wall_${index}_${Date.now()}`,
            type: normalizeWallType(w.type),
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            bgImageId: bg.id,
            sheetId: activeSheetId,
          };
        });

        processedDoors = (parsedResult.doors || []).map((d, index) => {
          const p = mapImageLocalToCanvas(bg, d.x, d.y);
          return {
            ...d,
            id: d.id || `ai_door_${index}_${Date.now()}`,
            doorType: normalizeDoorType(d.doorType),
            orientation: normalizeOrientation(d.orientation),
            swing: normalizeSwing(d.swing),
            x: p.x,
            y: p.y,
            width: mapImageLocalToCanvasSize(bg, d.width || 60, true),
            bgImageId: bg.id,
            sheetId: activeSheetId,
          };
        });

        processedWindows = (parsedResult.windows || []).map((wn, index) => {
          const p = mapImageLocalToCanvas(bg, wn.x, wn.y);
          return {
            ...wn,
            id: wn.id || `ai_window_${index}_${Date.now()}`,
            windowType: normalizeWindowType(wn.windowType),
            orientation: normalizeOrientation(wn.orientation),
            x: p.x,
            y: p.y,
            width: mapImageLocalToCanvasSize(bg, wn.width || 80, true),
            bgImageId: bg.id,
            sheetId: activeSheetId,
          };
        });

        processedRooms = (parsedResult.rooms || []).map((r, index) => {
          const p = mapImageLocalToCanvas(bg, r.x, r.y);
          return {
            ...r,
            id: r.id || `ai_room_${index}_${Date.now()}`,
            x: p.x,
            y: p.y,
            estimatedWidthM: r.estimatedWidthM,
            estimatedDepthM: r.estimatedDepthM,
            bgImageId: bg.id,
            sheetId: activeSheetId,
          };
        });

        processedFixtures = (parsedResult.fixtures || []).map((f, index) => {
          const p = mapImageLocalToCanvas(bg, f.x, f.y);
          return {
            ...f,
            id: f.id || `ai_fixture_${index}_${Date.now()}`,
            x: p.x,
            y: p.y,
            width: mapImageLocalToCanvasSize(bg, f.width || 60, true),
            height: mapImageLocalToCanvasSize(bg, f.height || 60, false),
            rotation: normalizeFixtureRotation(f.rotation),
            label: f.label || f.type,
            bgImageId: bg.id,
            sheetId: activeSheetId,
          };
        });
      } else {
        // Helper to scale coordinates down to 50% size and center them inside the 1000x1000 viewport.
        // This maintains perfect geometric integrity while leaving ample room for other rooms/images to be placed!
        const scaleCoord = (v: number) => Math.round(v * 0.5 + 250);
        const scaleSize = (s: number) => Math.round(s * 0.5);

        // Ensure IDs exist and default scale structure is applied
        processedWalls = (parsedResult.walls || []).map((w, index) => ({
          ...w,
          id: w.id || `ai_wall_${index}_${Date.now()}`,
          type: normalizeWallType(w.type),
          x1: scaleCoord(w.x1),
          y1: scaleCoord(w.y1),
          x2: scaleCoord(w.x2),
          y2: scaleCoord(w.y2),
        }));

        processedDoors = (parsedResult.doors || []).map((d, index) => ({
          ...d,
          id: d.id || `ai_door_${index}_${Date.now()}`,
          doorType: normalizeDoorType(d.doorType),
          orientation: normalizeOrientation(d.orientation),
          swing: normalizeSwing(d.swing),
          x: scaleCoord(d.x),
          y: scaleCoord(d.y),
          width: scaleSize(d.width || 60),
        }));

        processedWindows = (parsedResult.windows || []).map((wn, index) => ({
          ...wn,
          id: wn.id || `ai_window_${index}_${Date.now()}`,
          windowType: normalizeWindowType(wn.windowType),
          orientation: normalizeOrientation(wn.orientation),
          x: scaleCoord(wn.x),
          y: scaleCoord(wn.y),
          width: scaleSize(wn.width || 80),
        }));

        processedRooms = (parsedResult.rooms || []).map((r, index) => ({
          ...r,
          id: r.id || `ai_room_${index}_${Date.now()}`,
          x: scaleCoord(r.x),
          y: scaleCoord(r.y),
        }));

        processedFixtures = (parsedResult.fixtures || []).map((f, index) => ({
          ...f,
          id: f.id || `ai_fixture_${index}_${Date.now()}`,
          x: scaleCoord(f.x),
          y: scaleCoord(f.y),
          width: scaleSize(f.width || 60),
          height: scaleSize(f.height || 60),
          rotation: f.rotation ?? 0,
        }));
      }

    let finalWalls = processedWalls;
    let finalDoors = processedDoors;
    let finalWindows = processedWindows;
    let finalRooms = processedRooms;
    let finalFixtures = processedFixtures;
    let roomScaleMeta:
      | { widthM: number; depthM: number; metersPerPixel: number; bgScale: number; bgX: number; bgY: number }
      | undefined;

    if (selectedBgObj && processedWalls.length > 0) {
      const bbox = getWallsBbox(processedWalls);
      const roomMeta = parsedResult.rooms?.[0];
      if (bbox) {
        const { widthM, depthM } = resolveRoomDimensionsM(
          roomMeta?.estimatedWidthM,
          roomMeta?.estimatedDepthM,
          roomMeta?.estimatedAreaM2,
          bbox
        );
        const scaled = scaleRoomGroupToRealWorld(
          processedWalls,
          processedDoors,
          processedWindows,
          processedRooms,
          processedFixtures,
          widthM,
          depthM,
          { x: selectedBgObj.x, y: selectedBgObj.y },
          selectedBgObj.scale
        );
        finalWalls = scaled.walls;
        finalDoors = scaled.doors;
        finalWindows = scaled.windows;
        finalRooms = scaled.rooms;
        finalFixtures = scaled.fixtures;
        roomScaleMeta = {
          widthM: scaled.widthM,
          depthM: scaled.depthM,
          metersPerPixel: scaled.metersPerPixel,
          bgScale: selectedBgObj.scale * scaled.bgScaleMultiplier,
          bgX: scaled.bgAnchor.x,
          bgY: scaled.bgAnchor.y,
        };
      }
    }

    setWalls((prev) => [...prev, ...finalWalls]);
    setDoors((prev) => [...prev, ...finalDoors]);
    setWindows((prev) => [...prev, ...finalWindows]);
    setRooms((prev) => [...prev, ...finalRooms]);
    if (finalFixtures.length > 0) {
      setFixtures((prev) => [...prev, ...finalFixtures]);
    }

    if (!scale.calibrated) {
      setScale({
        calibrated: true,
        pixelDistance: PLAYGROUND_PX_PER_M,
        physicalLength: 1,
        unit: "m",
      });
    }

    const fixtureCount = finalFixtures.length;
    const totalElements =
      finalWalls.length +
      finalDoors.length +
      finalWindows.length +
      finalRooms.length +
      fixtureCount;

    const summary = [
      `${finalWalls.length} walls`,
      `${finalDoors.length} doors`,
      `${finalWindows.length} windows`,
      `${finalRooms.length} rooms`,
      fixtureCount > 0 ? `${fixtureCount} fixtures` : null,
      roomScaleMeta ? `${roomScaleMeta.widthM}×${roomScaleMeta.depthM}m` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const detectedRoomName = parsedResult.rooms?.[0]?.name?.trim();

    return { totalElements, summary, detectedRoomName, roomScaleMeta };
  };

  const isNearExistingElement = (
    x: number,
    y: number,
    bgId: string,
    kind: "door" | "window" | "fixture",
    threshold = 45
  ) => {
    const dist = (ax: number, ay: number) => Math.hypot(ax - x, ay - y);
    if (kind === "door") {
      return doors.some((d) => d.bgImageId === bgId && dist(d.x, d.y) < threshold);
    }
    if (kind === "window") {
      return windows.some((w) => w.bgImageId === bgId && dist(w.x, w.y) < threshold);
    }
    return fixtures.some((f) => f.bgImageId === bgId && dist(f.x, f.y) < threshold);
  };

  const applyRefinementToCanvas = (
    parsedResult: FloorplanData,
    bg: BgImageCard
  ): { added: number; summary: string } => {
    const newDoors: Door[] = [];
    const newWindows: WindowLayout[] = [];
    const newFixtures: Fixture[] = [];

    (parsedResult.doors || []).forEach((d, index) => {
      const p = mapImageLocalToCanvas(bg, d.x, d.y);
      if (isNearExistingElement(p.x, p.y, bg.id, "door")) return;
      newDoors.push({
        ...d,
        id: d.id || `ai_door_ref_${index}_${Date.now()}`,
        doorType: normalizeDoorType(d.doorType),
        orientation: normalizeOrientation(d.orientation),
        swing: normalizeSwing(d.swing),
        x: p.x,
        y: p.y,
        width: mapImageLocalToCanvasSize(bg, d.width || 60, true),
        bgImageId: bg.id,
      });
    });

    (parsedResult.windows || []).forEach((wn, index) => {
      const p = mapImageLocalToCanvas(bg, wn.x, wn.y);
      if (isNearExistingElement(p.x, p.y, bg.id, "window")) return;
      newWindows.push({
        ...wn,
        id: wn.id || `ai_window_ref_${index}_${Date.now()}`,
        windowType: normalizeWindowType(wn.windowType),
        orientation: normalizeOrientation(wn.orientation),
        x: p.x,
        y: p.y,
        width: mapImageLocalToCanvasSize(bg, wn.width || 80, true),
        bgImageId: bg.id,
      });
    });

    (parsedResult.fixtures || []).forEach((f, index) => {
      const p = mapImageLocalToCanvas(bg, f.x, f.y);
      if (isNearExistingElement(p.x, p.y, bg.id, "fixture")) return;
      newFixtures.push({
        ...f,
        id: f.id || `ai_fixture_ref_${index}_${Date.now()}`,
        x: p.x,
        y: p.y,
        width: mapImageLocalToCanvasSize(bg, f.width || 60, true),
        height: mapImageLocalToCanvasSize(bg, f.height || 60, false),
        rotation: normalizeFixtureRotation(f.rotation),
        label: f.label || f.type,
        bgImageId: bg.id,
        sheetId: activeSheetId,
      });
    });

    if (newDoors.length > 0) setDoors((prev) => [...prev, ...newDoors]);
    if (newWindows.length > 0) setWindows((prev) => [...prev, ...newWindows]);
    if (newFixtures.length > 0) setFixtures((prev) => [...prev, ...newFixtures]);

    const added = newDoors.length + newWindows.length + newFixtures.length;
    const summary = [
      newDoors.length > 0 ? `${newDoors.length} door(s)` : null,
      newWindows.length > 0 ? `${newWindows.length} window(s)` : null,
      newFixtures.length > 0 ? `${newFixtures.length} fixture(s)` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return { added, summary };
  };

  const startRoomGroupDrag = (groupId: string, coords: { x: number; y: number }) => {
    const bg = bgImages.find((b) => b.id === groupId);
    if (!bg) return;
    setSelectedBgId(groupId);
    setSelectedElement({ type: "none", id: "" });
    setDraggingElement({
      type: "room_group",
      id: groupId,
      offsetX: bg.x - coords.x,
      offsetY: bg.y - coords.y,
    });
  };

  const finalizeBlockExtraction = (
    blockId: string,
    detectedRoomName?: string,
    roomScale?: { widthM: number; depthM: number; metersPerPixel: number; bgScale: number; bgX: number; bgY: number }
  ) => {
    const aiName = detectedRoomName?.trim();
    setShowTracingImages(true);
    setBgImages((prev) =>
      prev.map((bg) =>
        bg.id === blockId
          ? {
              ...bg,
              extracted: true,
              showReferencePhoto: true,
              ...(aiName ? { name: aiName } : {}),
              ...(roomScale
                ? {
                    roomWidthM: roomScale.widthM,
                    roomDepthM: roomScale.depthM,
                    metersPerPixel: roomScale.metersPerPixel,
                    scale: roomScale.bgScale,
                    x: roomScale.bgX,
                    y: roomScale.bgY,
                  }
                : {}),
            }
          : bg
      )
    );
    if (aiName) {
      setRooms((prev) =>
        prev.map((r) => (r.bgImageId === blockId ? { ...r, name: aiName } : r))
      );
    }
  };

  const extractSingleBlock = async (
    selectedBgObj: BgImageCard | null,
    sourceImage: string
  ): Promise<{ totalElements: number; summary: string }> => {
    const imagePayload = await resolveImageForApi(sourceImage);
    const facingHint = buildWindowFacingHint(selectedBgObj?.windowFacing ?? "north");
    const mergedContext = [additionalContext?.trim(), facingHint].filter(Boolean).join(" ");
    const response = await fetch(apiUrl("/api/convert-floorplan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imagePayload,
        additionalContext: mergedContext,
        roomLabel: selectedBgObj?.name,
        model: selectedModel,
        windowFacing: selectedBgObj?.windowFacing ?? "north",
      }),
    });

    if (!response.ok) {
      const errJson: { error?: string } = await response.json();
      throw new Error(errJson.error ?? "Failed to parse floorplan.");
    }

    const parsedResult: FloorplanData = await response.json();
    saveHistoryState();
    const result = applyExtractionToCanvas(parsedResult, selectedBgObj);
    if (selectedBgObj && result.totalElements > 0) {
      finalizeBlockExtraction(selectedBgObj.id, result.detectedRoomName, result.roomScaleMeta);
    }
    return result;
  };

  const handleRefineMissedHighlights = async () => {
    const bg = selectedBgId ? bgImages.find((b) => b.id === selectedBgId) : null;
    if (!bg?.extracted) {
      triggerNotification("Select an extracted room with highlights first.", true);
      return;
    }

    const roomHighlights = missedHighlights.filter((h) => h.bgImageId === bg.id);
    if (roomHighlights.length === 0) {
      triggerNotification("Draw highlight boxes over missed items on the reference photo first.", true);
      return;
    }

    const highlightRegions = roomHighlights.map((h) => {
      const p1 = mapCanvasToImageLocal(bg, h.x1, h.y1);
      const p2 = mapCanvasToImageLocal(bg, h.x2, h.y2);
      return {
        x1: Math.min(p1.x, p2.x),
        y1: Math.min(p1.y, p2.y),
        x2: Math.max(p1.x, p2.x),
        y2: Math.max(p1.y, p2.y),
        label: h.label,
      };
    });

    setIsConverting(true);
    setApiError(null);
    try {
      const imagePayload = await resolveImageForApi(bg.url);
      const response = await fetch(apiUrl("/api/convert-floorplan"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imagePayload,
          additionalContext: additionalContext,
          roomLabel: bg.name,
          model: selectedModel,
          highlightRegions,
        }),
      });

      if (!response.ok) {
        const errJson: { error?: string } = await response.json();
        throw new Error(errJson.error ?? "Failed to refine floorplan.");
      }

      const parsedResult: FloorplanData = await response.json();
      saveHistoryState();
      const { added, summary } = applyRefinementToCanvas(parsedResult, bg);
      if (added > 0) {
        setMissedHighlights((prev) => prev.filter((h) => h.bgImageId !== bg.id));
        setTool("select");
        triggerNotification(`Added missed items: ${summary}`);
      } else {
        triggerNotification("No new items found in highlighted regions. Try larger highlights or add manually.", true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refinement failed";
      setApiError(msg);
      triggerNotification(msg, true);
    } finally {
      setIsConverting(false);
    }
  };

  const resolveBgImageIdForPlacement = (coords: { x: number; y: number }): string | undefined => {
    if (selectedBgId) {
      const selected = bgImages.find((b) => b.id === selectedBgId);
      if (selected?.extracted) return selected.id;
    }
    for (let i = bgImages.length - 1; i >= 0; i--) {
      const bg = bgImages[i];
      if (!bg.extracted) continue;
      const bounds = getRoomGroupBounds(bg.id, walls, doors, windows, rooms, fixtures);
      if (bounds && isPointInRoomGroup(coords.x, coords.y, bounds)) {
        return bg.id;
      }
    }
    return undefined;
  };

  const handleDigitizeFloorplan = async (specificBgObj?: BgImageCard) => {
    const blockArg = isBgImageCard(specificBgObj) ? specificBgObj : undefined;
    const selectedBgObj =
      blockArg ?? (selectedBgId ? bgImages.find((bg) => bg.id === selectedBgId) : null);
    const sourceImage = selectedBgObj?.url ?? uploadedImage;

    if (!sourceImage) {
      triggerNotification("Upload room images first, or select a block to extract.", true);
      return;
    }

    setIsConverting(true);
    setApiError(null);
    setSuccessMessage(
      selectedBgObj
        ? `Reconstructing "${selectedBgObj.name}" with ${selectedModel}...`
        : `Reconstructing floor plan with ${selectedModel}...`
    );

    try {
      const { totalElements, summary } = await extractSingleBlock(selectedBgObj, sourceImage);

      if (totalElements === 0) {
        triggerNotification(
          `AI could not reconstruct a layout from "${selectedBgObj?.name ?? "this image"}". Try Gemini 2.5 Pro or GPT-4o, or add hints in Custom Architectural Hints.`,
          true
        );
        return;
      }

      triggerNotification(
        selectedBgObj
          ? `Extracted "${selectedBgObj.name}": ${summary}. Drag the room group on canvas to position it (Alt+drag to adjust one item).`
          : `Extraction complete: ${summary}. Move and combine elements in the playground.`
      );
    } catch (err: any) {
      console.error(err);
      triggerNotification(err.message || "AI could not parse this image. Try another model or edit manually.", true);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDigitizeAllBlocks = async (blocks?: BgImageCard[]) => {
    const targets = (blocks?.length ? blocks : bgImages).filter(
      (b) => (b.sheetId ?? DEFAULT_SHEET_ID) === activeSheetId
    );
    if (targets.length === 0) {
      triggerNotification("Upload one or more room images first.", true);
      return;
    }

    setIsConverting(true);
    setApiError(null);
    let successCount = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        const block = targets[i];
        setSelectedBgId(block.id);
        setSuccessMessage(`Extracting block ${i + 1}/${targets.length}: "${block.name}"...`);

        try {
          const { totalElements, summary } = await extractSingleBlock(block, block.url);
          if (totalElements > 0) {
            successCount++;
            triggerNotification(`Block ${i + 1}/${targets.length} "${block.name}": ${summary}`);
          } else {
            triggerNotification(`Block "${block.name}": no layout detected. Try a stronger model.`, true);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Extraction failed";
          triggerNotification(`Block "${block.name}" failed: ${msg}`, true);
        }
      }

      if (successCount > 0) {
        setAutoFitViewPending(true);
        triggerNotification(
          `Done: ${successCount}/${targets.length} block(s) extracted at scale ${DRAWING_SCALE_LABEL}. Pan/zoom as needed — add worksheets for other floors.`
        );
      }
    } finally {
      setIsConverting(false);
    }
  };

  // Mouse Interaction: clicking, dragging, elements placement
  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSvgCoordinates(e);
    const snapped = getSnappedCoords(coords.x, coords.y);

    // --- CALIBRATION MODE ---
    if (tool === "calibrate") {
      if (!calibrationPoint) {
        setCalibrationPoint({ x: coords.x, y: coords.y });
        triggerNotification("Click a second point on the floorplan to measure distance.");
      } else {
        // Open the precision calibration & dimension label popup
        setPendingDimension({
          x1: calibrationPoint.x,
          y1: calibrationPoint.y,
          x2: coords.x,
          y2: coords.y,
        });
        setDimLengthInput(calibrationValue);
        setDimNoteInput("");
        triggerNotification("Enter the actual dimension and optional note for this section.");
      }
      return;
    }

    // --- ADD WALL ENGINE ---
    if (tool === "add_wall") {
      saveHistoryState();
      if (!drawingWallStart) {
        setDrawingWallStart({ x: snapped.x, y: snapped.y });
      } else {
        // Finalize segment
        const newWall: Wall = {
          id: `wall_${Date.now()}`,
          x1: drawingWallStart.x,
          y1: drawingWallStart.y,
          x2: snapped.x,
          y2: snapped.y,
          type: selectedWallType,
          sheetId: activeSheetId,
        };
        setWalls((prev) => [...prev, newWall]);
        setDrawingWallStart(null); // End drawing
      }
      return;
    }

    // --- HIGHLIGHT MISSED ITEMS ---
    if (tool === "highlight_miss") {
      const bg = selectedBgId ? bgImages.find((b) => b.id === selectedBgId) : null;
      if (!bg?.extracted || bg.showReferencePhoto === false) {
        triggerNotification("Select an extracted room with reference photo visible.", true);
        return;
      }
      setDrawingHighlightStart({ x: coords.x, y: coords.y });
      return;
    }

    // --- ADD DOOR ENGINE ---
    if (tool === "add_door") {
      saveHistoryState();
      const doorDef = DOOR_ITEMS.find((d) => d.type === selectedDoorType) ?? DOOR_ITEMS[0];
      const linkedBgId = resolveBgImageIdForPlacement(snapped);
      const newDoor: Door = {
        id: `door_${Date.now()}`,
        x: snapped.x,
        y: snapped.y,
        width: doorDef.defaultWidth,
        orientation: "h",
        swing: "n",
        doorType: selectedDoorType,
        ...(linkedBgId ? { bgImageId: linkedBgId } : {}),
        sheetId: activeSheetId,
      };
      setDoors((prev) => [...prev, newDoor]);
      setSelectedElement({ type: "door", id: newDoor.id });
      setTool("select");
      return;
    }

    // --- ADD WINDOW ENGINE ---
    if (tool === "add_window") {
      saveHistoryState();
      const winDef = WINDOW_ITEMS.find((w) => w.type === selectedWindowType) ?? WINDOW_ITEMS[0];
      const linkedBgId = resolveBgImageIdForPlacement(snapped);
      const newWin: WindowLayout = {
        id: `win_${Date.now()}`,
        x: snapped.x,
        y: snapped.y,
        width: winDef.defaultWidth,
        orientation: "h",
        windowType: selectedWindowType,
        ...(linkedBgId ? { bgImageId: linkedBgId } : {}),
        sheetId: activeSheetId,
      };
      setWindows((prev) => [...prev, newWin]);
      setSelectedElement({ type: "window", id: newWin.id });
      setTool("select");
      return;
    }

    // --- ADD ROOM ZONE ENGINE ---
    if (tool === "add_room") {
      saveHistoryState();
      const newRoom: Room = {
        id: `room_${Date.now()}`,
        name: "New Room",
        x: snapped.x,
        y: snapped.y,
        estimatedAreaM2: 12.0,
        sheetId: activeSheetId,
      };
      setRooms((prev) => [...prev, newRoom]);
      setSelectedElement({ type: "room", id: newRoom.id });
      setTool("select");
      return;
    }

    // --- ADD FIXTURE ENGINE ---
    if (tool === "add_fixture") {
      saveHistoryState();
      const sizeDef = getFixtureDefaultSize(selectedFixtureType);
      const newFixture: Fixture = {
        id: `fixture_${Date.now()}`,
        type: selectedFixtureType,
        x: snapped.x,
        y: snapped.y,
        width: sizeDef.w,
        height: sizeDef.h,
        rotation: 0,
        sheetId: activeSheetId,
      };
      setFixtures((prev) => [...prev, newFixture]);
      setSelectedElement({ type: "fixture", id: newFixture.id });
      setTool("select");
      return;
    }

    // --- SELECT / INTERACTION MODE ---
    if (tool === "select") {
      // Shift+click/drag on an element moves the whole room group; normal click edits that element
      const wantGroupDrag = e.shiftKey;

      // 1. Wall joints — always editable, even inside a room group
      const jointRadius = 15;
      for (const w of sheetWalls) {
        if (Math.hypot(w.x1 - coords.x, w.y1 - coords.y) < jointRadius) {
          setDraggingJoint({ x: w.x1, y: w.y1, originalX: w.x1, originalY: w.y1 });
          return;
        }
        if (Math.hypot(w.x2 - coords.x, w.y2 - coords.y) < jointRadius) {
          setDraggingJoint({ x: w.x2, y: w.y2, originalX: w.x2, originalY: w.y2 });
          return;
        }
      }

      // 2. Check if clicked on a Door
      for (const d of sheetDoors) {
        if (Math.hypot(d.x - coords.x, d.y - coords.y) < 25) {
          if (d.bgImageId && wantGroupDrag) {
            saveHistoryState();
            startRoomGroupDrag(d.bgImageId, coords);
            return;
          }
          setSelectedElement({ type: "door", id: d.id });
          setDraggingElement({
            type: "door",
            id: d.id,
            offsetX: d.x - coords.x,
            offsetY: d.y - coords.y,
          });
          return;
        }
      }

      // 3. Check if clicked on a Window
      for (const wn of sheetWindows) {
        if (Math.hypot(wn.x - coords.x, wn.y - coords.y) < 25) {
          if (wn.bgImageId && wantGroupDrag) {
            saveHistoryState();
            startRoomGroupDrag(wn.bgImageId, coords);
            return;
          }
          setSelectedElement({ type: "window", id: wn.id });
          setDraggingElement({
            type: "window",
            id: wn.id,
            offsetX: wn.x - coords.x,
            offsetY: wn.y - coords.y,
          });
          return;
        }
      }

      // 4. Check if clicked on a Room Label
      for (const r of sheetRooms) {
        if (Math.hypot(r.x - coords.x, r.y - coords.y) < 30) {
          if (r.bgImageId && wantGroupDrag) {
            saveHistoryState();
            startRoomGroupDrag(r.bgImageId, coords);
            return;
          }
          setSelectedElement({ type: "room", id: r.id });
          setDraggingElement({
            type: "room",
            id: r.id,
            offsetX: r.x - coords.x,
            offsetY: r.y - coords.y,
          });
          return;
        }
      }

      // 4b. Fixture stamps — always individually editable (drag / rotate / scale)
      for (const f of sheetFixtures) {
        const halfW = f.width / 2;
        const halfH = f.height / 2;
        const { lx, ly } = getFixtureLocalCoords(f, coords.x, coords.y);

        const isSelected = selectedElement.type === "fixture" && selectedElement.id === f.id;
        if (isSelected) {
          if (Math.hypot(lx, ly + halfH + 22) < 16) {
            saveHistoryState();
            setSelectedElement({ type: "fixture", id: f.id });
            setDraggingElement({ type: "fixture_rotate", id: f.id });
            return;
          }
          if (Math.hypot(lx - halfW, ly - halfH) < 16) {
            saveHistoryState();
            setSelectedElement({ type: "fixture", id: f.id });
            setDraggingElement({
              type: "fixture_scale",
              id: f.id,
              startWidth: f.width,
              startHeight: f.height,
            });
            return;
          }
        }

        if (!isPointInFixture(f, coords.x, coords.y)) continue;

        if (f.bgImageId && wantGroupDrag) {
          saveHistoryState();
          startRoomGroupDrag(f.bgImageId, coords);
          return;
        }

        saveHistoryState();
        setSelectedElement({ type: "fixture", id: f.id });
        setDraggingElement({
          type: "fixture",
          id: f.id,
          offsetX: f.x - coords.x,
          offsetY: f.y - coords.y,
        });
        return;
      }

      // 5. Check if clicked on a Wall Line segment direct (to select for styling or deleted)
      for (const w of sheetWalls) {
        // Calculate point-to-line segment distance
        const len = getWallLength(w);
        if (len === 0) continue;
        const u = ((coords.x - w.x1) * (w.x2 - w.x1) + (coords.y - w.y1) * (w.y2 - w.y1)) / (len * len);
        if (u >= 0 && u <= 1) {
          const px = w.x1 + u * (w.x2 - w.x1);
          const py = w.y1 + u * (w.y2 - w.y1);
          const dist = Math.hypot(coords.x - px, coords.y - py);
          if (dist < 12) {
            if (w.bgImageId && wantGroupDrag) {
              saveHistoryState();
              startRoomGroupDrag(w.bgImageId, coords);
              return;
            }
            setSelectedElement({ type: "wall", id: w.id });
            return;
          }
        }
      }

      // 6. Background tracing block or extracted room group anchor
      for (let i = sheetBgImages.length - 1; i >= 0; i--) {
        const bg = sheetBgImages[i];
        if (bg.extracted) {
          const bounds = getRoomGroupBounds(bg.id, sheetWalls, sheetDoors, sheetWindows, sheetRooms, sheetFixtures);
          if (bounds && isPointInRoomGroup(coords.x, coords.y, bounds, 28)) {
            saveHistoryState();
            startRoomGroupDrag(bg.id, coords);
            return;
          }
          continue;
        }
        const halfW = (bg.width * bg.scale) / 2;
        const halfH = (bg.height * bg.scale) / 2;
        if (
          coords.x >= bg.x - halfW &&
          coords.x <= bg.x + halfW &&
          coords.y >= bg.y - halfH &&
          coords.y <= bg.y + halfH
        ) {
          setSelectedBgId(bg.id);
          setSelectedElement({ type: "none", id: "" });
          setDraggingElement({
            type: "bg_image",
            id: bg.id,
            offsetX: bg.x - coords.x,
            offsetY: bg.y - coords.y,
          });
          triggerNotification(`Tracing Block selected: "${bg.name}". Drag to fit or rotate.`);
          return;
        }
      }

      // 7. Empty space inside an extracted room group → move the whole group
      for (let i = bgImages.length - 1; i >= 0; i--) {
        const bg = bgImages[i];
        if (!bg.extracted) continue;
        const bounds = getRoomGroupBounds(bg.id, walls, doors, windows, rooms, fixtures);
        if (bounds && isPointInRoomGroup(coords.x, coords.y, bounds)) {
          saveHistoryState();
          startRoomGroupDrag(bg.id, coords);
          return;
        }
      }

      // Clear selections if clicked blank workspace
      setSelectedElement({ type: "none", id: "" });
      setSelectedBgId(null);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSvgCoordinates(e);
    setTempMousePos(coords);

    // If dragging wall-joint
    if (draggingJoint) {
      const snapped = getSnappedCoords(coords.x, coords.y);
      
      // Update all walls sharing original coordinates in state
      setWalls((prev) =>
        prev.map((w) => {
          let updated = { ...w };
          if (w.x1 === draggingJoint.x && w.y1 === draggingJoint.y) {
            updated.x1 = snapped.x;
            updated.y1 = snapped.y;
          }
          if (w.x2 === draggingJoint.x && w.y2 === draggingJoint.y) {
            updated.x2 = snapped.x;
            updated.y2 = snapped.y;
          }
          return updated;
        })
      );

      // Keep dragging joint state updated so we can continue tracking on mousemove
      setDraggingJoint({
        x: snapped.x,
        y: snapped.y,
        originalX: draggingJoint.originalX,
        originalY: draggingJoint.originalY,
      });
      return;
    }

    // If dragging an element (Door, Window, Room, BgImage)
    if (draggingElement) {
      const targetX = coords.x + draggingElement.offsetX;
      const targetY = coords.y + draggingElement.offsetY;
      const snapped = getSnappedCoords(targetX, targetY);

      if (draggingElement.type === "door") {
        setDoors((prev) =>
          prev.map((d) => (d.id === draggingElement.id ? { ...d, x: snapped.x, y: snapped.y } : d))
        );
      } else if (draggingElement.type === "window") {
        setWindows((prev) =>
          prev.map((w) => (w.id === draggingElement.id ? { ...w, x: snapped.x, y: snapped.y } : w))
        );
      } else if (draggingElement.type === "room") {
        setRooms((prev) =>
          prev.map((r) => (r.id === draggingElement.id ? { ...r, x: snapped.x, y: snapped.y } : r))
        );
      } else if (draggingElement.type === "bg_image" || draggingElement.type === "room_group") {
        const bg = bgImages.find((b) => b.id === draggingElement.id);
        if (bg) {
          const newX = Math.round(targetX);
          const newY = Math.round(targetY);
          const dx = newX - bg.x;
          const dy = newY - bg.y;
          if (dx !== 0 || dy !== 0) {
            shiftGroupedElements(bg.id, dx, dy);
            setBgImages((prev) =>
              prev.map((b) => (b.id === bg.id ? { ...b, x: newX, y: newY } : b))
            );
          }
        }
      } else if (draggingElement.type === "fixture") {
        setFixtures((prev) =>
          prev.map((f) => (f.id === draggingElement.id ? { ...f, x: snapped.x, y: snapped.y } : f))
        );
      } else if (draggingElement.type === "fixture_rotate") {
        const f = fixtures.find((x) => x.id === draggingElement.id);
        if (f) {
          const dx = coords.x - f.x;
          const dy = coords.y - f.y;
          const angle = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
          setFixtures((prev) =>
            prev.map((x) => (x.id === f.id ? { ...x, rotation: angle } : x))
          );
        }
      } else if (draggingElement.type === "fixture_scale") {
        const f = fixtures.find((x) => x.id === draggingElement.id);
        if (f) {
          const dx = coords.x - f.x;
          const dy = coords.y - f.y;
          const rad = -((f.rotation || 0) * Math.PI) / 180;
          const lx = Math.abs(dx * Math.cos(rad) - dy * Math.sin(rad));
          const ly = Math.abs(dx * Math.sin(rad) + dy * Math.cos(rad));
          setFixtures((prev) =>
            prev.map((x) =>
              x.id === f.id
                ? { ...x, width: Math.max(20, Math.round(lx * 2)), height: Math.max(20, Math.round(ly * 2)) }
                : x
            )
          );
        }
      }
    }
  };

  const handleCanvasMouseUp = () => {
    if (drawingHighlightStart && tool === "highlight_miss" && tempMousePos) {
      const w = Math.abs(tempMousePos.x - drawingHighlightStart.x);
      const h = Math.abs(tempMousePos.y - drawingHighlightStart.y);
      if (w > 10 && h > 10 && selectedBgId) {
        saveHistoryState();
        setMissedHighlights((prev) => [
          ...prev,
          {
            id: `hl_${Date.now()}`,
            bgImageId: selectedBgId,
            x1: drawingHighlightStart.x,
            y1: drawingHighlightStart.y,
            x2: tempMousePos.x,
            y2: tempMousePos.y,
            label: highlightItemType,
            sheetId: activeSheetId,
          },
        ]);
        triggerNotification(`Highlighted ${highlightItemType} region — draw more or run AI refine.`);
      }
      setDrawingHighlightStart(null);
      return;
    }

    if (draggingJoint) {
      // Done moving sharing wall joint, store into history
      saveHistoryState();
      
      // Normalize wall joints to match exactly (remove potential tiny micro-offsets)
      setWalls((prev) => {
        return prev.map((w) => ({
          ...w,
          x1: Math.round(w.x1),
          y1: Math.round(w.y1),
          x2: Math.round(w.x2),
          y2: Math.round(w.y2),
        }));
      });

      setDraggingJoint(null);
    }
    if (draggingElement) {
      saveHistoryState();
      setDraggingElement(null);
    }
  };

  // Keyboard binding for quick deletes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Make sure we aren't deleting while user is typing in a text field
        const activeElem = document.activeElement;
        const isInputField = activeElem && (activeElem.tagName === "INPUT" || activeElem.tagName === "TEXTAREA");
        if (!isInputField) {
          handleDeleteSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElement, walls, doors, windows, rooms, fixtures]);

  // Auto switch sidebar tab to 'properties' when layout element is selected on canvas
  useEffect(() => {
    if (selectedElement.type !== "none") {
      setSidebarTab("properties");
    }
  }, [selectedElement.id, selectedElement.type]);

  const handleDeleteSelected = () => {
    if (selectedElement.type === "none") return;
    saveHistoryState();

    if (selectedElement.type === "wall") {
      setWalls((prev) => prev.filter((w) => w.id !== selectedElement.id));
    } else if (selectedElement.type === "door") {
      setDoors((prev) => prev.filter((d) => d.id !== selectedElement.id));
    } else if (selectedElement.type === "window") {
      setWindows((prev) => prev.filter((wn) => wn.id !== selectedElement.id));
    } else if (selectedElement.type === "room") {
      setRooms((prev) => prev.filter((r) => r.id !== selectedElement.id));
    } else if (selectedElement.type === "dimension") {
      setDimensionLines((prev) => prev.filter((d) => d.id !== selectedElement.id));
    } else if (selectedElement.type === "fixture") {
      setFixtures((prev) => prev.filter((f) => f.id !== selectedElement.id));
    }

    setSelectedElement({ type: "none", id: "" });
    triggerNotification("Selected architectural element deleted.");
  };

  // Updates for selected details properties (Sidebar panels)
  const getSelectedDetails = () => {
    if (selectedElement.type === "none") return null;
    
    if (selectedElement.type === "wall") {
      return walls.find((w) => w.id === selectedElement.id);
    }
    if (selectedElement.type === "door") {
      return doors.find((d) => d.id === selectedElement.id);
    }
    if (selectedElement.type === "window") {
      return windows.find((wn) => wn.id === selectedElement.id);
    }
    if (selectedElement.type === "room") {
      return rooms.find((r) => r.id === selectedElement.id);
    }
    if (selectedElement.type === "dimension") {
      return dimensionLines.find((d) => d.id === selectedElement.id);
    }
    if (selectedElement.type === "fixture") {
      return fixtures.find((f) => f.id === selectedElement.id);
    }
    return null;
  };

  const updateSelectedWall = (fields: Partial<Wall>) => {
    setWalls((prev) =>
      prev.map((w) => (w.id === selectedElement.id ? { ...w, ...fields } : w))
    );
  };

  const updateSelectedDoor = (fields: Partial<Door>) => {
    setDoors((prev) =>
      prev.map((d) => (d.id === selectedElement.id ? { ...d, ...fields } : d))
    );
  };

  const updateSelectedWindow = (fields: Partial<WindowLayout>) => {
    setWindows((prev) =>
      prev.map((wn) => (wn.id === selectedElement.id ? { ...wn, ...fields } : wn))
    );
  };

  const updateSelectedRoom = (fields: Partial<Room>) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === selectedElement.id ? { ...r, ...fields } : r))
    );
  };

  const updateSelectedFixture = (fields: Partial<Fixture>) => {
    setFixtures((prev) =>
      prev.map((f) => (f.id === selectedElement.id ? { ...f, ...fields } : f))
    );
  };

  // Nudge selection positioning modifiers (for fine adjustments)
  const nudgeSelectedElement = (dx: number, dy: number) => {
    saveHistoryState();
    if (selectedElement.type === "door") {
      const d = doors.find((x) => x.id === selectedElement.id);
      if (d) updateSelectedDoor({ x: d.x + dx, y: d.y + dy });
    } else if (selectedElement.type === "window") {
      const w = windows.find((x) => x.id === selectedElement.id);
      if (w) updateSelectedWindow({ x: w.x + dx, y: w.y + dy });
    } else if (selectedElement.type === "room") {
      const r = rooms.find((x) => x.id === selectedElement.id);
      if (r) updateSelectedRoom({ x: r.x + dx, y: r.y + dy });
    } else if (selectedElement.type === "wall") {
      const w = walls.find((x) => x.id === selectedElement.id);
      if (w) updateSelectedWall({ x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
    } else if (selectedElement.type === "dimension") {
      setDimensionLines((prev) =>
        prev.map((d) => (d.id === selectedElement.id ? { ...d, x1: d.x1 + dx, y1: d.y1 + dy, x2: d.x2 + dx, y2: d.y2 + dy } : d))
      );
    } else if (selectedElement.type === "fixture") {
      const f = fixtures.find((x) => x.id === selectedElement.id);
      if (f) updateSelectedFixture({ x: f.x + dx, y: f.y + dy });
    }
  };

  // Synchronized transform helper functions for aligned vector groups
  const shiftGroupedElements = (bgId: string, dx: number, dy: number) => {
    setWalls((prev) => prev.map((w) => w.bgImageId === bgId ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy } : w));
    setDoors((prev) => prev.map((d) => d.bgImageId === bgId ? { ...d, x: d.x + dx, y: d.y + dy } : d));
    setWindows((prev) => prev.map((w) => w.bgImageId === bgId ? { ...w, x: w.x + dx, y: w.y + dy } : w));
    setRooms((prev) => prev.map((r) => r.bgImageId === bgId ? { ...r, x: r.x + dx, y: r.y + dy } : r));
    setDimensionLines((prev) => prev.map((dl) => dl.bgImageId === bgId ? { ...dl, x1: dl.x1 + dx, y1: dl.y1 + dy, x2: dl.x2 + dx, y2: dl.y2 + dy } : dl));
    setFixtures((prev) => prev.map((f) => f.bgImageId === bgId ? { ...f, x: f.x + dx, y: f.y + dy } : f));
    setMissedHighlights((prev) =>
      prev.map((h) =>
        h.bgImageId === bgId
          ? { ...h, x1: h.x1 + dx, y1: h.y1 + dy, x2: h.x2 + dx, y2: h.y2 + dy }
          : h
      )
    );
  };

  const rotateGroupedElements = (bgId: string, center: { x: number; y: number }, dThetaDeg: number) => {
    if (dThetaDeg === 0) return;
    const rad = (dThetaDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const rotPoint = (px: number, py: number) => {
      const dx = px - center.x;
      const dy = py - center.y;
      return {
        x: Math.round(center.x + dx * cos - dy * sin),
        y: Math.round(center.y + dx * sin + dy * cos),
      };
    };
    
    setWalls((prev) => prev.map((w) => {
      if (w.bgImageId !== bgId) return w;
      const p1 = rotPoint(w.x1, w.y1);
      const p2 = rotPoint(w.x2, w.y2);
      return { ...w, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }));
    setDoors((prev) => prev.map((d) => {
      if (d.bgImageId !== bgId) return d;
      const p = rotPoint(d.x, d.y);
      return { ...d, x: p.x, y: p.y };
    }));
    setWindows((prev) => prev.map((w) => {
      if (w.bgImageId !== bgId) return w;
      const p = rotPoint(w.x, w.y);
      return { ...w, x: p.x, y: p.y };
    }));
    setRooms((prev) => prev.map((r) => {
      if (r.bgImageId !== bgId) return r;
      const p = rotPoint(r.x, r.y);
      return { ...r, x: p.x, y: p.y };
    }));
    setDimensionLines((prev) => prev.map((dl) => {
      if (dl.bgImageId !== bgId) return dl;
      const p1 = rotPoint(dl.x1, dl.y1);
      const p2 = rotPoint(dl.x2, dl.y2);
      return { ...dl, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }));
    setFixtures((prev) => prev.map((f) => {
      if (f.bgImageId !== bgId) return f;
      const p = rotPoint(f.x, f.y);
      return { ...f, x: p.x, y: p.y, rotation: ((f.rotation || 0) + dThetaDeg + 360) % 360 };
    }));
    setMissedHighlights((prev) =>
      prev.map((h) => {
        if (h.bgImageId !== bgId) return h;
        const p1 = rotPoint(h.x1, h.y1);
        const p2 = rotPoint(h.x2, h.y2);
        return { ...h, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      })
    );
  };

  const rotatePointAround = (
    px: number,
    py: number,
    pivot: { x: number; y: number },
    dThetaDeg: number
  ) => {
    const rad = (dThetaDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = px - pivot.x;
    const dy = py - pivot.y;
    return {
      x: Math.round(pivot.x + dx * cos - dy * sin),
      y: Math.round(pivot.y + dx * sin + dy * cos),
    };
  };

  const getRoomGroupPivot = (bg: BgImageCard): { x: number; y: number } => {
    if (bg.extracted) {
      const bounds = getRoomGroupBounds(bg.id, walls, doors, windows, rooms, fixtures);
      if (bounds) return { x: bounds.cx, y: bounds.cy };
    }
    return { x: bg.x, y: bg.y };
  };

  const rotateRoomGroupBy = (deltaDeg: number) => {
    if (!selectedBgId || deltaDeg === 0) return;
    const bg = bgImages.find((b) => b.id === selectedBgId);
    if (!bg) return;
    saveHistoryState();
    const newRotation = ((bg.rotation + deltaDeg) % 360 + 360) % 360;
    updateSelectedBgImage({ rotation: newRotation });
  };

  const scaleGroupedElements = (bgId: string, center: { x: number; y: number }, scaleFactor: number) => {
    if (scaleFactor === 1) return;
    
    const scalePoint = (px: number, py: number) => {
      const dx = px - center.x;
      const dy = py - center.y;
      return {
        x: Math.round(center.x + dx * scaleFactor),
        y: Math.round(center.y + dy * scaleFactor),
      };
    };
    
    setWalls((prev) => prev.map((w) => {
      if (w.bgImageId !== bgId) return w;
      const p1 = scalePoint(w.x1, w.y1);
      const p2 = scalePoint(w.x2, w.y2);
      return { ...w, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }));
    setDoors((prev) => prev.map((d) => {
      if (d.bgImageId !== bgId) return d;
      const p = scalePoint(d.x, d.y);
      return { ...d, x: p.x, y: p.y, width: Math.round(d.width * scaleFactor) };
    }));
    setWindows((prev) => prev.map((w) => {
      if (w.bgImageId !== bgId) return w;
      const p = scalePoint(w.x, w.y);
      return { ...w, x: p.x, y: p.y, width: Math.round(w.width * scaleFactor) };
    }));
    setRooms((prev) => prev.map((r) => {
      if (r.bgImageId !== bgId) return r;
      const p = scalePoint(r.x, r.y);
      return { ...r, x: p.x, y: p.y };
    }));
    setDimensionLines((prev) => prev.map((dl) => {
      if (dl.bgImageId !== bgId) return dl;
      const p1 = scalePoint(dl.x1, dl.y1);
      const p2 = scalePoint(dl.x2, dl.y2);
      return { ...dl, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }));
    setFixtures((prev) => prev.map((f) => {
      if (f.bgImageId !== bgId) return f;
      const p = scalePoint(f.x, f.y);
      return { ...f, x: p.x, y: p.y, width: Math.round(f.width * scaleFactor), height: Math.round(f.height * scaleFactor) };
    }));
  };

  // Mutators for Lego block tracing sheets
  const updateSelectedBgImage = (fields: Partial<BgImageCard>) => {
    if (!selectedBgId) return;
    const currentBg = bgImages.find((bg) => bg.id === selectedBgId);
    if (currentBg) {
      // 1. Shift positional changes
      if (fields.x !== undefined || fields.y !== undefined) {
        const dx = fields.x !== undefined ? fields.x - currentBg.x : 0;
        const dy = fields.y !== undefined ? fields.y - currentBg.y : 0;
        if (dx !== 0 || dy !== 0) {
          shiftGroupedElements(selectedBgId, dx, dy);
        }
      }
      
      // 2. Rotational changes — pivot at room center for extracted groups
      if (fields.rotation !== undefined) {
        const dTheta = fields.rotation - currentBg.rotation;
        if (dTheta !== 0) {
          const pivot = getRoomGroupPivot(currentBg);
          rotateGroupedElements(selectedBgId, pivot, dTheta);
          if (currentBg.extracted) {
            const newAnchor = rotatePointAround(currentBg.x, currentBg.y, pivot, dTheta);
            fields.x = newAnchor.x;
            fields.y = newAnchor.y;
          }
        }
      }
      
      // 3. Scaling changes
      if (fields.scale !== undefined) {
        const factor = fields.scale / currentBg.scale;
        if (factor !== 1) {
          scaleGroupedElements(selectedBgId, { x: currentBg.x, y: currentBg.y }, factor);
        }
      }
    }
    setBgImages((prev) =>
      prev.map((bg) => (bg.id === selectedBgId ? { ...bg, ...fields } : bg))
    );
    if (fields.name && selectedBgId) {
      setRooms((prev) =>
        prev.map((r) => (r.bgImageId === selectedBgId ? { ...r, name: fields.name! } : r))
      );
    }
  };

  const nudgeSelectedBgImage = (dx: number, dy: number) => {
    if (!selectedBgId) return;
    saveHistoryState();
    const bg = bgImages.find((b) => b.id === selectedBgId);
    if (bg) {
      updateSelectedBgImage({ x: bg.x + dx, y: bg.y + dy });
    }
  };

  // Trigger Drawio local download builder
  const handleExportDrawio = () => {
    const xml = generateDrawioXmlMarkup();
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectTitle.toLowerCase().replace(/[^a-z0-9]/g, "_")}_floorplan.drawio`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerNotification("Draw.io diagram XML generated & downloaded! Drag-n-drop file into Draw.io to edit.");
  };

  // Generate Draw.io formatted XML
  const generateDrawioXmlMarkup = (): string => {
    let cellsXml = "";

    // Layers
    cellsXml += `      <mxCell id="0" />\n`;
    cellsXml += `      <mxCell id="1" parent="0" />\n`;

    // 1. Export walls (as styled solid connector lines)
    walls.forEach((wall) => {
      const thickness = wall.type === "exterior" ? 12 : 6;
      const strokeColor = wall.type === "exterior" ? "#0F172A" : "#64748B";
      cellsXml += `      <mxCell id="w_${wall.id}" value="" style="endArrow=none;html=1;strokeWidth=${thickness};strokeColor=${strokeColor};" edge="1" parent="1">\n`;
      cellsXml += `        <mxGeometry width="50" height="50" relative="1" as="geometry">\n`;
      cellsXml += `          <mxPoint x="${wall.x1}" y="${wall.y1}" as="sourcePoint" />\n`;
      cellsXml += `          <mxPoint x="${wall.x2}" y="${wall.y2}" as="targetPoint" />\n`;
      cellsXml += `        </mxGeometry>\n`;
      cellsXml += `      </mxCell>\n`;
    });

    // 2. Export doors (as visual box hinges)
    doors.forEach((door) => {
      const size = door.width;
      const wVal = door.orientation === "h" ? size : 15;
      const hVal = door.orientation === "v" ? size : 15;
      const posX = door.x - wVal / 2;
      const posY = door.y - hVal / 2;
      cellsXml += `      <mxCell id="d_${door.id}" value="🚪 Door (Swing)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFEBEF;strokeColor=#E11D48;strokeWidth=2;fontSize=9;fontColor=#B91C1C;verticalAlign=middle;" vertex="1" parent="1">\n`;
      cellsXml += `        <mxGeometry x="${posX}" y="${posY}" width="${wVal}" height="${hVal}" as="geometry" />\n`;
      cellsXml += `      </mxCell>\n`;
    });

    // 3. Export windows (as visual blocks)
    windows.forEach((win) => {
      const size = win.width;
      const wVal = win.orientation === "h" ? size : 12;
      const hVal = win.orientation === "v" ? size : 12;
      const posX = win.x - wVal / 2;
      const posY = win.y - hVal / 2;
      cellsXml += `      <mxCell id="wn_${win.id}" value="🪟 Window" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#E0F2FE;strokeColor=#0284C7;strokeWidth=2;fontSize=9;fontColor=#0369A1;verticalAlign=middle;" vertex="1" parent="1">\n`;
      cellsXml += `        <mxGeometry x="${posX}" y="${posY}" width="${wVal}" height="${hVal}" as="geometry" />\n`;
      cellsXml += `      </mxCell>\n`;
    });

    // 4. Export Rooms text labels
    rooms.forEach((room) => {
      let areaText = "";
      if (scale.calibrated && room.estimatedAreaM2) {
        areaText = `\\n[Area: ${room.estimatedAreaM2.toFixed(1)} ${scale.unit === "m" ? "m²" : "sq ft"}]`;
      }
      const label = `${room.name}${areaText}`;

      cellsXml += `      <mxCell id="r_${room.id}" value="${label}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;fontStyle=1;fontSize=13;fontColor=#0F172A;" vertex="1" parent="1">\n`;
      cellsXml += `        <mxGeometry x="${room.x - 100}" y="${room.y - 25}" width="200" height="50" as="geometry" />\n`;
      cellsXml += `      </mxCell>\n`;
    });

    // 5. Export custom dimensions as double-headed drafting arrows
    dimensionLines.forEach((dim) => {
      const label = `📐 ${dim.physicalLength.toFixed(1)}${dim.unit}${dim.note ? ` [${dim.note}]` : ""}`;
      cellsXml += `      <mxCell id="dim_${dim.id}" value="${label}" style="endArrow=classic;startArrow=classic;html=1;strokeWidth=1.5;strokeColor=#4F46E5;endSize=8;startSize=8;fontSize=10;fontColor=#4F46E5;fontStyle=1;" edge="1" parent="1">\n`;
      cellsXml += `        <mxGeometry width="50" height="50" relative="1" as="geometry">\n`;
      cellsXml += `          <mxPoint x="${dim.x1}" y="${dim.y1}" as="sourcePoint" />\n`;
      cellsXml += `          <mxPoint x="${dim.x2}" y="${dim.y2}" as="targetPoint" />\n`;
      cellsXml += `        </mxGeometry>\n`;
      cellsXml += `      </mxCell>\n`;
    });

    return `<mxfile host="Electron" modified="${new Date().toISOString()}" agent="FloorplanAI" version="1.0" type="device">
  <diagram id="diag_floor" name="Vector Blueprint">
    <mxGraphModel dx="1200" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169">
      <root>
${cellsXml}      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  };

  // Real layout SVG compiler helper for the vector inspector view
  const generateFloorplanSVG = (): string => {
    let svgContent = `<!-- FloorPlan.ai Custom Export Model: ${projectTitle} -->\n`;
    svgContent += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" width="100%" height="100%" style="background-color: #ffffff; border-radius: 8px;">\n`;
    svgContent += `  <defs>\n`;
    svgContent += `    <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">\n`;
    svgContent += `      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1" />\n`;
    svgContent += `    </pattern>\n`;
    svgContent += `  </defs>\n\n`;
    svgContent += `  <rect width="1000" height="700" fill="url(#gridPattern)" />\n\n`;

    // 1. Render Rooms Background / Labels
    rooms.forEach((room) => {
      const col = room.color || "#e0e7ff";
      svgContent += `  <g id="room-${room.id}">\n`;
      svgContent += `    <rect x="${room.x - 70}" y="${room.y - 40}" width="140" height="80" rx="6" fill="${col}" opacity="0.45" stroke="#818cf8" stroke-dasharray="2,2" />\n`;
      svgContent += `    <text x="${room.x}" y="${room.y - 5}" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#1e293b" text-anchor="middle">${room.label}</text>\n`;
      if (room.areaSqm) {
        svgContent += `    <text x="${room.x}" y="${room.y + 15}" font-family="monospace" font-size="10" fill="#4f46e5" text-anchor="middle">${room.areaSqm.toFixed(1)} sqm</text>\n`;
      }
      svgContent += `  </g>\n`;
    });
    svgContent += `\n`;

    // 2. Render Placed Stamp Fixtures
    fixtures.forEach((f) => {
      svgContent += `  <g id="fixture-${f.id}" transform="translate(${f.x}, ${f.y}) rotate(${f.rotation || 0})">\n`;
      svgContent += `    <rect x="-30" y="-20" width="60" height="40" rx="4" fill="#f8fafc" stroke="#64748b" stroke-width="1.5" />\n`;
      svgContent += `    <line x1="-30" y1="0" x2="30" y2="0" stroke="#cbd5e1" stroke-width="1" />\n`;
      svgContent += `    <text x="0" y="3" font-family="system-ui, sans-serif" font-size="8" fill="#64748b" text-anchor="middle" font-weight="bold">${f.type.toUpperCase()}</text>\n`;
      svgContent += `  </g>\n`;
    });
    svgContent += `\n`;

    // 3. Render Partition Walls
    walls.forEach((wall) => {
      svgContent += `  <line id="wall-${wall.id}" x1="${wall.x1}" y1="${wall.y1}" x2="${wall.x2}" y2="${wall.y2}" stroke="#1e293b" stroke-width="6" stroke-linecap="round" />\n`;
    });
    svgContent += `\n`;

    // 4. Render Door Openings
    doors.forEach((door) => {
      svgContent += `  <g id="door-${door.id}">\n`;
      svgContent += `    <circle cx="${door.x}" cy="${door.y}" r="8" fill="#f43f5e" opacity="0.1" />\n`;
      svgContent += `    <line x1="${door.x - 15}" y1="${door.y}" x2="${door.x + 15}" y2="${door.y}" stroke="#f43f5e" stroke-width="3" stroke-linecap="round" />\n`;
      svgContent += `    <path d="M ${door.x - 15} ${door.y} A 30 30 0 0 1 ${door.x} ${door.y - 15}" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="2,2" />\n`;
      svgContent += `  </g>\n`;
    });
    svgContent += `\n`;

    // 5. Render Glazed Windows
    windows.forEach((win) => {
      svgContent += `  <g id="window-${win.id}">\n`;
      svgContent += `    <rect x="${win.x - 20}" y="${win.y - 4}" width="40" height="8" rx="1" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />\n`;
      svgContent += `    <line x1="${win.x - 20}" y1="${win.y}" x2="${win.x + 20}" y2="${win.y}" stroke="#0284c7" stroke-width="1" />\n`;
      svgContent += `  </g>\n`;
    });
    svgContent += `\n`;

    // 6. Dimensions & Annotations
    dimensionLines.forEach((dim) => {
      svgContent += `  <g id="dim-${dim.id}">\n`;
      svgContent += `    <line x1="${dim.x1}" y1="${dim.y1}" x2="${dim.x2}" y2="${dim.y2}" stroke="#4f46e5" stroke-width="1" stroke-dasharray="3,3" />\n`;
      svgContent += `    <circle cx="${dim.x1}" cy="${dim.y1}" r="3.5" fill="#4f46e5" />\n`;
      svgContent += `    <circle cx="${dim.x2}" cy="${dim.y2}" r="3.5" fill="#4f46e5" />\n`;
      svgContent += `    <text x="${(dim.x1 + dim.x2) / 2}" y="${(dim.y1 + dim.y2) / 2 - 6}" font-family="monospace" font-size="9" font-weight="bold" fill="#4f46e5" text-anchor="middle">📐 ${dim.physicalLength.toFixed(1)}${dim.unit}</text>\n`;
      if (dim.note) {
        svgContent += `    <text x="${(dim.x1 + dim.x2) / 2}" y="${(dim.y1 + dim.y2) / 2 + 10}" font-family="system-ui, sans-serif" font-size="8" fill="#64748b" text-anchor="middle">${dim.note}</text>\n`;
      }
      svgContent += `  </g>\n`;
    });

    svgContent += `</svg>`;
    return svgContent;
  };

  // Launch browser native printing sequence
  const handlePrintPDF = () => {
    window.print();
  };

  // Clear current blueprint and reset safely without cross-origin iframe blockage
  const handleResetFloorplan = () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      triggerNotification("Click again to confirm clearing the entire playground!");
      setTimeout(() => {
        setShowClearConfirm(false);
      }, 4000); // Reset confirmation state after 4 seconds of idle
    } else {
      setShowClearConfirm(false);
      saveHistoryState();
      setWalls(EMPTY_FLOORPLAN.walls);
      setDoors(EMPTY_FLOORPLAN.doors);
      setWindows(EMPTY_FLOORPLAN.windows);
      setRooms(EMPTY_FLOORPLAN.rooms);
      setFixtures([]);
      setBgImages([]);
      setSelectedBgId(null);
      setDimensionLines([]);
      setScale({ ...EMPTY_FLOORPLAN.scale });
      setSelectedElement({ type: "none", id: "" });
      setUploadedImage(null);
      setPlaygroundView(DEFAULT_PLAYGROUND_VIEW);
      setPlaygroundSheets([{ id: DEFAULT_SHEET_ID, name: "Ground Floor" }]);
      setActiveSheetId(DEFAULT_SHEET_ID);
      setMissedHighlights([]);
      setShowTracingImages(false);
      triggerNotification("Workspace cleared.");
    }
  };

  return (
    <>
    <div className="min-h-screen bg-[#F8F9FA] text-slate-800 flex flex-col font-sans relative overflow-x-hidden">
      
      {/* GLOBAL TOP NAVIGATION HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 no-print shadow-sm text-slate-800 shrink-0 relative z-35">
        
        {/* Logo, title and description */}
        <div className="flex items-center gap-3.5">
          <div className="bg-gradient-to-tr from-indigo-600 to-indigo-500 p-2 rounded-lg text-white shadow-md flex items-center justify-center w-8 h-8 font-black text-sm tracking-wide">
            F
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold tracking-tight text-slate-900 leading-tight">FloorPlan.ai</h1>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-indigo-600 border border-slate-200 uppercase tracking-widest leading-none">
                Architect Pro
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 hidden lg:block">
              Convert floorplans to editable vector diagrams & contractor PDFs • Active Project: <span className="text-indigo-600 font-bold">{projectTitle}</span>
            </p>
          </div>
        </div>

        {/* Quick Layout Actions and Persistence */}
        <div className="flex items-center gap-2.5 text-xs">
          
          {/* Undo / Redo Row */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 rounded bg-transparent hover:bg-slate-200 disabled:opacity-40 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Undo design change (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 rounded bg-transparent hover:bg-slate-200 disabled:opacity-40 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Redo action (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-250 mx-1 hidden sm:block" />

          {/* Save / Load Drafts */}
          <button
            onClick={handleSaveToLocalStorage}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-55 text-slate-700 font-bold border border-slate-200 rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Save blueprint layout state to LocalStorage"
          >
            <Save className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Save Draft</span>
          </button>
          <button
            onClick={handleLoadFromLocalStorage}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-100 rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Restore saved blueprint layout from LocalStorage"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Load Draft</span>
          </button>

          <div className="h-5 w-px bg-slate-250 mx-1" />

          {/* Wipe Drawing Board option */}
          <button
            onClick={handleResetFloorplan}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 rounded-lg transition-all font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Warning: Clears all current walls, doors, windows, and stamps"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>{showClearConfirm ? "Confirm Clear!" : "Clear Board"}</span>
          </button>
        </div>
      </header>

      {/* CORE WORKSPACE PORTAL */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-8 overflow-y-auto no-print">
        
        {/* INTERACTIVE COMPILATION GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
          {/* PLAYGROUND CANVAS WORKSPACE (Interactive blueprint grid canvas) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex flex-col gap-4 mt-2">
          
          {/* TOOLBAR CONTROLS (Horizontal rail) */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* SELECT TOOL */}
              <button
                onClick={() => {
                  setTool("select");
                  setDrawingWallStart(null);
                  setCalibrationPoint(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  tool === "select"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
                title="Select & Edit Mode: Select components to configure properties. Hover over red corner joints and drag to slide connected walls simultaneously."
              >
                <MousePointer2 className="w-4 h-4" />
                Select
              </button>

              {/* DRAW WALL TOOL */}
              <button
                onClick={() => {
                  setTool("add_wall");
                  setDrawingWallStart(null);
                  setCalibrationPoint(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  tool === "add_wall"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
                title="Partition Sketching (Wall): Click on grid, move cursor, and click again to anchor. Connects to existing corners automatically."
              >
                <Pencil className="w-4 h-4" />
                + {WALL_ITEMS.find((w) => w.type === selectedWallType)?.label.split(" ")[0] ?? "Wall"}
              </button>

              {/* INSERT DOOR */}
              <button
                onClick={() => {
                  setTool("add_door");
                  setDrawingWallStart(null);
                  setCalibrationPoint(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  tool === "add_door"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
                title="Door Placements: Click standard Doors to select, then click points along partitions to socket. You can drag them afterward."
              >
                <Plus className="w-4 h-4 text-rose-500" />
                + Door
              </button>

              {/* INSERT WINDOW */}
              <button
                onClick={() => {
                  setTool("add_window");
                  setDrawingWallStart(null);
                  setCalibrationPoint(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  tool === "add_window"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
                title="Glass Windows: Select tool, then click anywhere along an active partition to add transparent glazed window units."
              >
                <Plus className="w-4 h-4 text-sky-500" />
                + Window
              </button>

              {/* ADD ROOM ZONE */}
              <button
                onClick={() => {
                  setTool("add_room");
                  setDrawingWallStart(null);
                  setCalibrationPoint(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  tool === "add_room"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
                title="Add Room Labels: Click room center to configure labels, calculate real-world physical area, and paint background colors."
              >
                <Plus className="w-4 h-4 text-violet-500" />
                + Label
              </button>

              {/* UNIFIED COMPONENT DROPDOWN MENU */}
              <div className="relative">
                <button
                  onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    (tool === "add_fixture" || tool === "add_door" || tool === "add_window" || tool === "add_room")
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                  title="Stamp Library: Draft fixtures, furniture objects, and structural models on top of your blueprint layout instantly."
                >
                  <Plus className="w-4 h-4 text-emerald-500" />
                  <span>
                    {tool === "add_fixture" ? `+ ${selectedFixtureType.toUpperCase()}` : "Add Component..."}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-65 ml-0.5" />
                </button>

                {isAddMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsAddMenuOpen(false)}
                    />
                    <div className="absolute left-0 mt-1.5 w-64 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 text-slate-700 animate-in fade-in slide-in-from-top-1 duration-100">
                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mb-1">
                        Wall Segments
                      </div>
                      {WALL_ITEMS.map((wallItem) => (
                        <button
                          key={wallItem.type}
                          onClick={() => {
                            setSelectedWallType(wallItem.type);
                            setTool("add_wall");
                            setDrawingWallStart(null);
                            setIsAddMenuOpen(false);
                            triggerNotification(`Draw ${wallItem.label.toLowerCase()}: click start, click end.`);
                          }}
                          className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_wall" && selectedWallType === wallItem.type ? "bg-indigo-50 text-indigo-600" : ""}`}
                        >
                          <span className="flex items-center gap-2">{wallItem.icon} {wallItem.label}</span>
                          <span className="text-[9px] text-slate-400 font-mono">{wallItem.thickness}px</span>
                        </button>
                      ))}

                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mt-2 mb-1">
                        Door Openings
                      </div>
                      {DOOR_ITEMS.map((doorItem) => (
                        <button
                          key={doorItem.type}
                          onClick={() => {
                            setSelectedDoorType(doorItem.type);
                            setTool("add_door");
                            setIsAddMenuOpen(false);
                            triggerNotification(`Click canvas to place ${doorItem.label.toLowerCase()}.`);
                          }}
                          className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_door" && selectedDoorType === doorItem.type ? "bg-indigo-50 text-indigo-600" : ""}`}
                        >
                          <span className="flex items-center gap-2">{doorItem.icon} {doorItem.label}</span>
                        </button>
                      ))}

                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mt-2 mb-1">
                        Window Openings
                      </div>
                      {WINDOW_ITEMS.map((winItem) => (
                        <button
                          key={winItem.type}
                          onClick={() => {
                            setSelectedWindowType(winItem.type);
                            setTool("add_window");
                            setIsAddMenuOpen(false);
                            triggerNotification(`Click canvas to place ${winItem.label.toLowerCase()}.`);
                          }}
                          className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_window" && selectedWindowType === winItem.type ? "bg-indigo-50 text-indigo-600" : ""}`}
                        >
                          <span className="flex items-center gap-2">{winItem.icon} {winItem.label}</span>
                        </button>
                      ))}

                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mt-2 mb-1">
                        Room Labels
                      </div>
                      <button
                        onClick={() => {
                          setTool("add_room");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click on canvas to label a room space.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_room" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🏷️ Room Label Zone</span>
                        <span className="text-[9px] text-slate-400 font-mono">Label</span>
                      </button>

                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mt-2 mb-1">
                        Living / Bedroom
                      </div>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("bed");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click on blueprint to place double bed stamp.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "bed" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🛏️ Double Bed</span>
                        <span className="text-[9px] text-slate-400 font-mono">75x90</span>
                      </button>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("sofa");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click on blueprint to place sofa.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "sofa" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🛋️ Multi-seat Sofa</span>
                        <span className="text-[9px] text-slate-400 font-mono">110x55</span>
                      </button>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("table");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click on blueprint to place dining table.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "table" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🪑 Dining Table Set</span>
                        <span className="text-[9px] text-slate-400 font-mono">80x80</span>
                      </button>

                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mt-2 mb-1">
                        Bath & Plumbings
                      </div>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("toilet");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click to place standard ceramic toilet.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "toilet" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🚽 Ceramic Toilet</span>
                        <span className="text-[9px] text-slate-400 font-mono">30x42</span>
                      </button>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("bathtub");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click to place a bathtub basin.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "bathtub" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🛁 Bathtub Basin</span>
                        <span className="text-[9px] text-slate-400 font-mono">100x50</span>
                      </button>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("shower");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click to place shower cabin.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "shower" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🚿 Shower Cabin</span>
                        <span className="text-[9px] text-slate-400 font-mono">55x55</span>
                      </button>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("sink");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click to place bathroom sink.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "sink" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🚰 Bathroom Sink</span>
                        <span className="text-[9px] text-slate-400 font-mono">42x36</span>
                      </button>

                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mt-2 mb-1">
                        Kitchen & Cookers
                      </div>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("stove");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click to place kitchen stove cooker.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "stove" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🍳 Stove Cooker</span>
                        <span className="text-[9px] text-slate-400 font-mono">45x45</span>
                      </button>

                      <div className="text-[10px] font-bold text-slate-400 px-3.5 py-1.5 uppercase tracking-widest bg-slate-50 rounded-md mt-2 mb-1">
                        Structural Elements
                      </div>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("staircase");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click to place staircase tread flight.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "staircase" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">🪜 Staircase Flight</span>
                        <span className="text-[9px] text-slate-400 font-mono">120x50</span>
                      </button>
                      <button
                        onClick={() => {
                          setTool("add_fixture");
                          setSelectedFixtureType("column");
                          setIsAddMenuOpen(false);
                          triggerNotification("Click to place a solid column.");
                        }}
                        className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-xs rounded-lg flex items-center justify-between font-semibold ${tool === "add_fixture" && selectedFixtureType === "column" ? "bg-indigo-50 text-indigo-600" : ""}`}
                      >
                        <span className="flex items-center gap-2">⬛ Pillar Column</span>
                        <span className="text-[9px] text-slate-400 font-mono">24x24</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* CALIBRATE SCALE RULER */}
              <button
                onClick={() => {
                  setTool("calibrate");
                  setDrawingWallStart(null);
                  setCalibrationPoint(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  tool === "calibrate"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                }`}
                title="Measure & Calibrate: Click starting point of a known span, click opposite corner, and enter physical length to set layout scaling."
              >
                <Ruler className="w-4 h-4 text-amber-500" />
                Measure
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Playground zoom & pan */}
              <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => zoomPlaygroundAtCenter(true)}
                  className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => zoomPlaygroundAtCenter(false)}
                  className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={fitPlaygroundToContent}
                  className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                  title="Fit all rooms in view"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPlaygroundView(DEFAULT_PLAYGROUND_VIEW)}
                  className="px-1.5 py-1 rounded-md hover:bg-white text-[10px] font-bold font-mono text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer min-w-[42px]"
                  title="Reset to full 1:100 sheet view"
                >
                  {viewBoxZoomPercent(playgroundView)}%
                </button>
              </div>

              {/* General Grid Snap Switcher */}
              <button
                onClick={() => setGridSnapping(!gridSnapping)}
                className={`p-2 rounded-lg transition-all cursor-pointer ${
                  gridSnapping ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                }`}
                title="Toggle coordinate grid-line snapping"
              >
                <Grid className="w-4 h-4" />
              </button>

              {/* Clear Entire Canvas/Playground Action Button */}
              <button
                onClick={handleResetFloorplan}
                className={`p-2 rounded-lg transition-all cursor-pointer border flex items-center justify-center gap-1.5 text-xs px-2.5 font-bold ${
                  showClearConfirm
                    ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-700 animate-pulse ring-2 ring-rose-300"
                    : "bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border-rose-250 font-semibold"
                }`}
                title={showClearConfirm ? "Click again to confirm complete clear!" : "Wipe layout and images from the playground entirely"}
              >
                <Trash2 className={`w-4 h-4 ${showClearConfirm ? "text-white" : "text-rose-500"}`} />
                <span>{showClearConfirm ? "Click to Confirm Clear" : "Reset Playground"}</span>
              </button>
            </div>
          </div>

          {/* ACTIVE TOOL HELP TIP BANNER */}
          <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-lg text-xs flex items-center justify-between leading-relaxed shadow-sm">
            <span className="text-indigo-900 flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              <strong>Active Tool:</strong>{" "}
              {tool === "select" && `Select & Edit. Sheet at ${DRAWING_SCALE_LABEL} (~${SHEET_WIDTH_METERS} m). Scroll to zoom out, middle-mouse pan, ⊡ to fit oversized layouts.`}
              {tool === "add_wall" && "Partition Drawing. Click anywhere to start, click again to drop the wall corner."}
              {tool === "add_door" && `Placement Mode. Click along a wall to place a ${DOOR_ITEMS.find((d) => d.type === selectedDoorType)?.label ?? "door"}.`}
              {tool === "add_window" && "Placement Mode. Click wall locations to add double-glazed vector windows."}
              {tool === "add_room" && "Room Labeling. Click room centers to add custom labels and configure properties."}
              {tool === "calibrate" && !calibrationPoint && "Calibration Step 1: Click the start point of a known span."}
              {tool === "calibrate" && calibrationPoint && "Calibration Step 2: Click the opposite end of the span to set scale."}
            </span>
            {drawingWallStart && (
              <button
                onClick={() => setDrawingWallStart(null)}
                className="text-[10px] text-rose-600 hover:underline font-mono bg-white border border-rose-200 px-1.5 py-0.5 rounded shadow-sm cursor-pointer ml-2"
              >
                Cancel Wall
              </button>
            )}
          </div>

          {/* WORKSHEET TABS — one sheet per floor/wing at 1:100 */}
          <div className="flex items-center gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg overflow-x-auto shadow-sm">
            <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
            {playgroundSheets.map((sheet) => {
              const isActive = sheet.id === activeSheetId;
              return (
                <div key={sheet.id} className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => switchPlaygroundSheet(sheet.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                    title={`Switch to ${sheet.name}`}
                  >
                    {sheet.name}
                  </button>
                  {playgroundSheets.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlaygroundSheet(sheet.id);
                      }}
                      className="p-1 ml-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title={`Delete ${sheet.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addPlaygroundSheet}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer shrink-0 ml-1"
              title="Add worksheet for another floor or wing"
            >
              <Plus className="w-3.5 h-3.5" />
              Page
            </button>
            <span className="text-[10px] text-slate-400 ml-auto shrink-0 hidden sm:inline font-mono">
              {DRAWING_SCALE_LABEL} · ~{SHEET_WIDTH_METERS} m per sheet
            </span>
          </div>

          {/* CANVAS VIEWPORT STAGE */}
          <div
            ref={canvasContainerRef}
            className={`w-full aspect-square border border-slate-200 rounded-xl overflow-hidden shadow-inner relative select-none bg-white ${
              isPanningView ? "cursor-grabbing" : ""
            }`}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                setIsPanningView(true);
                panViewStartRef.current = {
                  clientX: e.clientX,
                  clientY: e.clientY,
                  viewBox: playgroundView,
                };
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Pop-up Overlay for Dimension Input right over the plan */}
            {pendingDimension && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-md border border-indigo-200 p-5 rounded-xl shadow-xl z-50 w-80 max-w-full animate-fadeIn transition-all text-xs text-slate-800">
                <div className="flex items-center gap-1.5 text-indigo-900 font-bold mb-3">
                  <Ruler className="w-4 h-4 text-indigo-600" />
                  <span>📏 Precise Scale & Dimension Line</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                      Real-World Length ({scale.unit})
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={dimLengthInput}
                      onChange={(e) => setDimLengthInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-slate-800 animate-none"
                      placeholder="e.g. 5.0"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                      Measurement Label / Notes
                    </label>
                    <input
                      type="text"
                      value={dimNoteInput}
                      onChange={(e) => setDimNoteInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-800"
                      placeholder="e.g. Master Bedroom Width, clearance"
                    />
                  </div>

                  <div className="bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100 text-[10px] text-indigo-900 leading-normal">
                    <strong>Action details:</strong> This updates the drawing's physical ratio and drops a visual dimension label on your drafting canvas.
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        setPendingDimension(null);
                        setCalibrationPoint(null);
                        setTool("select");
                      }}
                      className="flex-1 py-2 border border-slate-200 font-bold text-slate-500 rounded bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const physicalVal = parseFloat(dimLengthInput) || 5.0;
                        const dist = Math.hypot(pendingDimension.x2 - pendingDimension.x1, pendingDimension.y2 - pendingDimension.y1);
                        
                        // Save history state to support undo/redo
                        saveHistoryState();

                        // 1. Calibrate globally
                        setScale({
                          calibrated: true,
                          pixelDistance: dist,
                          physicalLength: physicalVal,
                          unit: scale.unit,
                        });

                        // 2. Save dimension line
                        const newDim: DimensionLine = {
                          id: `dim_${Date.now()}`,
                          x1: pendingDimension.x1,
                          y1: pendingDimension.y1,
                          x2: pendingDimension.x2,
                          y2: pendingDimension.y2,
                          physicalLength: physicalVal,
                          unit: scale.unit as any,
                          note: dimNoteInput.trim() || `Measured segment`,
                          sheetId: activeSheetId,
                        };
                        setDimensionLines((prev) => [...prev, newDim]);
                        
                        setPendingDimension(null);
                        setCalibrationPoint(null);
                        setTool("select");
                        triggerNotification(`Workspace scale set to ${physicalVal}${scale.unit}! Saved blueprint dimension notes.`);
                      }}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-750 font-bold text-white rounded transition-colors cursor-pointer"
                    >
                      Apply & Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 1. Underlying Single Uploaded Image (fallback if no multi-blocks are loaded) */}
            {showTracingImages && uploadedImage && bgImages.length === 0 && (
              <img
                src={uploadedImage}
                alt="Tracing Source"
                style={{ opacity: imageOpacity }}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0"
              />
            )}

            {/* 2. Interactive SVG Vector Layer */}
            <svg
              width="100%"
              height="100%"
              viewBox={`${playgroundView.x} ${playgroundView.y} ${playgroundView.w} ${playgroundView.h}`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              className={`absolute inset-0 z-10 transition-colors duration-200 ${
                isPanningView ? "cursor-grabbing" : "cursor-crosshair"
              } ${themeMode === "blueprint" ? "bg-blueprint" : "bg-blueprint-light"}`}
            >
              {/* Primary Background Tracing Template Image (visible under layout vectors) */}
              {showTracingImages && uploadedImage && bgImages.length === 0 && (
                <image
                  href={uploadedImage}
                  x="0"
                  y="0"
                  width="1000"
                  height="1000"
                  opacity={imageOpacity}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}

              {/* 0. Render multiple Lego Background Tracing Card Elements */}
              {showTracingImages && sheetBgImages.map((bg) => {
                if (bg.extracted) return null;
                const isSelected = selectedBgId === bg.id;
                const halfW = bg.width / 2;
                const halfH = bg.height / 2;
                return (
                  <g
                    key={bg.id}
                    transform={`translate(${bg.x}, ${bg.y}) scale(${bg.scale}) rotate(${bg.rotation})`}
                  >
                    {isSelected && (
                      <rect
                        x={-halfW - 4}
                        y={-halfH - 4}
                        width={bg.width + 8}
                        height={bg.height + 8}
                        fill="none"
                        stroke="#6366F1"
                        strokeWidth="3"
                        strokeDasharray="6 4"
                        className="animate-pulse"
                      />
                    )}
                    
                    <image
                      href={bg.url}
                      x={-halfW}
                      y={-halfH}
                      width={bg.width}
                      height={bg.height}
                      opacity={imageOpacity}
                      className={isSelected ? "cursor-grabbing" : "cursor-grab"}
                    />

                    <g transform={`translate(${-halfW + 6}, ${-halfH + 6})`}>
                      <rect
                        width={Math.max(90, bg.name.length * 6.5 + 24)}
                        height="20"
                        rx="4"
                        fill="#4F46E5"
                        className="shadow"
                      />
                      <text
                        x="8"
                        y="13"
                        fill="#FFFFFF"
                        fontSize="9.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        🧩 {bg.name}
                      </text>
                    </g>
                  </g>
                );
              })}
              {/* SVGs definitions: Custom Blueprint Grids if background css has limits */}
              {/* Drawing sheet frame — architectural 1:100 worksheet boundary */}
              <g pointerEvents="none" aria-hidden="true">
                <rect
                  x="0"
                  y="0"
                  width="1000"
                  height="1000"
                  fill="rgba(255,255,255,0.02)"
                  stroke={themeMode === "blueprint" ? "#3B82F6" : "#CBD5E1"}
                  strokeWidth="2"
                />
                <text
                  x="14"
                  y="22"
                  fontSize="11"
                  fontWeight="bold"
                  fill={themeMode === "blueprint" ? "#93C5FD" : "#64748B"}
                  fontFamily="monospace"
                >
                  Scale {DRAWING_SCALE_LABEL} (~{SHEET_WIDTH_METERS} m)
                </text>
                <g transform="translate(928, 52)">
                  <polygon
                    points="0,-16 7,6 -7,6"
                    fill={themeMode === "blueprint" ? "#60A5FA" : "#94A3B8"}
                  />
                  <text
                    y="20"
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="bold"
                    fill={themeMode === "blueprint" ? "#93C5FD" : "#64748B"}
                    fontFamily="monospace"
                  >
                    N
                  </text>
                </g>
                <text
                  x="500"
                  y="988"
                  textAnchor="middle"
                  fontSize="10"
                  fill={themeMode === "blueprint" ? "#60A5FA" : "#94A3B8"}
                  fontFamily="monospace"
                >
                  {playgroundSheets.find((s) => s.id === activeSheetId)?.name ?? "Ground Floor"}
                </text>
              </g>

              {/* 1. Draw grid line overlays depending on theme */}
              <defs>
                {themeMode === "classic" && (
                  <pattern id="light-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <line x1="50" y1="0" x2="50" y2="50" stroke="#f1f3f5" strokeWidth="1" />
                    <line x1="0" y1="50" x2="50" y2="50" stroke="#f1f3f5" strokeWidth="1" />
                  </pattern>
                )}
                {showTracingImages &&
                  sheetBgImages
                    .filter((bg) => bg.extracted && bg.showReferencePhoto !== false)
                    .map((bg) => {
                      const bounds = getRoomGroupBounds(bg.id, sheetWalls, sheetDoors, sheetWindows, sheetRooms, sheetFixtures);
                      if (!bounds) return null;
                      const pad = 20;
                      return (
                        <clipPath key={`clip-ref-${bg.id}`} id={`clip-ref-${bg.id}`}>
                          <rect
                            x={bounds.minX - pad}
                            y={bounds.minY - pad}
                            width={bounds.maxX - bounds.minX + pad * 2}
                            height={bounds.maxY - bounds.minY + pad * 2}
                            rx="6"
                          />
                        </clipPath>
                      );
                    })}
              </defs>

              {/* Clipped reference photos under vectors — aligned to extraction transform */}
              {showTracingImages &&
                sheetBgImages.map((bg) => {
                  if (!bg.extracted || bg.showReferencePhoto === false) return null;
                  const bounds = getRoomGroupBounds(bg.id, sheetWalls, sheetDoors, sheetWindows, sheetRooms, sheetFixtures);
                  if (!bounds) return null;
                  const halfW = bg.width / 2;
                  const halfH = bg.height / 2;
                  return (
                    <g
                      key={`ref-photo-${bg.id}`}
                      clipPath={`url(#clip-ref-${bg.id})`}
                      transform={`translate(${bg.x}, ${bg.y}) scale(${bg.scale}) rotate(${bg.rotation})`}
                      style={{ pointerEvents: "none" }}
                    >
                      <image
                        href={bg.url}
                        x={-halfW}
                        y={-halfH}
                        width={bg.width}
                        height={bg.height}
                        opacity={imageOpacity}
                      />
                    </g>
                  );
                })}

              {/* User highlights for missed items (door beside glass, etc.) */}
              {sheetHighlights.map((h) => {
                const x = Math.min(h.x1, h.x2);
                const y = Math.min(h.y1, h.y2);
                const w = Math.abs(h.x2 - h.x1);
                const height = Math.abs(h.y2 - h.y1);
                return (
                  <g key={h.id} style={{ pointerEvents: "none" }}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={height}
                      fill="rgba(251, 191, 36, 0.22)"
                      stroke="#F59E0B"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      rx="3"
                    />
                    <text
                      x={x + 6}
                      y={y + 14}
                      fontSize="9"
                      fontWeight="bold"
                      fill="#B45309"
                      fontFamily="monospace"
                    >
                      {h.label ?? "missed"}
                    </text>
                  </g>
                );
              })}
              {drawingHighlightStart && tempMousePos && tool === "highlight_miss" && (
                <rect
                  x={Math.min(drawingHighlightStart.x, tempMousePos.x)}
                  y={Math.min(drawingHighlightStart.y, tempMousePos.y)}
                  width={Math.abs(tempMousePos.x - drawingHighlightStart.x)}
                  height={Math.abs(tempMousePos.y - drawingHighlightStart.y)}
                  fill="rgba(251, 191, 36, 0.15)"
                  stroke="#F59E0B"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  style={{ pointerEvents: "none" }}
                />
              )}

              {/* 2. Drawing ALL Walls segments */}
              {sheetWalls.map((wall) => {
                if (![wall.x1, wall.y1, wall.x2, wall.y2].every((n) => Number.isFinite(n))) {
                  return null;
                }
                const isSelected = selectedElement.type === "wall" && selectedElement.id === wall.id;
                const { thickness, color, dashed } = getWallStyle(wall.type, themeMode);

                return (
                  <g key={wall.id} className="group">
                    {/* Invisible thicker interaction line for generous click range */}
                    <line
                      x1={wall.x1}
                      y1={wall.y1}
                      x2={wall.x2}
                      y2={wall.y2}
                      stroke="transparent"
                      strokeWidth="24"
                      className="cursor-pointer"
                    />
                    
                    {/* Rendered architectural wall line */}
                    <line
                      x1={wall.x1}
                      y1={wall.y1}
                      x2={wall.x2}
                      y2={wall.y2}
                      strokeWidth={thickness}
                      strokeDasharray={dashed ? "6,4" : undefined}
                      className={`${color} ${
                        isSelected ? "stroke-indigo-600 drop-shadow-sm" : ""
                      } transition-colors line-cap-round`}
                    />
                    {wall.type === "double" && (
                      <line
                        x1={wall.x1}
                        y1={wall.y1}
                        x2={wall.x2}
                        y2={wall.y2}
                        strokeWidth={thickness - 6}
                        strokeDasharray="none"
                        className={`${color} opacity-40`}
                      />
                    )}

                    {/* Architectural dimension text (length annotation) inside SVG */}
                    {scale.calibrated && (
                      <g transform={`translate(${(wall.x1 + wall.x2) / 2}, ${(wall.y1 + wall.y2) / 2})`}>
                        <rect
                          x="-32"
                          y="-10"
                          width="64"
                          height="18"
                          rx="3"
                          fill={themeMode === "blueprint" ? "#1E293B" : "#FFFFFF"}
                          stroke={themeMode === "blueprint" ? "#6366F1" : "#E2E8F0"}
                          strokeWidth="1"
                          opacity="0.9"
                        />
                        <text
                          textAnchor="middle"
                          y="3"
                          fontSize="9.5"
                          fontWeight="bold"
                          className={themeMode === "blueprint" ? "fill-indigo-400" : "fill-indigo-600"}
                        >
                          {getWallPhysicalLengthStr(wall)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* 2b. Wall erasure masks for doors and windows (breaks/erases the wall beneath openings) */}
              {(() => {
                const maskBg = themeMode === "blueprint" ? "#0d0e15" : "#FAFAFC";
                return (
                  <g id="drafting-erasure-masks">
                    {/* Doors erasure masks */}
                    {sheetDoors.map((door) => {
                      const size = door.width;
                      return (
                        <line
                          key={`door_mask_${door.id}`}
                          x1={door.x}
                          y1={door.y}
                          x2={door.orientation === "h" ? door.x + size : door.x}
                          y2={door.orientation === "h" ? door.y : door.y + size}
                          stroke={maskBg}
                          strokeWidth="14"
                          strokeLinecap="square"
                        />
                      );
                    })}
                    {/* Windows erasure masks */}
                    {sheetWindows.map((win) => {
                      const w = win.width;
                      return (
                        <line
                          key={`win_mask_${win.id}`}
                          x1={win.orientation === "h" ? win.x - w / 2 : win.x}
                          y1={win.orientation === "h" ? win.y : win.y - w / 2}
                          x2={win.orientation === "h" ? win.x + w / 2 : win.x}
                          y2={win.orientation === "h" ? win.y : win.y + w / 2}
                          stroke={maskBg}
                          strokeWidth="14"
                          strokeLinecap="square"
                        />
                      );
                    })}
                  </g>
                );
              })()}

              {/* 3. Drawing ALL Windows segments */}
              {sheetWindows.map((win) => {
                const isSelected = selectedElement.type === "window" && selectedElement.id === win.id;
                return (
                  <g key={win.id}>
                    <WindowElement win={win} isSelected={isSelected} themeMode={themeMode} />
                  </g>
                );
              })}

              {/* 4. Drawing ALL Doors (hinged, sliding, folding, pocket, double) */}
              {sheetDoors.map((door) => {
                const isSelected = selectedElement.type === "door" && selectedElement.id === door.id;

                return (
                  <g key={door.id}>
                    <DoorElement door={door} isSelected={isSelected} themeMode={themeMode} />
                  </g>
                );
              })}

              {/* 4b. Drawing ALL placed Fixtures / Furniture stamps */}
              {sheetFixtures.map((fixture) => {
                if (
                  !Number.isFinite(fixture.x) ||
                  !Number.isFinite(fixture.y) ||
                  !Number.isFinite(fixture.width) ||
                  !Number.isFinite(fixture.height) ||
                  fixture.width < 4 ||
                  fixture.height < 4
                ) {
                  return null;
                }
                const isSelected = selectedElement.type === "fixture" && selectedElement.id === fixture.id;
                const halfW = fixture.width / 2;
                const halfH = fixture.height / 2;
                const strokeCol = isSelected ? "#F43F5E" : themeMode === "blueprint" ? "#38BDF8" : "#475569";
                const fillCol = themeMode === "blueprint" ? "#1E293B" : "#FFFFFF";

                return (
                  <g
                    key={fixture.id}
                    transform={`translate(${fixture.x}, ${fixture.y}) rotate(${fixture.rotation})`}
                    className="cursor-move group"
                  >
                    {/* Glowing highlight border boundary circle/card on selection */}
                    {isSelected && (
                      <>
                        <rect
                          x={-halfW - 6}
                          y={-halfH - 6}
                          width={fixture.width + 12}
                          height={fixture.height + 12}
                          fill="none"
                          stroke="#F43F5E"
                          strokeWidth="2.5"
                          strokeDasharray="5 3"
                          rx="4"
                        />
                        <line x1={0} y1={-halfH - 6} x2={0} y2={-halfH - 20} stroke="#6366F1" strokeWidth="2" />
                        <circle cx={0} cy={-halfH - 22} r={7} fill="#6366F1" className="cursor-grab" />
                        <rect
                          x={halfW - 5}
                          y={halfH - 5}
                          width={10}
                          height={10}
                          fill="#6366F1"
                          rx={1}
                          className="cursor-nwse-resize"
                        />
                      </>
                    )}

                    {/* Generous mouse hit target */}
                    <rect
                      x={-halfW}
                      y={-halfH}
                      width={fixture.width}
                      height={fixture.height}
                      fill="transparent"
                      stroke="transparent"
                      strokeWidth="8"
                    />

                    {/* Architectural block stamp design details */}
                    {(() => {
                      switch (fixture.type) {
                        case "bed": {
                          return (
                            <g>
                              {/* Main Bed Matt/Frame */}
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="3" />
                              {/* Pillows */}
                              {fixture.width > 55 ? (
                                <>
                                  <rect x={-halfW + 6} y={-halfH + 6} width={halfW - 9} height={18} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" rx="1.5" />
                                  <rect x={3} y={-halfH + 6} width={halfW - 9} height={18} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" rx="1.5" />
                                </>
                              ) : (
                                <rect x={-halfW + 6} y={-halfH + 6} width={fixture.width - 12} height={18} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" rx="1.5" />
                              )}
                              {/* Sheet folded duvet style */}
                              <line x1={-halfW} y1={-halfH + 30} x2={halfW} y2={-halfH + 30} stroke={strokeCol} strokeWidth="2" />
                              <path d={`M ${-halfW} ${-halfH + 30} L 0 ${-halfH + 42} L ${halfW} ${-halfH + 30}`} fill="none" stroke={strokeCol} strokeWidth="1.5" />
                            </g>
                          );
                        }
                        case "sofa": {
                          const armW = 10;
                          const backH = 10;
                          return (
                            <g>
                              {/* Frame outline */}
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="4" />
                              {/* Backrest */}
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={backH} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" />
                              {/* Left Armrest */}
                              <rect x={-halfW} y={-halfH + backH} width={armW} height={fixture.height - backH} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" />
                              {/* Right Armrest */}
                              <rect x={halfW - armW} y={-halfH + backH} width={armW} height={fixture.height - backH} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" />
                              {/* Center cushion seams */}
                              {fixture.width > 70 && (
                                <line x1="0" y1={-halfH + backH} x2="0" y2={halfH} stroke={strokeCol} strokeWidth="1.5" />
                              )}
                            </g>
                          );
                        }
                        case "table": {
                          return (
                            <g>
                              {/* Dining wooden table */}
                              <rect x={-halfW + 12} y={-halfH + 12} width={fixture.width - 24} height={fixture.height - 24} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="2" />
                              {/* Chair placements top/bottom/sides */}
                              <rect x={-12} y={-halfH + 2} width={24} height={8} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" rx="1" />
                              <rect x={-12} y={halfH - 10} width={24} height={8} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" rx="1" />
                              <rect x={-halfW + 2} y={-12} width={8} height={24} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" rx="1" />
                              <rect x={halfW - 10} y={-12} width={8} height={24} fill={fillCol} stroke={strokeCol} strokeWidth="1.5" rx="1" />
                            </g>
                          );
                        }
                        case "toilet": {
                          const tankH = 12;
                          return (
                            <g>
                              {/* Tank water reservoir */}
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={tankH} fill={fillCol} stroke={strokeCol} strokeWidth="2" rx="2.5" />
                              {/* Bowl */}
                              <ellipse cx="0" cy={-halfH + tankH + (fixture.height - tankH) / 2} rx={halfW - 1} ry={(fixture.height - tankH) / 2} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" />
                              {/* Inner rim circle hole */}
                              <ellipse cx="0" cy={-halfH + tankH + (fixture.height - tankH) / 2} rx={halfW - 6} ry={(fixture.height - tankH) / 2 - 5} fill="none" stroke={strokeCol} strokeWidth="1.2" />
                            </g>
                          );
                        }
                        case "bathtub": {
                          return (
                            <g>
                              {/* Tub edge casing */}
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="6" />
                              {/* Interior basin lining */}
                              <rect x={-halfW + 8} y={-halfH + 8} width={fixture.width - 16} height={fixture.height - 16} fill="none" stroke={strokeCol} strokeWidth="1.5" rx="10" />
                              {/* Faucet circle */}
                              <circle cx={-halfW + 16} cy="0" r="3" fill="none" stroke={strokeCol} strokeWidth="1.5" />
                            </g>
                          );
                        }
                        case "shower": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" />
                              <line x1={-halfW} y1={-halfH} x2={halfW} y2={halfH} stroke={strokeCol} strokeWidth="1" strokeDasharray="3,3" />
                              <line x1={halfW} y1={-halfH} x2={-halfW} y2={halfH} stroke={strokeCol} strokeWidth="1" strokeDasharray="3,3" />
                              <circle cx="0" cy="0" r="6" fill={fillCol} stroke={strokeCol} strokeWidth="2" />
                            </g>
                          );
                        }
                        case "sink": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2" rx="3" />
                              <ellipse cx="0" cy="2" rx={halfW - 6} ry={halfH - 8} fill="none" stroke={strokeCol} strokeWidth="1.5" />
                              {/* Tap mixer hook */}
                              <line x1="0" y1={-halfH} x2="0" y2={-halfH + 6} stroke={strokeCol} strokeWidth="2.5" />
                            </g>
                          );
                        }
                        case "staircase": {
                          const stepsCount = 7;
                          const stepW = fixture.width / stepsCount;
                          return (
                            <g>
                              {/* Stair boundaries */}
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" />
                              {/* Step risers */}
                              {Array.from({ length: stepsCount - 1 }).map((_, index) => {
                                const lx = -halfW + (index + 1) * stepW;
                                return <line key={index} x1={lx} y1={-halfH} x2={lx} y2={halfH} stroke={strokeCol} strokeWidth="1.5" />;
                              })}
                              {/* Stair flight direction indicator arrow */}
                              <line x1={-halfW + 15} y1="0" x2={halfW - 15} y2="0" stroke={strokeCol} strokeWidth="2" strokeDasharray="1,1" />
                              <path d={`M ${halfW - 25} -5 L ${halfW - 15} 0 L ${halfW - 25} 5`} fill="none" stroke={strokeCol} strokeWidth="2" />
                            </g>
                          );
                        }
                        case "stove": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="2" />
                              {/* Burners */}
                              <circle cx={-halfW / 2} cy={-halfH / 2} r="6" fill="none" stroke={strokeCol} strokeWidth="1.5" />
                              <circle cx={halfW / 2} cy={-halfH / 2} r="6" fill="none" stroke={strokeCol} strokeWidth="1.5" />
                              <circle cx={-halfW / 2} cy={halfH / 2} r="8" fill="none" stroke={strokeCol} strokeWidth="2" />
                              <circle cx={halfW / 2} cy={halfH / 2} r="8" fill="none" stroke={strokeCol} strokeWidth="2" />
                            </g>
                          );
                        }
                        case "cabinet":
                        case "wall_cabinet": {
                          const isUpper = fixture.type === "wall_cabinet";
                          return (
                            <g>
                              <rect
                                x={-halfW}
                                y={-halfH}
                                width={fixture.width}
                                height={fixture.height}
                                fill={isUpper ? fillCol : "#E2E8F0"}
                                stroke={strokeCol}
                                strokeWidth="2"
                                rx="2"
                              />
                              {!isUpper &&
                                Array.from({ length: Math.min(6, Math.floor(fixture.width / 28)) }).map((_, i) => {
                                  const lx = -halfW + (i + 1) * (fixture.width / (Math.floor(fixture.width / 28) + 1));
                                  return (
                                    <line key={i} x1={lx} y1={-halfH + 2} x2={lx} y2={halfH - 2} stroke={strokeCol} strokeWidth="1" opacity="0.5" />
                                  );
                                })}
                              <text textAnchor="middle" y="3" fontSize="8" className="fill-slate-500 font-bold">
                                {isUpper ? "upper" : "base"}
                              </text>
                            </g>
                          );
                        }
                        case "counter": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill="#CBD5E1" stroke={strokeCol} strokeWidth="2" rx="1" />
                              <line x1={-halfW} y1={0} x2={halfW} y2={0} stroke={strokeCol} strokeWidth="1" strokeDasharray="4 3" />
                            </g>
                          );
                        }
                        case "island": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill="#E2E8F0" stroke={strokeCol} strokeWidth="2.5" rx="4" />
                              <rect x={-halfW + 6} y={-halfH + 6} width={fixture.width - 12} height={fixture.height - 12} fill="none" stroke={strokeCol} strokeWidth="1.5" rx="2" />
                            </g>
                          );
                        }
                        case "fridge": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="2" />
                              <line x1={-halfW} y1={-halfH / 3} x2={halfW} y2={-halfH / 3} stroke={strokeCol} strokeWidth="2" />
                              <rect x={-halfW + 4} y={-halfH + 4} width={8} height={halfH / 3 - 6} fill="none" stroke={strokeCol} strokeWidth="1" rx="1" />
                            </g>
                          );
                        }
                        case "dishwasher":
                        case "washing_machine": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="2" />
                              <circle cx="0" cy="2" r={Math.min(halfW, halfH) - 6} fill="none" stroke={strokeCol} strokeWidth="2" />
                            </g>
                          );
                        }
                        case "column": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={strokeCol} stroke={strokeCol} strokeWidth="1" />
                              <line x1={-halfW} y1={-halfH} x2={halfW} y2={halfH} stroke={themeMode==="blueprint"?"#000000":"#FFFFFF"} strokeWidth="1.5" />
                              <line x1={halfW} y1={-halfH} x2={-halfW} y2={halfH} stroke={themeMode==="blueprint"?"#000000":"#FFFFFF"} strokeWidth="1.5" />
                            </g>
                          );
                        }
                        case "fireplace": {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2.5" rx="2" />
                              <rect x={-halfW + 8} y={-halfH + 8} width={fixture.width - 16} height={fixture.height - 16} fill="none" stroke={strokeCol} strokeWidth="1.5" rx="1" />
                              <path d={`M ${-halfW + 12} ${halfH - 8} Q 0 ${-halfH + 6} ${halfW - 12} ${halfH - 8}`} fill="none" stroke="#F97316" strokeWidth="2" />
                            </g>
                          );
                        }
                        case "light_fitting": {
                          return (
                            <g>
                              <circle cx={0} cy={0} r={Math.min(halfW, halfH)} fill={fillCol} stroke={strokeCol} strokeWidth="2" />
                              <line x1={0} y1={-Math.min(halfW, halfH)} x2={0} y2={Math.min(halfW, halfH)} stroke={strokeCol} strokeWidth="1.5" />
                              <line x1={-Math.min(halfW, halfH)} y1={0} x2={Math.min(halfW, halfH)} y2={0} stroke={strokeCol} strokeWidth="1.5" />
                            </g>
                          );
                        }
                        case "balcony":
                        case "patio": {
                          return (
                            <g>
                              <rect
                                x={-halfW}
                                y={-halfH}
                                width={fixture.width}
                                height={fixture.height}
                                fill={themeMode === "blueprint" ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.12)"}
                                stroke={themeMode === "blueprint" ? "#22C55E" : "#16A34A"}
                                strokeWidth="2"
                                strokeDasharray="6 3"
                                rx="3"
                              />
                              <line x1={-halfW} y1={-halfH + 8} x2={halfW} y2={-halfH + 8} stroke={themeMode === "blueprint" ? "#22C55E" : "#16A34A"} strokeWidth="1.5" />
                              <text textAnchor="middle" y="4" fontSize="9" fontWeight="bold" className={themeMode === "blueprint" ? "fill-green-400" : "fill-green-700"}>
                                {fixture.type === "balcony" ? "BALCONY" : "PATIO"}
                              </text>
                            </g>
                          );
                        }
                        default: {
                          return (
                            <g>
                              <rect x={-halfW} y={-halfH} width={fixture.width} height={fixture.height} fill={fillCol} stroke={strokeCol} strokeWidth="2" rx="3" />
                              <text textAnchor="middle" y="4" fontSize="10" className="fill-slate-500 font-bold uppercase">{fixture.type}</text>
                            </g>
                          );
                        }
                      }
                    })()}

                    {/* Fixture stamp text code designation */}
                    <text
                      y={halfH + 13}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      className={themeMode === "blueprint" ? "fill-teal-400 font-mono" : "fill-teal-700 font-bold"}
                    >
                      {fixture.label || `${fixture.type.toUpperCase()}`}
                    </text>
                  </g>
                );
              })}

              {/* 5. Custom Temporary Preview Graphics while DRAWING */}
              {tool === "add_wall" && drawingWallStart && tempMousePos && (
                <g>
                  {/* Snapped mouse helper */}
                  {(() => {
                    const snapped = getSnappedCoords(tempMousePos.x, tempMousePos.y);
                    return (
                      <>
                        <line
                          x1={drawingWallStart.x}
                          y1={drawingWallStart.y}
                          x2={snapped.x}
                          y2={snapped.y}
                          stroke="#6366F1"
                          strokeWidth="3"
                          strokeDasharray="5,5"
                        />
                        <circle cx={snapped.x} cy={snapped.y} r="6" fill="#6366F1" />
                      </>
                    );
                  })()}
                </g>
              )}

              {/* Temp preview for adding fixtures */}
              {tempMousePos && (tool === "add_door" || tool === "add_window" || tool === "add_room") && (
                <circle
                  cx={getSnappedCoords(tempMousePos.x, tempMousePos.y).x}
                  cy={getSnappedCoords(tempMousePos.x, tempMousePos.y).y}
                  r="10"
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2"
                  strokeDasharray="3,3"
                  className="animate-pulse"
                />
              )}

              {/* 6. Drawing ALL Rooms text badges labels */}
              {sheetRooms.map((room) => {
                const isSelected = selectedElement.type === "room" && selectedElement.id === room.id;
                return (
                  <g key={room.id} className="cursor-move">
                    {/* Background badge bounding block */}
                    <rect
                      x={room.x - 90}
                      y={room.y - 18}
                      width="180"
                      height="38"
                      rx="5"
                      fill={themeMode === "blueprint" ? "#1E293B" : "#FFFFFF"}
                      stroke={isSelected ? "#6366F1" : themeMode === "blueprint" ? "#3B82F6" : "#E2E8F0"}
                      strokeWidth={isSelected ? "2" : "1"}
                      filter="drop-shadow(0 2px 4px rgba(0,0,0,0.04))"
                    />
                    
                    {/* Room label text */}
                    <text
                      x={room.x}
                      y={room.y - 2}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="bold"
                      className={themeMode === "blueprint" ? "fill-white" : "fill-slate-800"}
                    >
                      {room.name}
                    </text>

                    {/* Calculated area text info */}
                    <text
                      x={room.x}
                      y={room.y + 12}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      className={themeMode === "blueprint" ? "fill-indigo-400" : "fill-indigo-600"}
                    >
                      {getRoomAreaStr(room)}
                    </text>
                  </g>
                );
              })}

              {/* Extracted room groups — drag anywhere in the frame to reposition the whole room */}
              {sheetBgImages
                .filter((bg) => bg.extracted)
                .map((bg) => {
                  const bounds = getRoomGroupBounds(bg.id, sheetWalls, sheetDoors, sheetWindows, sheetRooms, sheetFixtures);
                  if (!bounds) return null;
                  const pad = 16;
                  const isSelected = selectedBgId === bg.id;
                  const winFacing = inferGroupWindowFacing(bg.id, walls, windows);
                  const facingTag = winFacing ? ` · window ${winFacing}` : "";
                  const labelText = `🏠 ${bg.name}${facingTag}`;
                  const labelW = Math.max(120, labelText.length * 6.2 + 24);
                  return (
                    <g key={`room-group-${bg.id}`} style={{ pointerEvents: "none" }}>
                      <rect
                        x={bounds.minX - pad}
                        y={bounds.minY - pad}
                        width={bounds.maxX - bounds.minX + pad * 2}
                        height={bounds.maxY - bounds.minY + pad * 2}
                        fill={isSelected ? "rgba(99,102,241,0.07)" : "rgba(99,102,241,0.03)"}
                        stroke={isSelected ? "#6366F1" : "#C7D2FE"}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        strokeDasharray="10 5"
                        rx="8"
                      />
                      <rect
                        x={bounds.minX - pad + 4}
                        y={bounds.minY - pad - 20}
                        width={labelW}
                        height="18"
                        rx="4"
                        fill="#4F46E5"
                      />
                      <text
                        x={bounds.minX - pad + 12}
                        y={bounds.minY - pad - 7}
                        fill="#FFFFFF"
                        fontSize="9.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {labelText}
                      </text>
                    </g>
                  );
                })}

              {/* 7. Draw dragging joint circle highlights (Very intuitive CAD vertex editors!) */}
              {tool === "select" && (
                <g>
                  {(() => {
                    const joints = [];
                    const seen = new Set<string>();
                    
                    walls.forEach((w) => {
                      const k1 = `${w.x1},${w.y1}`;
                      const k2 = `${w.x2},${w.y2}`;
                      if (!seen.has(k1)) {
                        seen.add(k1);
                        joints.push({ x: w.x1, y: w.y1 });
                      }
                      if (!seen.has(k2)) {
                        seen.add(k2);
                        joints.push({ x: w.x2, y: w.y2 });
                      }
                    });

                    return joints.map((j, i) => (
                      <circle
                        key={i}
                        cx={j.x}
                        cy={j.y}
                        r="6"
                        fill="white"
                        stroke="#4F46E5"
                        strokeWidth="2.5"
                        className="hover:scale-125 cursor-pointer transition-all duration-150"
                        title="Drag this joint vertex node to adjust wall angles"
                      />
                    ));
                  })()}
                </g>
              )}

              {/* Calibration tool draft line render */}
              {tool === "calibrate" && calibrationPoint && tempMousePos && (
                <g>
                  <line
                    x1={calibrationPoint.x}
                    y1={calibrationPoint.y}
                    x2={tempMousePos.x}
                    y2={tempMousePos.y}
                    stroke="#4F46E5"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                  <circle cx={calibrationPoint.x} cy={calibrationPoint.y} r="5" fill="#4F46E5" />
                  <circle cx={tempMousePos.x} cy={tempMousePos.y} r="5" fill="#4F46E5" />
                </g>
              )}

              {/* 3b. Render Custom Saved Dimension lines with elegant drafting details */}
              {sheetDimensionLines.map((dim) => {
                const midX = (dim.x1 + dim.x2) / 2;
                const midY = (dim.y1 + dim.y2) / 2;
                const angle = Math.atan2(dim.y2 - dim.y1, dim.x2 - dim.x1) * (180 / Math.PI);
                const isSelected = selectedElement.type === "dimension" && selectedElement.id === dim.id;
                
                return (
                  <g
                    key={dim.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElement({ type: "dimension", id: dim.id });
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Extension line indicators at endpoints */}
                    <line x1={dim.x1} y1={dim.y1} x2={dim.x1 + Math.cos((angle - 90) * Math.PI / 180) * 15} y2={dim.y1 + Math.sin((angle - 90) * Math.PI / 180) * 15} stroke="#6366f1" strokeWidth="0.75" opacity="0.6" />
                    <line x1={dim.x2} y1={dim.y2} x2={dim.x2 + Math.cos((angle - 90) * Math.PI / 180) * 15} y2={dim.y2 + Math.sin((angle - 90) * Math.PI / 180) * 15} stroke="#6366f1" strokeWidth="0.75" opacity="0.6" />

                    {/* Main dimension stroke */}
                    <line
                      x1={dim.x1}
                      y1={dim.y1}
                      x2={dim.x2}
                      y2={dim.y2}
                      stroke={isSelected ? "#ec4899" : "#6366f1"}
                      strokeWidth={isSelected ? "2" : "1.25"}
                      strokeDasharray={isSelected ? "none" : "2 1"}
                    />
                    
                    {/* Architectural slash / ticks at ends */}
                    <line
                      x1={dim.x1 - Math.cos((angle - 45) * Math.PI / 180) * 7}
                      y1={dim.y1 - Math.sin((angle - 45) * Math.PI / 180) * 7}
                      x2={dim.x1 + Math.cos((angle - 45) * Math.PI / 180) * 7}
                      y2={dim.y1 + Math.sin((angle - 45) * Math.PI / 180) * 7}
                      stroke={isSelected ? "#ec4899" : "#6366f1"}
                      strokeWidth="2"
                    />
                    <line
                      x1={dim.x2 - Math.cos((angle - 45) * Math.PI / 180) * 7}
                      y1={dim.y2 - Math.sin((angle - 45) * Math.PI / 180) * 7}
                      x2={dim.x2 + Math.cos((angle - 45) * Math.PI / 180) * 7}
                      y2={dim.y2 + Math.sin((angle - 45) * Math.PI / 180) * 7}
                      stroke={isSelected ? "#ec4899" : "#6366f1"}
                      strokeWidth="2"
                    />

                    {/* Text label shield representing real world width + optional label */}
                    <g transform={`translate(${midX}, ${midY}) rotate(${Math.abs(angle) > 90 ? angle + 180 : angle})`}>
                      <rect
                        x={-Math.max(45, (dim.note.length * 4.5 + 20))}
                        y="-11"
                        width={Math.max(90, (dim.note.length * 9 + 40))}
                        height="18"
                        rx="3"
                        fill={themeMode === "blueprint" ? "#1e293b" : "#ffffff"}
                        stroke={isSelected ? "#ec4899" : "#6366f1"}
                        strokeWidth="0.75"
                      />
                      <text
                        x="0"
                        y="2"
                        textAnchor="middle"
                        fontSize="8.5"
                        fontWeight="bold"
                        fill={isSelected ? "#ec4899" : "#4f46e5"}
                        fontFamily="monospace"
                      >
                        📏 {dim.physicalLength.toFixed(1)}{dim.unit} {dim.note ? `[${dim.note}]` : ""}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Interactive Drafting Compass */}
              <g 
                transform="translate(900, 110)" 
                className="cursor-pointer group select-none no-print" 
                onClick={() => {
                  setCompassAngle((prev) => (prev + 45) % 360);
                  triggerNotification(`Site North set to ${((compassAngle + 45) % 360)}°`);
                }}
              >
                {/* Outer Ring */}
                <circle cx="0" cy="0" r="32" fill={themeMode === "blueprint" ? "#1e293b" : "#ffffff"} stroke={themeMode === "blueprint" ? "#38bdf8" : "#475569"} strokeWidth="1.5" />
                <circle cx="0" cy="0" r="35" fill="none" stroke={themeMode === "blueprint" ? "#38bdf8" : "#475569"} strokeWidth="0.5" strokeDasharray="3 3" />
                
                {/* Rotating dial needle */}
                <g transform={`rotate(${compassAngle})`}>
                  {/* Compass Needle - North (Red) */}
                  <path d="M 0,0 L -6,-4 L 0,-28 L 6,-4 Z" fill="#ef4444" />
                  {/* Compass Needle - South (Black/Indigo) */}
                  <path d="M 0,0 L -6,4 L 0,28 L 6,4 Z" fill={themeMode === "blueprint" ? "#94a3b8" : "#475569"} />
                  {/* Center Pin */}
                  <circle cx="0" cy="0" r="3" fill="#ffffff" stroke="#ef4444" strokeWidth="1" />
                </g>
                
                {/* Cardinal Letter Labels */}
                <text x="0" y="-38" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ef4444" fontFamily="sans-serif">N</text>
                <text x="0" y="46" textAnchor="middle" fontSize="9" fontWeight="bold" fill={themeMode === "blueprint" ? "#94a3b8" : "#475569"} fontFamily="sans-serif">S</text>
                <text x="40" y="3" textAnchor="middle" fontSize="9" fontWeight="bold" fill={themeMode === "blueprint" ? "#94a3b8" : "#475569"} fontFamily="sans-serif">E</text>
                <text x="-40" y="3" textAnchor="middle" fontSize="9" fontWeight="bold" fill={themeMode === "blueprint" ? "#94a3b8" : "#475569"} fontFamily="sans-serif">W</text>
                
                {/* Context Help overlay on hover */}
                <title>Drafting Compass - Click to rotate Site North orientation</title>
              </g>

              {/* SVG Blueprint Title Stamp Block overlay in Canvas (classic blueprint card!) */}
              <g transform="translate(10, 930)" className="no-print opacity-90">
                <rect
                  width="360"
                  height="60"
                  rx="6"
                  fill={themeMode === "blueprint" ? "#1E293B" : "#FFFFFF"}
                  stroke={themeMode === "blueprint" ? "#334155" : "#E2E8F0"}
                  strokeWidth="1.5"
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.05))"
                />
                <text x="12" y="18" fill={themeMode === "blueprint" ? "#F1F5F9" : "#1E293B"} fontSize="9.5" fontWeight="bold">
                  PROJECT: {projectTitle.slice(0, 48)}
                </text>
                <text x="12" y="32" fill={themeMode === "blueprint" ? "#94A3B8" : "#64748B"} fontSize="8.5">
                  CLIENT: {clientName} | CALIBRATED: {scale.calibrated ? "YES" : "NO"}
                </text>
                <text x="12" y="46" fill="#4F46E5" fontSize="8" fontWeight="bold">
                  SCALE: {scale.calibrated ? `1px = ${(scale.physicalLength / scale.pixelDistance).toFixed(4)} ${scale.unit}` : "UNLICENSED MOCK GRID"}
                </text>
                <line x1="240" y1="5" x2="240" y2="55" stroke={themeMode === "blueprint" ? "#334155" : "#E2E8F0"} strokeWidth="1" />
                <g transform={`translate(290, 30) rotate(${compassAngle})`}>
                  <circle r="16" fill="none" stroke="#4F46E5" strokeWidth="1" />
                  <line x1="0" y1="-12" x2="0" y2="12" stroke="#4F46E5" strokeWidth="1" />
                  <line x1="-12" y1="0" x2="12" y2="0" stroke="#4F46E5" strokeWidth="1" />
                  <text x="-3" y="-18" fill="#4F46E5" fontSize="8" fontWeight="bold" transform="scale(0.8)">N</text>
                </g>
              </g>

            </svg>
          </div>

          {/* BELOW CANVAS SLIDER FOR TRACING IMAGE OPACITY */}
          {(uploadedImage || bgImages.some((b) => b.extracted && b.showReferencePhoto !== false)) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showTracingImages}
                    onChange={(e) => setShowTracingImages(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ml-2.5 text-xs font-semibold text-slate-700">
                    Show Reference Photos
                  </span>
                </label>
              </div>
              
              {showTracingImages && (
                <div className="flex-1 flex items-center gap-4">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                    <Sliders className="w-4 h-4 text-slate-400" />
                    Overlay Image Opacity:
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">0%</span>
                    <input
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.05"
                      value={imageOpacity}
                      onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-[10px] text-slate-400">100%</span>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 w-10 text-right">
                    {Math.round(imageOpacity * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

        </div> {/* Close Interactive Blueprint Grid Canvas */}
      </div> {/* Close Unified Left/Center Column (col-span-8) */}

      {/* LEFT SIDEBAR: CONTROL & PROPERTIES COCKPIT */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        
        {/* MULTI-IMAGE INPUT SOURCE & LEGO BLOCKS WORKBENCH */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-600" />
              1. Tracing Source & Lego Blocks
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-650 text-[9.5px] font-bold uppercase tracking-wider">
              Multi-Image Support
            </span>
          </h3>

          {/* Drag & Drop Upload Spot */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center gap-2.5 relative overflow-hidden group cursor-pointer ${
              isDraggingOver
                ? "border-indigo-600 bg-indigo-150/40 ring-4 ring-indigo-50"
                : "border-indigo-100/70 bg-indigo-50/20 hover:border-indigo-400 hover:bg-indigo-50/40"
            }`}
          >
            <div className="p-2.5 bg-indigo-50 rounded-full text-indigo-600 group-hover:text-indigo-700 transition-colors">
              <Upload className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="text-xs text-indigo-700 font-bold block">Upload Room Images</span>
              <p className="text-[10px] text-slate-400 mt-1">
                Upload photos, sketches, or scans of each room. AI reconstructs a floor plan per block — arrange blocks like Lego to build the full plan.
              </p>
              {isCloudApiEnabled() && (
                <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      R2 bucket: floorplan/{userSession.r2Prefix}/
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {userSession.isTemp
                        ? "Temporary guest folder — sign up to keep your uploads permanently."
                        : userSession.type === "test"
                        ? "Test user folder."
                        : `Permanent account: ${userSession.userId}`}
                    </span>
                  </div>
                  {userSession.isTemp && (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={signupUsername}
                        onChange={(e) => setSignupUsername(e.target.value)}
                        placeholder="Choose username"
                        className="flex-1 text-[10px] px-2 py-1 border border-slate-200 rounded font-mono"
                      />
                      <button
                        type="button"
                        disabled={isClaiming}
                        onClick={handleClaimAccount}
                        className="text-[10px] px-2 py-1 bg-indigo-600 text-white rounded font-semibold disabled:opacity-50"
                      >
                        {isClaiming ? "…" : "Sign up"}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const session = useTestUser();
                      setUserSession(session);
                      triggerNotification("Using test folder: floorplan/test/");
                    }}
                    className="text-[10px] px-2 py-1 bg-slate-200 text-slate-700 rounded font-semibold w-full"
                  >
                    Switch to test user (floorplan/test/)
                  </button>
                </div>
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleMultipleFiles}
              className="hidden"
            />
          </div>

          {/* PLACED LEGO IMAGES LIST */}
          {sheetBgImages.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                {sheetBgImages.some((b) => b.extracted) ? "✅ Extracted Rooms" : "🧩 Room Blocks"} ({sheetBgImages.length})
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {sheetBgImages.map((bg) => {
                  const isSelected = selectedBgId === bg.id;
                  return (
                    <div
                      key={bg.id}
                      onClick={() => setSelectedBgId(bg.id)}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? "bg-indigo-50 border-indigo-300 shadow-sm"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-sm">🧩</span>
                        <span className={`font-medium ${isSelected ? "text-indigo-900 font-semibold" : "text-slate-700"}`}>
                          {bg.extracted ? "✓ " : ""}{bg.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          title="Delete this block"
                          onClick={(e) => {
                            e.stopPropagation();
                            const hasLinked = 
                              walls.some((w) => w.bgImageId === bg.id) ||
                              doors.some((d) => d.bgImageId === bg.id) ||
                              windows.some((wn) => wn.bgImageId === bg.id) ||
                              rooms.some((r) => r.bgImageId === bg.id);

                            if (hasLinked) {
                              const deleteLinked = window.confirm(
                                `Delete Lego block "${bg.name}"?\n\nThis block has linked architectural layout vectors.\n• Click OK to delete both the image block AND all of its linked vectors.\n• Click Cancel to remove only the background block while keeping its vectors as independent standard canvas items.`
                              );
                              saveHistoryState();
                              if (deleteLinked) {
                                setWalls((prev) => prev.filter((w) => w.bgImageId !== bg.id));
                                setDoors((prev) => prev.filter((d) => d.bgImageId !== bg.id));
                                setWindows((prev) => prev.filter((wn) => wn.bgImageId !== bg.id));
                                setRooms((prev) => prev.filter((r) => r.bgImageId !== bg.id));
                                setFixtures((prev) => prev.filter((f) => f.bgImageId !== bg.id));
                                triggerNotification(`Deleted block "${bg.name}" and cleared all of its associated vector layout elements.`);
                              } else {
                                setWalls((prev) => prev.map((w) => w.bgImageId === bg.id ? { ...w, bgImageId: undefined } : w));
                                setDoors((prev) => prev.map((d) => d.bgImageId === bg.id ? { ...d, bgImageId: undefined } : d));
                                setWindows((prev) => prev.map((wn) => wn.bgImageId === bg.id ? { ...wn, bgImageId: undefined } : wn));
                                setRooms((prev) => prev.map((r) => r.bgImageId === bg.id ? { ...r, bgImageId: undefined } : r));
                                setFixtures((prev) => prev.map((f) => f.bgImageId === bg.id ? { ...f, bgImageId: undefined } : f));
                                triggerNotification(`Deleted block "${bg.name}". Extracted layout elements preserved and committed to the main canvas.`);
                              }
                            } else {
                              saveHistoryState();
                              triggerNotification(`Deleted background tracing card "${bg.name}".`);
                            }

                            setBgImages((prev) => prev.filter((item) => item.id !== bg.id));
                            setMissedHighlights((prev) => prev.filter((h) => h.bgImageId !== bg.id));
                            if (selectedBgId === bg.id) setSelectedBgId(null);
                          }}
                          className="p-1 rounded text-rose-500 hover:bg-rose-100/50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SELECTED LEGO CONTROLLER */}
          {selectedBgId && (() => {
            const selectedBg = bgImages.find((b) => b.id === selectedBgId);
            if (!selectedBg) return null;
            return (
              <div className="mt-4 border-t border-indigo-100 pt-4 bg-indigo-50/30 p-3 rounded-lg border border-indigo-50 animate-fadeIn text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-900 flex items-center gap-1">
                    {selectedBg.extracted ? "🏠" : "🔧"} {selectedBg.extracted ? "Room" : "Edit Block"}:{" "}
                    <span className="font-mono text-indigo-700">{selectedBg.name.slice(0, 20)}</span>
                  </span>
                  <button
                    onClick={() => setSelectedBgId(null)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                  >
                    Deselect
                  </button>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Room Name {selectedBg.extracted ? "(AI detected — editable)" : "(editable)"}
                  </span>
                  <input
                    type="text"
                    value={selectedBg.name}
                    onChange={(e) => updateSelectedBgImage({ name: e.target.value })}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded mt-1 text-slate-800"
                    placeholder="e.g. Living Room, Kitchen"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 font-medium block">
                    Window / glass faces (on property)
                  </span>
                  <p className="text-[9px] text-slate-400 mt-0.5 mb-1.5 leading-relaxed">
                    Photos look into the room. Set which way the glazed wall faces so rooms connect correctly — e.g. kitchen south, living room north.
                  </p>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: "north" as const, label: "N ↑" },
                        { id: "south" as const, label: "S ↓" },
                        { id: "east" as const, label: "E →" },
                        { id: "west" as const, label: "W ←" },
                      ] as const
                    ).map((dir) => {
                      const active =
                        (selectedBg.windowFacing ?? "north") === dir.id;
                      return (
                        <button
                          key={dir.id}
                          type="button"
                          onClick={() => updateSelectedBgImage({ windowFacing: dir.id })}
                          className={`py-1.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                            active
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                          }`}
                        >
                          {dir.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedBg.extracted && selectedBg.roomWidthM && selectedBg.roomDepthM && (
                  <div className="bg-white/70 px-2.5 py-2 rounded-lg border border-indigo-100 text-[10px] text-slate-600">
                    <span className="font-bold text-indigo-700">
                      {selectedBg.roomWidthM} × {selectedBg.roomDepthM} m
                    </span>
                    <span className="text-slate-400 block mt-0.5">
                      Playground scale: {PLAYGROUND_PX_PER_M} px/m — sizes differ per room
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      {selectedBg.extracted ? "Rotate room group" : "Rotate block"}
                    </span>
                    <span className="font-bold font-mono text-indigo-600">{selectedBg.rotation}°</span>
                  </div>
                  {selectedBg.extracted && (
                    <p className="text-[9px] text-slate-400 mt-0.5 mb-1">
                      Spin to align adjoining rooms — e.g. rotate kitchen 180° so its south window does not open into the living room.
                    </p>
                  )}
                  <div className="flex gap-1 mt-1.5 mb-1.5">
                    <button
                      type="button"
                      onClick={() => rotateRoomGroupBy(-90)}
                      className="flex-1 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-700 cursor-pointer"
                    >
                      ↺ 90°
                    </button>
                    <button
                      type="button"
                      onClick={() => rotateRoomGroupBy(90)}
                      className="flex-1 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-700 cursor-pointer"
                    >
                      ↻ 90°
                    </button>
                    <button
                      type="button"
                      onClick={() => rotateRoomGroupBy(180)}
                      className="flex-1 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-700 cursor-pointer"
                    >
                      180°
                    </button>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={selectedBg.rotation}
                    onMouseDown={() => saveHistoryState()}
                    onChange={(e) => updateSelectedBgImage({ rotation: parseInt(e.target.value) })}
                    className="w-full accent-indigo-600 h-1 bg-slate-200 rounded cursor-pointer"
                  />
                </div>

                {selectedBg.extracted && (
                  <div className="space-y-2.5 pt-1 border-t border-indigo-100/60">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-[10px] text-slate-600 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBg.showReferencePhoto !== false}
                          onChange={(e) =>
                            updateSelectedBgImage({ showReferencePhoto: e.target.checked })
                          }
                          className="accent-indigo-600"
                        />
                        Show clipped reference photo
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          saveHistoryState();
                          updateSelectedBgImage({ showReferencePhoto: false });
                          setMissedHighlights((prev) =>
                            prev.filter((h) => h.bgImageId !== selectedBg.id)
                          );
                          triggerNotification(
                            `Reference photo hidden for "${selectedBg.name}". Vectors kept — add items manually or re-enable photo.`
                          );
                        }}
                        className="text-[9px] text-rose-600 hover:text-rose-700 underline cursor-pointer"
                      >
                        Remove photo
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-relaxed">
                      Photo stays aligned under the floor plan for scale. Highlight missed doors/windows, or place items manually over the photo.
                    </p>

                    {selectedBg.showReferencePhoto !== false && (
                      <div className="bg-white/70 p-2.5 rounded-lg border border-amber-100 space-y-2">
                        <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block">
                          Mark missed items
                        </span>
                        <select
                          value={highlightItemType}
                          onChange={(e) =>
                            setHighlightItemType(e.target.value as "door" | "window" | "fixture")
                          }
                          className="w-full text-xs px-2 py-1.5 bg-white border border-slate-200 rounded"
                        >
                          <option value="door">Door (e.g. beside glass wall)</option>
                          <option value="window">Window / glass panel</option>
                          <option value="fixture">Fixture / furniture</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setTool("highlight_miss");
                            triggerNotification(
                              "Drag on the reference photo to draw highlight boxes over missed items."
                            );
                          }}
                          className={`w-full py-1.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                            tool === "highlight_miss"
                              ? "bg-amber-100 border-amber-300 text-amber-900"
                              : "bg-white border-amber-200 text-amber-800 hover:bg-amber-50"
                          }`}
                        >
                          {tool === "highlight_miss" ? "Drawing highlights…" : "Draw highlight regions"}
                        </button>
                        {missedHighlights.filter((h) => h.bgImageId === selectedBg.id).length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] text-slate-500">
                              {missedHighlights.filter((h) => h.bgImageId === selectedBg.id).length}{" "}
                              highlight(s) ready
                            </span>
                            <button
                              type="button"
                              disabled={isConverting}
                              onClick={() => handleRefineMissedHighlights()}
                              className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg cursor-pointer"
                            >
                              {isConverting ? "Finding missed items…" : "AI: add highlighted items"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                saveHistoryState();
                                setMissedHighlights((prev) =>
                                  prev.filter((h) => h.bgImageId !== selectedBg.id)
                                );
                              }}
                              className="w-full py-1 text-[9px] text-slate-500 hover:text-slate-700 underline cursor-pointer"
                            >
                              Clear highlights
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!selectedBg.extracted && (
                  <>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>Scale / Dimension multiplier</span>
                        <span className="font-bold font-mono text-indigo-600">x{selectedBg.scale.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.30"
                        max="2.50"
                        step="0.05"
                        value={selectedBg.scale}
                        onChange={(e) => updateSelectedBgImage({ scale: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-600 h-1 bg-slate-200 rounded mt-1.5 cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {/* TRANSLATION SLIDERS */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[9px] text-slate-500 block">X Coords</span>
                    <input
                      type="number"
                      value={selectedBg.x}
                      onChange={(e) => updateSelectedBgImage({ x: parseInt(e.target.value) || 0 })}
                      className="w-full text-xs px-1.5 py-1 bg-white border border-slate-200 rounded mt-1 font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-550 block block">Y Coords</span>
                    <input
                      type="number"
                      value={selectedBg.y}
                      onChange={(e) => updateSelectedBgImage({ y: parseInt(e.target.value) || 0 })}
                      className="w-full text-xs px-1.5 py-1 bg-white border border-slate-200 rounded mt-1 font-mono text-slate-800"
                    />
                  </div>
                </div>

                {/* FINE BLOCK NUDGE CLUSTER */}
                <div>
                  <span className="text-[9px] text-slate-500 block mb-1">Fine-Tune Alignment</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => nudgeSelectedBgImage(-5, 0)}
                      className="flex-1 py-1 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-slate-600 text-[10px] cursor-pointer"
                    >
                      ◀ -5px
                    </button>
                    <button
                      onClick={() => nudgeSelectedBgImage(5, 0)}
                      className="flex-1 py-1 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-slate-600 text-[10px] cursor-pointer"
                    >
                      +5px ▶
                    </button>
                    <button
                      onClick={() => nudgeSelectedBgImage(0, -5)}
                      className="flex-1 py-1 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-slate-600 text-[10px] cursor-pointer"
                    >
                      ▲ -5px
                    </button>
                    <button
                      onClick={() => nudgeSelectedBgImage(0, 5)}
                      className="flex-1 py-1 bg-white hover:bg-indigo-50 border border-slate-200 rounded text-slate-600 text-[10px] cursor-pointer"
                    >
                      ▼ +5px
                    </button>
                  </div>
                </div>

                {/* BLOCK LAYER LAYOUT ACTIONS */}
                <div className="pt-2 border-t border-indigo-100/50 space-y-2">
                  {(() => {
                    const boundWalls = walls.filter((w) => w.bgImageId === selectedBg.id).length;
                    const boundOthers = 
                      doors.filter((d) => d.bgImageId === selectedBg.id).length +
                      windows.filter((wn) => wn.bgImageId === selectedBg.id).length +
                      rooms.filter((r) => r.bgImageId === selectedBg.id).length;
                    
                    return (
                      <>
                        <div className="bg-white/60 p-2 rounded border border-indigo-100/30 flex flex-col gap-1">
                          <div className="flex justify-between items-center text-[10px] text-slate-500">
                            <span>📋 Linked Architectural Vectors</span>
                            <span className="font-bold font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {boundWalls} walls, {boundOthers} items
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-400">
                            Moving or rotating this Lego block will auto-transform all of its linked walls & doors.
                          </p>
                        </div>

                      </>
                    );
                  })()}
                </div>

              </div>
            );
          })()}

          {/* AI model selector (OpenRouter) */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              AI Model (OpenRouter)
            </label>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                localStorage.setItem("floorplan_ai_model", e.target.value);
              }}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800"
            >
              {EXTRACTION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.provider}) — {m.description}
                </option>
              ))}
            </select>
          </div>

          {/* Additional context parameter */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Custom Architectural Hints (Optional)
            </label>
            <textarea
              placeholder="e.g. 'Align entrance door horizontally', 'Bedroom is on the top left', 'Approx wall thickness 15cm'"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              className="w-full h-16 text-xs px-3 py-2 bg-white rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-sans text-slate-800 placeholder-slate-400 resize-none"
            />
          </div>

          <div className="mt-3.5 flex flex-col gap-2">
            <button
              onClick={() => handleDigitizeAllBlocks()}
              disabled={isConverting || bgImages.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:opacity-50 disabled:text-slate-400 text-white font-medium text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {isConverting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  Extracting all blocks...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-200" />
                  Extract All Blocks ({bgImages.length})
                </>
              )}
            </button>
            {selectedBgId && (
              <button
                onClick={() => handleDigitizeFloorplan()}
                disabled={isConverting}
                className="w-full bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium text-xs py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                Re-extract selected block only
              </button>
            )}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
            Set each room&apos;s window direction (N/S/E/W) before extract. After extract, use ↻ 90° / 180° to rotate room groups so adjoining rooms connect Lego-style. Click furniture to edit; drag empty area to move the group.
          </p>
        </div>

        {/* MENU NAVIGATION TAB SYSTEM */}
        <div className="bg-slate-100 p-1.5 rounded-xl grid grid-cols-2 gap-1 border border-slate-200/60 shadow-inner no-print">
          <button
            onClick={() => setSidebarTab("properties")}
            className={`py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              sidebarTab === "properties"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Settings & Props
          </button>
          <button
            onClick={() => setSidebarTab("templates")}
            className={`py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              sidebarTab === "templates"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            Instant Templates
          </button>
        </div>

        {sidebarTab === "properties" ? (
          <>
            {/* SELECTION PROPERTIES INSPECTOR */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                <span>🔍 Properties Inspector</span>
                {selectedElement.type !== "none" && (
                  <span className="bg-indigo-50 text-indigo-600 font-bold text-[9.5px] px-2 py-0.5 rounded uppercase border border-indigo-100">
                    {selectedElement.type} Active
                  </span>
                )}
              </h3>

              {/* GLOBAL METRIC / IMPERIAL SELECTOR SYSTEM */}
              <div className="mb-4">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                  📏 Main Dimension Unit
                </span>
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-lg">
                  {(["m", "cm", "ft", "in"] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => handleUnitChange(u)}
                      className={`py-1 text-[10.5px] font-bold rounded transition-all cursor-pointer ${
                        scale.unit === u
                          ? "bg-white text-indigo-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {u === "m" && "m"}
                      {u === "cm" && "cm"}
                      {u === "ft" && "ft"}
                      {u === "in" && "in"}
                    </button>
                  ))}
                </div>
              </div>

              {/* COMPASS DIRECTION COORDINATOR */}
              <div className="mb-4 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    🧭 Site North Orientation
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-600">
                    {compassAngle}° N
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={compassAngle}
                  onChange={(e) => setCompassAngle(parseInt(e.target.value))}
                  className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1.5"
                />
                <p className="text-[9px] text-slate-400 mt-1">
                  Adjust Site North. Windows will calculate true solar daylight exposure (e.g. West-facing afternoon sun).
                </p>
              </div>

              {(() => {
                const details = getSelectedDetails();
                if (!details) {
                  return (
                    <div className="text-center py-8 text-slate-400 flex flex-col items-center justify-center gap-2 border-t border-slate-100 pt-5">
                      <MousePointer2 className="w-8 h-8 text-slate-300 animate-pulse" />
                      <p className="text-xs font-semibold text-slate-600">No Vector Element Selected</p>
                      <p className="text-[10px] mt-1 max-w-[200px] text-slate-400 leading-normal">
                        Click any wall lines, doors, windows, or labels on the blueprint stage to adjust positions and swap layouts.
                      </p>
                    </div>
                  );
                }

                // If selected WALL
                if (selectedElement.type === "wall") {
                  const wall = details as Wall;
                  return (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <div>
                        <span className="text-xs text-slate-500 font-medium">Wall Type</span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {WALL_ITEMS.map((wallItem) => (
                            <button
                              key={wallItem.type}
                              onClick={() => updateSelectedWall({ type: wallItem.type })}
                              className={`py-1 px-2 rounded text-xs font-bold border transition-colors cursor-pointer ${
                                wall.type === wallItem.type
                                  ? "bg-indigo-600 text-white border-indigo-500"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {wallItem.icon} {wallItem.label.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Wall Coordinate Inputs */}
                      <div>
                        <span className="text-xs text-slate-500 font-medium">Manual Edge Vectors (px)</span>
                        <div className="grid grid-cols-2 gap-2 mt-1.5 text-xs">
                          <div>
                            <span className="text-[9px] text-slate-400 mr-1">Start X</span>
                            <input
                              type="number"
                              value={wall.x1}
                              onChange={(e) => updateSelectedWall({ x1: parseInt(e.target.value) || 0 })}
                              className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800"
                            />
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 mr-1">Start Y</span>
                            <input
                              type="number"
                              value={wall.y1}
                              onChange={(e) => updateSelectedWall({ y1: parseInt(e.target.value) || 0 })}
                              className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800"
                            />
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 mr-1">End X</span>
                            <input
                              type="number"
                              value={wall.x2}
                              onChange={(e) => updateSelectedWall({ x2: parseInt(e.target.value) || 0 })}
                              className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800"
                            />
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 mr-1">End Y</span>
                            <input
                              type="number"
                              value={wall.y2}
                              onChange={(e) => updateSelectedWall({ y2: parseInt(e.target.value) || 0 })}
                              className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800"
                            />
                          </div>
                        </div>
                      </div>

                      {scale.calibrated && (
                        <div className="bg-indigo-50/50 p-2 rounded-lg border border-indigo-100 flex items-center justify-between">
                          <span className="text-[10px] text-indigo-900 font-medium">Calibrated Dimension</span>
                          <span className="text-xs font-bold text-indigo-700">
                            {getWallPhysicalLengthStr(wall)} Length
                          </span>
                        </div>
                      )}

                      <button
                        onClick={handleDeleteSelected}
                        className="w-full mt-3 py-1.5 px-3 rounded bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 transition-all text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Wall Segment
                      </button>
                    </div>
                  );
                }

                // If selected DOOR
                if (selectedElement.type === "door") {
                  const door = details as Door;
                  return (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <div>
                        <span className="text-xs text-slate-500">Door Type</span>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          {DOOR_ITEMS.map((doorItem) => (
                            <button
                              key={doorItem.type}
                              onClick={() => updateSelectedDoor({ doorType: doorItem.type })}
                              className={`py-1 px-2 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                (door.doorType ?? "hinged") === doorItem.type
                                  ? "bg-indigo-600 text-white border-indigo-500"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {doorItem.icon} {doorItem.label.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-xs text-slate-500">Anchor Placement</span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button
                            onClick={() => updateSelectedDoor({ orientation: "h" })}
                            className={`py-1 px-3 rounded text-xs font-semibold border cursor-pointer ${
                              door.orientation === "h"
                                ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            Horizontal Wall
                          </button>
                          <button
                            onClick={() => updateSelectedDoor({ orientation: "v" })}
                            className={`py-1 px-3 rounded text-xs font-semibold border cursor-pointer ${
                              door.orientation === "v"
                                ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            Vertical Wall
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-xs text-slate-500">Hinge Swing Direction</span>
                        <div className="grid grid-cols-4 gap-1 mt-1 text-center">
                          {["n", "s", "e", "w"].map((swing) => (
                            <button
                              key={swing}
                              onClick={() => updateSelectedDoor({ swing: swing as any })}
                              className={`py-1 px-2 rounded text-xs font-bold uppercase transition-colors cursor-pointer ${
                                door.swing === swing
                                  ? "bg-indigo-600 text-white"
                                  : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
                              }`}
                            >
                              {swing}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Precise Coords Door */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400">Door Anchor X (px)</span>
                          <input
                            type="number"
                            value={door.x}
                            onChange={(e) => updateSelectedDoor({ x: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">Door Anchor Y (px)</span>
                          <input
                            type="number"
                            value={door.y}
                            onChange={(e) => updateSelectedDoor({ y: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                          <span>Leaf Swing Size (Width)</span>
                          <span className="font-bold font-mono text-indigo-600">{door.width}px</span>
                        </div>
                        <input
                          type="range"
                          min="30"
                          max="120"
                          value={door.width}
                          onChange={(e) => updateSelectedDoor({ width: parseInt(e.target.value) })}
                          className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer mt-1"
                        />
                      </div>

                      <button
                        onClick={handleDeleteSelected}
                        className="w-full mt-3 py-1.5 px-3 rounded bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 transition-all text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Door
                      </button>
                    </div>
                  );
                }

                // If selected WINDOW
                if (selectedElement.type === "window") {
                  const win = details as WindowLayout;
                  return (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <div>
                        <span className="text-xs text-slate-500">Window Type</span>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          {WINDOW_ITEMS.map((winItem) => (
                            <button
                              key={winItem.type}
                              onClick={() => updateSelectedWindow({ windowType: winItem.type })}
                              className={`py-1 px-2 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                (win.windowType ?? "fixed") === winItem.type
                                  ? "bg-indigo-600 text-white border-indigo-500"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {winItem.icon} {winItem.label.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-xs text-slate-500">Wall Orientation</span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button
                            onClick={() => updateSelectedWindow({ orientation: "h" })}
                            className={`py-1 px-3 rounded text-xs font-semibold border cursor-pointer ${
                              win.orientation === "h"
                                ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            Horizontal
                          </button>
                          <button
                            onClick={() => updateSelectedWindow({ orientation: "v" })}
                            className={`py-1 px-3 rounded text-xs font-semibold border cursor-pointer ${
                              win.orientation === "v"
                                ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            Vertical
                          </button>
                        </div>
                      </div>

                      {/* Precise Coords Window */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400">Anchor X (px)</span>
                          <input
                            type="number"
                            value={win.x}
                            onChange={(e) => updateSelectedWindow({ x: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">Anchor Y (px)</span>
                          <input
                            type="number"
                            value={win.y}
                            onChange={(e) => updateSelectedWindow({ y: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                          <span>Glazing Glass Size (Width)</span>
                          <span className="font-bold font-mono text-indigo-600">{win.width}px</span>
                        </div>
                        <input
                          type="range"
                          min="40"
                          max="200"
                          value={win.width}
                          onChange={(e) => updateSelectedWindow({ width: parseInt(e.target.value) })}
                          className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer mt-1"
                        />
                      </div>

                      {/* premium astronomical sun exposure block */}
                      <div className="bg-sky-50 border border-sky-100 p-3 rounded-lg text-[11px] leading-relaxed mt-2">
                        <span className="text-[10px] text-sky-850 font-bold uppercase tracking-wider block mb-1">
                          ☀️ Solar daylight exposure
                        </span>
                        {(() => {
                          const facing = getFacingDirections(win.orientation);
                          return (
                            <div className="space-y-1.5 font-sans">
                              <div>
                                <span className="font-bold text-slate-500">Normal Vector A:</span>
                                <p className="font-semibold text-indigo-700">{facing.sideA}</p>
                              </div>
                              <div>
                                <span className="font-bold text-slate-500">Normal Vector B:</span>
                                <p className="font-semibold text-indigo-700">{facing.sideB}</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <button
                        onClick={handleDeleteSelected}
                        className="w-full mt-3 py-1.5 px-3 rounded bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 transition-all text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Window
                      </button>
                    </div>
                  );
                }

                // If selected PRECISION DRAWING DIMENSION
                if (selectedElement.type === "dimension") {
                  const dim = details as any;
                  return (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <div>
                        <span className="text-xs text-slate-500 font-medium font-sans">Dimension Label / Notes</span>
                        <input
                          type="text"
                          value={dim?.note || ""}
                          onChange={(e) => {
                            setDimensionLines((prev) =>
                              prev.map((d) => (d.id === dim.id ? { ...d, note: e.target.value } : d))
                            );
                          }}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded mt-1 text-slate-800 animate-none"
                          placeholder="e.g. Master Bedroom Width"
                        />
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-medium">Physical Segment Span ({dim?.unit})</span>
                        <input
                          type="number"
                          step="0.1"
                          value={dim?.physicalLength || 0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setDimensionLines((prev) =>
                              prev.map((d) => (d.id === dim.id ? { ...d, physicalLength: val } : d))
                            );
                          }}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded mt-1 font-mono text-slate-800"
                        />
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded text-[10px] text-slate-500 leading-normal border border-slate-100 font-sans">
                        You can adjust endpoints by dragging joints on the main blueprint grid, or use keyboard Backspace/Delete to remove.
                      </div>
                      <button
                        onClick={handleDeleteSelected}
                        className="w-full mt-3 py-1.5 px-3 rounded bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 transition-all text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Dimension Line
                      </button>
                    </div>
                  );
                }

                // If selected ROOM LABEL
                if (selectedElement.type === "room") {
                  const room = details as Room;
                  const commonRooms = ["Kitchen", "Living Room", "Master Bed", "Kids Bed", "Bathroom", "Foyer", "Office", "Garage"];
                  return (
                    <div className="space-y-4 border-t border-slate-100 pt-4">
                      <div>
                        <span className="text-xs text-slate-500 font-medium">Room Name Label</span>
                        <input
                          type="text"
                          value={room.name}
                          onChange={(e) => updateSelectedRoom({ name: e.target.value })}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-indigo-500 rounded mt-1 font-sans text-slate-800"
                          placeholder="e.g. Master Suite"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5 font-bold">
                          Quick Titles
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {commonRooms.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => updateSelectedRoom({ name: tag })}
                              className="text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600 cursor-pointer"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Precise Coords Room Label */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400">Centroid X (px)</span>
                          <input
                            type="number"
                            value={room.x}
                            onChange={(e) => updateSelectedRoom({ x: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">Centroid Y (px)</span>
                          <input
                            type="number"
                            value={room.y}
                            onChange={(e) => updateSelectedRoom({ y: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1"
                          />
                        </div>
                      </div>

                      <div>
                        <span className="text-xs text-slate-500 font-medium">
                          Estimated Area ({scale.unit === "m" ? "m²" : scale.unit === "cm" ? "cm²" : scale.unit === "ft" ? "sq ft" : "sq in"})
                        </span>
                        <input
                          type="number"
                          step="0.5"
                          value={room.estimatedAreaM2 || 12}
                          onChange={(e) =>
                            updateSelectedRoom({ estimatedAreaM2: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-indigo-500 rounded mt-1 font-mono text-slate-800"
                        />
                      </div>

                      <button
                        onClick={handleDeleteSelected}
                        className="w-full mt-3 py-1.5 px-3 rounded bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 transition-all text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Room Zone
                      </button>
                    </div>
                  );
                }

                // If selected FIXTURE / STAMP
                if (selectedElement.type === "fixture") {
                  const fixture = details as Fixture;
                  return (
                    <div className="space-y-4 border-t border-slate-100 pt-4 text-slate-700">
                      <div>
                        <span className="text-xs text-slate-500 font-medium font-sans">Stamp Label Designation</span>
                        <input
                          type="text"
                          value={fixture.label || ""}
                          onChange={(e) => updateSelectedFixture({ label: e.target.value })}
                          className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 focus:outline-none focus:border-indigo-500 rounded mt-1 font-sans text-slate-800 animate-none"
                          placeholder={`e.g. Master ${fixture.type.toUpperCase()}`}
                        />
                      </div>

                      {/* Dimensions Resizing Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Width (px)</span>
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="number"
                              value={fixture.width}
                              onChange={(e) => updateSelectedFixture({ width: Math.max(10, parseInt(e.target.value) || 10) })}
                              className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Height (px)</span>
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="number"
                              value={fixture.height}
                              onChange={(e) => updateSelectedFixture({ height: Math.max(10, parseInt(e.target.value) || 10) })}
                              className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Rotation Slider */}
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span className="font-medium">Rotation Angle</span>
                          <span className="font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            {fixture.rotation || 0}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          step="15"
                          value={fixture.rotation || 0}
                          onChange={(e) => updateSelectedFixture({ rotation: parseInt(e.target.value) || 0 })}
                          className="w-full accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none mt-1"
                        />
                        <div className="flex gap-1 mt-2">
                          <button
                            onClick={() => updateSelectedFixture({ rotation: ((fixture.rotation || 0) + 90) % 360 })}
                            className="flex-1 text-[10px] font-semibold bg-slate-50 hover:bg-slate-100 py-1.5 border border-slate-205 rounded text-slate-600 transition-colors cursor-pointer"
                          >
                            Rotate +90°
                          </button>
                          <button
                            onClick={() => updateSelectedFixture({ rotation: ((fixture.rotation || 0) + 270) % 360 })}
                            className="flex-1 text-[10px] font-semibold bg-slate-50 hover:bg-slate-100 py-1.5 border border-slate-205 rounded text-slate-600 transition-colors cursor-pointer"
                          >
                            Rotate -90°
                          </button>
                        </div>
                      </div>

                      {/* Precise Coords */}
                      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                        <div>
                          <span className="text-[10px] text-slate-400">Position X (px)</span>
                          <input
                            type="number"
                            value={fixture.x}
                            onChange={(e) => updateSelectedFixture({ x: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1 focus:outline-none"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400">Position Y (px)</span>
                          <input
                            type="number"
                            value={fixture.y}
                            onChange={(e) => updateSelectedFixture({ y: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-800 mt-1 focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleDeleteSelected}
                        className="w-full mt-3 py-1.5 px-3 rounded bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 transition-all text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Components Stamp
                      </button>
                    </div>
                  );
                }
              })()}

              {/* 🎯 ADVANCED POSITION NUDGER KEYPAD */}
              {selectedElement.type !== "none" && (
                <div className="mt-5 border-t border-slate-100 pt-4 bg-slate-50/50 p-3 rounded-lg border border-slate-150">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                    🎯 Vector Fine-Tune Nudger
                  </span>
                  
                  {/* Step toggle selector */}
                  <div className="flex items-center gap-1 mb-2.5">
                    <span className="text-[10px] text-slate-400 mr-auto font-medium">Nudge Step:</span>
                    {([1, 5, 20, 50] as const).map((step) => (
                      <button
                        key={step}
                        onClick={() => setNudgeStep(step)}
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border transition-colors cursor-pointer ${
                          nudgeStep === step
                            ? "bg-indigo-600 text-white border-indigo-650"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {step}px
                      </button>
                    ))}
                  </div>

                  {/* CROSS DIRECTIONAL DECKS */}
                  <div className="flex flex-col items-center justify-center gap-1 w-full max-w-[140px] mx-auto mt-2.5">
                    {/* Up arrow */}
                    <button
                      onClick={() => nudgeSelectedElement(0, -nudgeStep)}
                      className="w-9 h-9 flex items-center justify-center bg-white hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 border border-slate-200 rounded-lg shadow-sm font-semibold text-slate-700 select-none cursor-pointer"
                      title="Nudge Up"
                    >
                      ▲
                    </button>
                    <div className="flex gap-1 w-full items-center justify-center">
                      {/* Left arrow */}
                      <button
                        onClick={() => nudgeSelectedElement(-nudgeStep, 0)}
                        className="w-9 h-9 flex items-center justify-center bg-white hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 border border-slate-200 rounded-lg shadow-sm font-semibold text-slate-700 select-none cursor-pointer"
                        title="Nudge Left"
                      >
                        ◀
                      </button>
                      <div className="w-9 h-9 flex items-center justify-center text-[10px] font-bold text-slate-400 bg-slate-100 rounded-md select-none">
                        D
                      </div>
                      {/* Right arrow */}
                      <button
                        onClick={() => nudgeSelectedElement(nudgeStep, 0)}
                        className="w-9 h-9 flex items-center justify-center bg-white hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 border border-slate-200 rounded-lg shadow-sm font-semibold text-slate-700 select-none cursor-pointer"
                        title="Nudge Right"
                      >
                        ▶
                      </button>
                    </div>
                    {/* Down arrow */}
                    <button
                      onClick={() => nudgeSelectedElement(0, nudgeStep)}
                      className="w-9 h-9 flex items-center justify-center bg-white hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 border border-slate-200 rounded-lg shadow-sm font-semibold text-slate-700 select-none cursor-pointer"
                      title="Nudge Down"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Scale Calibration Form Section */}
            <div className="border-t border-slate-100 pt-5 mt-5">
              <h4 className="text-[10.5px] font-bold text-slate-400 tracking-widest uppercase mb-2.5 flex items-center gap-1.5">
                <Ruler className="w-4 h-4 text-indigo-600" />
                Physical Scale Calibration
              </h4>

              <div className="space-y-3">
                {/* Inputs for manual scale slider settings */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Actual Length</span>
                    <input
                      type="number"
                      step="0.05"
                      value={scale.physicalLength}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1;
                        setScale((prev) => ({ ...prev, calibrated: true, physicalLength: val }));
                      }}
                      className="w-full text-xs px-2 py-1.5 bg-white border border-slate-200 rounded mt-1 font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Pixel Span</span>
                    <input
                      type="number"
                      step="1"
                      value={scale.pixelDistance}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1;
                        setScale((prev) => ({ ...prev, calibrated: true, pixelDistance: val }));
                      }}
                      className="w-full text-xs px-2 py-1.5 bg-white border border-slate-200 rounded mt-1 font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Accuracy adjustment dial to allow adding more precision */}
                <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Fine-Tune Ratio:</span>
                    <span className="font-bold font-mono text-indigo-600 text-[10.5px]">
                      {(scale.physicalLength / scale.pixelDistance).toFixed(4)} {scale.unit}/px
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setScale((prev) => ({ ...prev, calibrated: true, pixelDistance: prev.pixelDistance + 1 }))}
                      className="flex-1 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[9.5px] font-medium text-slate-600 cursor-pointer"
                      title="Make walls slightly longer by adding pixels in the denominator"
                    >
                      ➖ Thicker (Pixel +1)
                    </button>
                    <button
                      onClick={() => setScale((prev) => ({ ...prev, calibrated: true, pixelDistance: Math.max(1, prev.pixelDistance - 1) }))}
                      className="flex-1 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[9.5px] font-medium text-slate-600 cursor-pointer"
                      title="Make walls slightly shorter by subtracting pixels"
                    >
                      ➕ Thinner (Pixel -1)
                    </button>
                  </div>
                  <p className="text-[9.5px] text-slate-400 leading-normal">
                    💡 Click measure tool above to calibrate visually, or use these fine-tune buttons to scale your partitions precisely.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* PROJECT EXPORT BLUEPRINT CARD FOR CONTRACTORS */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
              <Printer className="w-4 h-4 text-indigo-600" />
              2. Publish Blueprint Details
            </h3>

            {/* Inputs for project stamp details */}
            <div className="space-y-3 mb-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Project Title</span>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded mt-1 text-slate-800 focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Client Name</span>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded mt-1 text-slate-800 focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Contractor Notes</span>
                <textarea
                  value={contractorNotes}
                  onChange={(e) => setContractorNotes(e.target.value)}
                  className="w-full h-18 text-xs px-3 py-2 bg-white border border-slate-200 rounded mt-1 text-slate-800 placeholder-slate-450 resize-none focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>
            </div>

            {/* Print and Drawio exports button docks */}
            <div className="space-y-2.5">
              <button
                onClick={handlePrintPDF}
                className="w-full bg-[#10B981] hover:bg-[#059669] text-white font-medium text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print scale PDF Blueprint
              </button>

              <button
                onClick={handleExportDrawio}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export editable Draw.io XML
              </button>

              <button
                id="clear-playground-button"
                onClick={handleResetFloorplan}
                className={`w-full text-xs py-2 px-4 border rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer font-medium ${
                  showClearConfirm
                    ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-700 animate-pulse ring-2 ring-rose-300"
                    : "bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border-rose-200"
                }`}
                title={showClearConfirm ? "Click again to confirm complete clear!" : "Clear Playground (Start Fresh)"}
              >
                <Trash2 className="w-4 h-4" />
                {showClearConfirm ? "CONFIRM CLEAR WORKSPACE ⚠️" : "Clear Playground (Start Fresh)"}
              </button>
            </div>
          </div>
        </>
        ) : (
          <>
            {/* TEMPLATE PLAYGROUND QUICK-LOADS */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Home className="w-4 h-4 text-indigo-600" />
              Preloaded Layout Playground
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Choose an instant template to edit physical scale calibrations, edit partitions, and export blueprints:
            </p>

            <div className="flex flex-col gap-2.5">
              {templates.map((template, idx) => (
                <button
                  key={idx}
                  onClick={() => handleLoadTemplate(idx)}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-start gap-2.5 group transition-all cursor-pointer"
                >
                  <div className="p-1.5 bg-slate-50 rounded text-slate-500 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                    <Home className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">
                        {template.name}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-[10px] text-slate-450 mt-0.5 leading-snug">
                      {template.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
        )}

      </div> {/* Close sidebar column */}

      </div> {/* Close grid-cols-12 playground container */}

      {/* --- STACKED SECTIONS INTEGRATION BELOW CANVAS --- */}
      <div className="space-y-8 mt-12">
        
        {/* 1. SYSTEM PARAMETERS */}
        <div id="settings-section" className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6 no-print">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-tight">System Parameters & Settings</h2>
                <p className="text-xs text-slate-500">Configure coordinate precision rules, drawing anchors and scale formats.</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-150 text-[10px] font-bold uppercase tracking-wider">
              CAD Engine Setup
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Unit Systems */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Measurement Unit System</label>
              <div className="grid grid-cols-4 gap-2">
                {(["m", "cm", "ft", "in"] as const).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => handleUnitChange(unit)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      scale.unit === unit
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {unit === "m" ? "Meters" : unit === "cm" ? "CM" : unit === "ft" ? "Feet" : "Inches"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">Determines the physical representation scale on the layout labels.</p>
            </div>

            {/* Grid snaps */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Grid Snap Alignment</label>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/50">
                <div>
                  <span className="text-xs font-semibold text-slate-700 block">Snap Coordinates to Grid</span>
                  <span className="text-[10px] text-slate-450">Align elements to 20px intervals automatically</span>
                </div>
                <button
                  onClick={() => setGridSnapping(!gridSnapping)}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                    gridSnapping ? "bg-indigo-600" : "bg-slate-300"
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                    gridSnapping ? "translate-x-6" : "translate-x-0"
                  }`} />
                </button>
              </div>
            </div>

            {/* Core Partition sizing parameters */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Default Wall Draft Thickness</label>
              <div className="flex gap-3 items-center">
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={defaultWallThickness}
                  onChange={(e) => setDefaultWallThickness(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="w-16 text-right font-mono text-xs font-bold text-slate-700">{defaultWallThickness}px</span>
              </div>
              <p className="text-[11px] text-slate-400">Specifies the canvas brush thickness used when sketching new partition walls.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Standard Opening Door Width</label>
              <div className="flex gap-3 items-center">
                <input
                  type="range"
                  min="40"
                  max="120"
                  step="5"
                  value={defaultDoorWidth}
                  onChange={(e) => setDefaultDoorWidth(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="w-16 text-right font-mono text-xs font-bold text-slate-700">{defaultDoorWidth}cm</span>
              </div>
              <p className="text-[11px] text-slate-400">Default physical length sizing used when snapping doors onto partitions.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Auto Backup Saving Interval</label>
              <div className="flex gap-3 items-center">
                <input
                  type="range"
                  min="10"
                  max="180"
                  step="10"
                  value={backupInterval}
                  disabled={!autoBackupEnabled}
                  onChange={(e) => setBackupInterval(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50"
                />
                <span className="w-16 text-right font-mono text-xs font-bold text-slate-700">{backupInterval}s</span>
              </div>
              <p className="text-[11px] text-slate-400">Background duration to compile state backups internally to LocalStorage.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Cloud Auto-Backups</label>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/50">
                <div>
                  <span className="text-xs font-semibold text-slate-700 block">Enable Auto-draft Persistence</span>
                  <span className="text-[10px] text-slate-450">Avoid data loss on workspace refreshing</span>
                </div>
                <button
                  onClick={() => setAutoBackupEnabled(!autoBackupEnabled)}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                    autoBackupEnabled ? "bg-indigo-600" : "bg-slate-300"
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                    autoBackupEnabled ? "translate-x-6" : "translate-x-0"
                  }`} />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => {
                setDefaultWallThickness(15);
                setDefaultDoorWidth(80);
                setBackupInterval(60);
                setAutoBackupEnabled(true);
                setGridSnapping(true);
                triggerNotification("System thresholds reset to professional defaults.");
              }}
              className="text-xs text-rose-600 font-semibold hover:text-rose-700 hover:underline transition-all cursor-pointer"
            >
              Reset to Standard Defaults
            </button>
            
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                triggerNotification("Configurations saved successfully.");
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              Apply & Return to Canvas
            </button>
          </div>
        </div>

        {/* 2. PUBLISH & EMBED PORTAL */}
        <div id="publish-section" className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6 no-print">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-tight">Publish Blueprint Portal</h2>
                <p className="text-xs text-slate-500">Host interactive builder blueprints, generate embedding code slices and access links.</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-150 text-[10px] font-bold uppercase tracking-wider">
              Client Portal Host
            </span>
          </div>

          {/* Dashboard grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Deployment Status</span>
              <span className="text-md font-extrabold text-amber-500 flex items-center gap-1.5 mt-1">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                Unpublished Draft
              </span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Visibility Mode</span>
              <span className="text-md font-extrabold text-slate-700 block mt-1">Private ({clientName || "S. Mantsika"})</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Objects Placed</span>
              <span className="text-md font-extrabold text-indigo-650 block mt-1">{walls.length + doors.length + windows.length + rooms.length} elements</span>
            </div>
          </div>

          {/* Publish Action Zone */}
          <div className="p-5 rounded-2xl border border-indigo-100 bg-indigo-50/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">Ready to present this design live?</h3>
              <p className="text-xs text-slate-500">Publish hosting link so external surveyors and contractors can review the model.</p>
            </div>
            <button
              onClick={() => {
                triggerNotification("Congratulations! Floorplan deployed live to FloorPlan.ai CDN network.");
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Deploy Live Floorplan
            </button>
          </div>

          {/* Iframe embedding and Sharing links */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">HTML Embedding Snippet</h3>
            <div className="p-4 bg-slate-900 rounded-xl relative">
              <code className="text-[11px] text-indigo-300 font-mono select-all block break-all leading-normal">
                {`<iframe src="https://floorplan.ai/embed/v4/319502" width="100%" height="600" style="border:1px solid #e2e8f0; border-radius:12px;" allow="fullscreen"></iframe>`}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`<iframe src="https://floorplan.ai/embed/v4/319502" width="100%" height="600" style="border:1px solid #e2e8f0; border-radius:12px;" allow="fullscreen"></iframe>`);
                  triggerNotification("Iframe embed snippet copied to clipboard.");
                }}
                className="absolute top-2 right-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-white rounded transition-all cursor-pointer"
              >
                Copy Code
              </button>
            </div>
            <p className="text-[11px] text-slate-400">Copy this code block and place it into any company web page or CMS platform (e.g., WordPress, Webflow, Notion) to showcase dynamic layout.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Access levels */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Secure Client Access Options</h3>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/50">
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">Require Client Password</span>
                    <span className="text-[10px] text-slate-450">Protect with confidential contractor passcode</span>
                  </div>
                  <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/50">
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">Enable Distance Measurements</span>
                    <span className="text-[10px] text-slate-450">Allow clients to use standard measurement tool</span>
                  </div>
                  <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                </div>
              </div>
            </div>

            {/* QR Code Presentation Display */}
            <div className="p-4 rounded-xl border border-slate-200/60 flex flex-col items-center justify-center text-center bg-slate-50/50">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-2 items-center">
                <svg className="w-24 h-24 text-slate-800" viewBox="0 0 100 100">
                  <rect width="100" height="100" fill="white" />
                  <rect x="5" y="5" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="8" />
                  <rect x="12.5" y="12.5" width="10" height="10" fill="currentColor" />
                  
                  <rect x="70" y="5" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="8" />
                  <rect x="77.5" y="12.5" width="10" height="10" fill="currentColor" />

                  <rect x="5" y="70" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="8" />
                  <rect x="12.5" y="77.5" width="10" height="10" fill="currentColor" />

                  <rect x="40" y="40" width="20" height="20" fill="currentColor" />
                  <rect x="40" y="5" width="15" height="10" fill="currentColor" />
                  <rect x="40" y="25" width="20" height="5" fill="currentColor" />
                  <rect x="5" y="40" width="10" height="15" fill="currentColor" />
                  <rect x="70" y="40" width="15" height="15" fill="currentColor" />
                  <rect x="75" y="75" width="20" height="20" fill="currentColor" />
                  <rect x="40" y="70" width="15" height="25" fill="currentColor" />
                </svg>
                <span className="font-mono text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Present QR Token</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-3 leading-relaxed max-w-xs">Scan this dynamically synced QR token on site via any mobile device to preview model overlay directly.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                triggerNotification("Publish portal configurations locked.");
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              Return to Canvas
            </button>
          </div>
        </div>

        {/* 3. VECTOR SVG CODE INSPECTOR */}
        <div id="vector-section" className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6 no-print">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-tight">Vector SVG Code Inspector</h2>
                <p className="text-xs text-slate-500">Inspect compiled XML vector data nodes. Export layouts instantly to drawing suites.</p>
              </div>
            </div>
            <button
              onClick={() => {
                const svgMarkup = generateFloorplanSVG();
                const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${projectTitle.toLowerCase().replace(/\s+/g, "_")}_vector.svg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                triggerNotification("SVG Vector model compiled and downloaded successfully!");
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download SVG
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Live Compiled SVG Viewport */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Real-time Vector Render</h3>
              <div 
                className="border border-slate-200 rounded-xl bg-slate-50 p-4 flex items-center justify-center relative shadow-inner overflow-hidden"
                style={{ minHeight: "350px" }}
              >
                <div 
                  className="w-full h-full max-h-[320px] bg-white rounded-lg p-2 border border-slate-200 shadow-sm transition-all"
                  dangerouslySetInnerHTML={{ __html: generateFloorplanSVG() }}
                />
                <span className="absolute bottom-2 right-2 text-[9px] font-bold font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">1000 x 700 Viewport</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">This view is a live render compiled directly from coordinate vectors. Any walls, openings, or stamp modules you change in the playground will reflect here instantly.</p>
            </div>

            {/* SVG Code Block Panel */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Target Code Nodes (XML)</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generateFloorplanSVG());
                    triggerNotification("Clean SVG XML block copied to clipboard!");
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-750 font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  Copy Full SVG XML
                </button>
              </div>
              
              <div className="relative flex-1">
                <textarea
                  readOnly
                  value={generateFloorplanSVG()}
                  className="w-full h-[350px] font-mono text-[10px] p-4 bg-slate-900 border border-slate-950 text-indigo-300 rounded-xl resize-none focus:outline-none"
                />
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded border border-emerald-900/50 uppercase tracking-wider">XML Clean</span>
                </div>
              </div>
              
              <p className="text-[11px] text-slate-500 leading-relaxed">Perfect for importing directly into vector software suites like Illustrator, AutoCAD, Figma, or CorelDraw, featuring fully segmented structural layer markup ids.</p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md cursor-pointer"
            >
              Back to Design Board
            </button>
          </div>
        </div>

        {/* 4. ARCHITECT & CONTRACTOR PROFILE */}
        <div id="profile-section" className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6 no-print">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-800 uppercase tracking-tight">Architect & Contractor Profile</h2>
              <p className="text-xs text-slate-500">Configure professional branding parameters, view team workspace roles, and inspect event action logs.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Identity Info Panel */}
            <div className="md:col-span-4 flex flex-col items-center text-center p-5 border border-slate-200/60 rounded-xl bg-slate-50/50 justify-center">
              <div className="h-20 w-20 rounded-full bg-indigo-600 text-white text-2xl font-black flex items-center justify-center shadow-md mb-3">
                SM
              </div>
              <h3 className="text-sm font-bold text-slate-800">{clientName || "S. Mantsika"}</h3>
              <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 uppercase tracking-wider mt-1.5 mb-4">Builder Pro Tier</span>
              <p className="text-xs text-slate-400 font-medium">Mantsika@gmail.com</p>
              <p className="text-[10px] text-slate-450 mt-1">London, United Kingdom</p>
            </div>

            {/* Form Credentials Column */}
            <div className="md:col-span-8 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Business Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contractor First Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Design Bureau Title</label>
                  <input
                    type="text"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Global Blueprint Footer Annotation Notes</label>
                <textarea
                  value={contractorNotes}
                  onChange={(e) => setContractorNotes(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 h-20 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Workspace Limits Status Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Seat Allocation & Limits</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Workspace Members</span>
                <span className="text-sm font-bold text-slate-700 block mt-0.5">5 of 5 Team Seats</span>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: "100%" }} />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cloud Models Saved</span>
                <span className="text-sm font-bold text-slate-700 block mt-0.5">8 of 100 blueprints</span>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: "8%" }} />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Daily Tracing Computes</span>
                <span className="text-sm font-bold text-slate-700 block mt-0.5">Unlimited Queries Mode</span>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: "20%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Recent timeline events logs */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Recent Design Action Log</h3>
            <div className="divide-y divide-slate-100 space-y-2 text-[11px] text-slate-600">
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold text-slate-700">✍️ Blueprint partition drafted</span>
                <span className="font-mono text-slate-450 text-[10px]">Just now</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold text-slate-700">💾 Autosaved recovery draft</span>
                <span className="font-mono text-slate-450 text-[10px]">3 mins ago</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold text-slate-700">📐 Calibrated physical dimension scale factor</span>
                <span className="font-mono text-slate-450 text-[10px]">10 mins ago</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                triggerNotification("Contractor details persisted.");
              }}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md cursor-pointer"
            >
              Save Profile Info
            </button>
          </div>
        </div>

      </div>

      </main>

      {/* FOOTER BAR */}
      <footer className="no-print bg-white border-t border-slate-200 px-6 py-3.5 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span>
            <strong>Interior partitions:</strong> 5px | <strong>Outer walls:</strong> 10px
          </span>
          <span className="h-4 w-px bg-slate-200" />
          <span>
            <strong>Vectors:</strong> Walls ({walls.length}) | Doors ({doors.length}) | Windows ({windows.length}) | Labels ({rooms.length})
          </span>
          <span className="h-4 w-px bg-slate-200" />
          <span>
            <strong>Drawing scale:</strong>{" "}
            <span className="text-teal-600 font-semibold font-mono">
              {DRAWING_SCALE_LABEL} (~{PLAYGROUND_PX_PER_M} px/m · {SHEET_WIDTH_METERS} m sheet)
            </span>
            {scale.calibrated && (
              <span className="text-slate-400 ml-1">
                · calibrated 1px = {(scale.physicalLength / scale.pixelDistance).toFixed(3)}{scale.unit}
              </span>
            )}
          </span>
        </div>
        <div className="text-slate-400 text-[11px]">
          Floorplan Digitizer CAD. Clean Minimalism Concept.
        </div>
      </footer>

      {/* API FEEDBACK TOAST / PROGRESS NOTIFICATIONS */}
      {successMessage && (
        <div className="no-print fixed bottom-6 left-6 z-50 bg-indigo-600 border border-indigo-500 text-white py-3 px-4 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 max-w-md">
          <Info className="w-4 h-4 shrink-0 text-yellow-300 animate-bounce" />
          <span>{successMessage}</span>
        </div>
      )}

      {apiError && (
        <div className="no-print fixed bottom-6 left-6 z-50 bg-rose-600 border border-rose-500 text-white py-3 px-4 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 max-w-md">
          <Info className="w-4 h-4 shrink-0 text-white animate-bounce" />
          <span>{apiError}</span>
        </div>
      )}

      </div>

      {/* ==================== PRINT PDF Blueprint BLUEPRINT SHEET LAYOUT ==================== */}
      <div className="hidden print-only print-blueprint-card w-full p-4 p-x-6 shrink-0 aspect-[1.414]">
        
        {/* LANDSCAPE Blueprint frames borders */}
        <div className="border border-slate-900 rounded-lg p-3 bg-white flex flex-col h-full justify-between select-none">
          
          {/* Header description */}
          <div className="flex justify-between items-start border-b border-slate-900 pb-3 flex-wrap">
            <div>
              <h1 className="text-lg font-bold text-slate-950 uppercase tracking-wide">
                ARCHITECTURAL 블루프린트 Blueprints Blueprint Layout Sheet
              </h1>
              <p className="text-[11px] text-slate-800 mt-0.5 font-sans">
                Digitized Vector Floorplan Structure generated by Floorplan AI scanner
              </p>
            </div>
            <div className="text-right text-[10px] font-mono text-slate-700">
              <div>DATE: {new Date().toLocaleDateString()}</div>
              <div>SHEET SEQUENCE: A-1 OF A-1</div>
            </div>
          </div>

          {/* Core Printable vector SVG Viewport */}
          <div className="flex-1 my-4 border border-slate-600 bg-white relative">
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 1000 1000"
              className="print-blueprint-svg bg-white"
            >
              {/* Drawing ALL walls for print */}
              {sheetWalls.map((wall) => {
                const thickness = wall.type === "exterior" ? 11 : 5.5;
                const strokeColor = "#111827"; // Dark grey slate for clear print contrasts
                return (
                  <g key={`print_${wall.id}`}>
                    <line
                      x1={wall.x1}
                      y1={wall.y1}
                      x2={wall.x2}
                      y2={wall.y2}
                      stroke={strokeColor}
                      strokeWidth={thickness}
                      strokeLinecap="round"
                    />
                    {scale.calibrated && (
                      <g transform={`translate(${(wall.x1 + wall.x2) / 2}, ${(wall.y1 + wall.y2) / 2})`}>
                        <rect x="-24" y="-8" width="48" height="15" rx="2" fill="#FFFFFF" stroke="#000000" strokeWidth="0.8" />
                        <text textAnchor="middle" y="3.5" fontSize="8" fontWeight="bold" fill="#000000">
                          {getWallPhysicalLengthStr(wall)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Drawing ALL doors print */}
              {sheetDoors.map((door) => {
                const size = door.width;
                return (
                  <g key={`print_${door.id}`}>
                    <circle cx={door.x} cy={door.y} r="3" fill="#000000" />
                    {door.orientation === "h" ? (
                      <g>
                        <line x1={door.x} y1={door.y} x2={door.x} y2={door.swing === "n" ? door.y - size : door.y + size} stroke="#111827" strokeWidth="2.5" />
                        <path
                          d={`M ${door.x} ${door.swing === "n" ? door.y - size : door.y + size} A ${size} ${size} 0 0 1 ${door.x + size} ${door.y}`}
                          fill="none"
                          stroke="#111827"
                          strokeWidth="1.2"
                          strokeDasharray="2,2"
                        />
                      </g>
                    ) : (
                      <g>
                        <line x1={door.x} y1={door.y} x2={door.swing === "w" ? door.x - size : door.x + size} y2={door.y} stroke="#111827" strokeWidth="2.5" />
                        <path
                          d={`M ${door.swing === "w" ? door.x - size : door.x + size} ${door.y} A ${size} ${size} 0 0 1 ${door.x} ${door.y + size}`}
                          fill="none"
                          stroke="#111827"
                          strokeWidth="1.2"
                          strokeDasharray="2,2"
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Drawing ALL Windows print */}
              {sheetWindows.map((win) => {
                const size = win.width;
                const wVal = win.orientation === "h" ? size : 12;
                const hVal = win.orientation === "v" ? size : 12;
                return (
                  <g key={`print_${win.id}`}>
                    <rect
                      x={win.x - wVal / 2}
                      y={win.y - hVal / 2}
                      width={wVal}
                      height={hVal}
                      fill="#FFFFFF"
                      stroke="#111827"
                      strokeWidth="2"
                    />
                    {win.orientation === "h" ? (
                      <line x1={win.x - size / 2} y1={win.y} x2={win.x + size / 2} y2={win.y} stroke="#111827" strokeWidth="1" />
                    ) : (
                      <line x1={win.x} y1={win.y - size / 2} x2={win.x} y2={win.y + size / 2} stroke="#111827" strokeWidth="1" />
                    )}
                  </g>
                );
              })}

              {/* Drawing ALL rooms print */}
              {rooms.map((room) => (
                <g key={`print_${room.id}`}>
                  <rect x={room.x - 70} y={room.y - 15} width="140" height="30" rx="3" fill="#FFFFFF" stroke="#000000" strokeWidth="1" />
                  <text x={room.x} y={room.y - 1} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#000000">
                    {room.name}
                  </text>
                  <text x={room.x} y={room.y + 10} textAnchor="middle" fontSize="7.5" fontWeight="semibold" fill="#111827">
                    {getRoomAreaStr(room)}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* Bottom Title Contractor Block block (architectural stamp details!) */}
          <div className="grid grid-cols-4 border border-slate-900 rounded bg-slate-50 py-3.5 px-4 rounded text-slate-900 text-xs leading-normal">
            <div className="border-r border-slate-400 pr-4">
              <span className="text-[9px] text-slate-600 block uppercase font-bold tracking-wider">PROJECT INFORMATION</span>
              <div className="font-bold text-[11px] text-slate-900 mt-1 uppercase">{projectTitle}</div>
              <div className="text-[10px] text-slate-800">CLIENT: {clientName}</div>
            </div>

            <div className="border-r border-slate-400 px-4">
              <span className="text-[9px] text-slate-600 block uppercase font-bold tracking-wider">DIMENSION & CALIBRATIONS</span>
              <div className="font-bold mt-1">
                {scale.calibrated ? (
                  <span className="font-mono text-slate-900">
                    1px = {(scale.physicalLength / scale.pixelDistance).toFixed(4)}
                    {scale.unit}
                  </span>
                ) : (
                  <span>UNLICENSED MOCK SCALE - NOT CALIBRATED</span>
                )}
              </div>
              <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                Ratios based on {scale.pixelDistance.toFixed(0)}px = {scale.physicalLength.toFixed(1)}
                {scale.unit} span
              </div>
            </div>

            <div className="border-r border-slate-400 px-4 col-span-2">
              <span className="text-[9px] text-slate-600 block uppercase font-bold tracking-wider">CONTRACTOR INSTRUCTIONS / DISCLAIMER</span>
              <p className="text-[9.5px] text-slate-800 mt-1 italic leading-snug">
                {contractorNotes || "Standard layout sheet. Check and verify structural columns before partitioning."}
              </p>
            </div>
          </div>

        </div>
      </div>

    </>
  );
}

"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import PhotoUploader from "@/components/PhotoUploader";
import type { BatchItem } from "@/components/BatchWorkspace";
import { useLicense } from "@/components/LicenseProvider";
import { removeBackground, warmUpBackgroundModel } from "@/lib/backgroundRemoval";
import { loadFaceLandmarker } from "@/lib/faceLandmarker";
import { onIdle, isConstrainedDevice } from "@/lib/device";
import { getPreset } from "@/lib/presets";
import { importImageFile } from "@/lib/imageImport";
import { toast } from "@/lib/toast";
import { logActivity, trackScreenTime } from "@/lib/activity";
import {
  FiActivity,
  FiCamera,
  FiHelpCircle,
  FiSave,
  FiRotateCcw,
  FiChevronLeft,
  FiChevronRight,
  FiUpload,
  FiSliders,
  FiPrinter,
  FiCheck,
  FiMoon,
  FiSun,
  FiClock,
  FiSmile,
  FiEye,
  FiUser,
  FiCheckCircle,
} from "react-icons/fi";
import { FaUndo, FaRedo, FaPaintBrush, FaMagic, FaSignature } from "react-icons/fa";
import { BsStars, BsLightbulb } from "react-icons/bs";
import { ArrowUpRight } from "lucide-react";
import { ChaiBackdrop } from "@/components/ChaiBackdrop";
import { AnimatedBadge } from "@/components/AnimatedBadge";

export type ScreenState = "welcome" | "presets" | "adjust" | "print-sheet" | "success";

// Everything after the start screen is split into its own chunks so the app
// opens fast on phones and slow connections. The editor chunks are fetched in
// the background once the start screen is up (see prefetchEditor), so moving
// on to the next step still feels instant.
const loadImageEditor = () => import("@/components/ImageEditor");
const loadDownloadButton = () => import("@/components/DownloadButton");
const loadBGRemover = () => import("@/components/BGRemover");

function ScreenLoading() {
  return (
    <div className="w-full h-full min-h-[50dvh] flex items-center justify-center" role="status" aria-label="Loading">
      <span className="w-6 h-6 rounded-full border-2 border-accent-app/25 border-t-accent-app animate-spin" />
    </div>
  );
}

const ImageEditor = dynamic(loadImageEditor, { ssr: false, loading: ScreenLoading });
const DownloadButton = dynamic(loadDownloadButton, { ssr: false });
const BGRemover = dynamic(loadBGRemover, { ssr: false });
const BatchWorkspace = dynamic(() => import("@/components/BatchWorkspace"), { ssr: false, loading: ScreenLoading });
const DeveloperContactModal = dynamic(() => import("@/components/DeveloperContactModal"), { ssr: false });
const SignatureModal = dynamic(() => import("@/components/SignatureModal"), { ssr: false });
const ActivityModal = dynamic(() => import("@/components/ActivityModal"), { ssr: false });

let editorPrefetched = false;
function prefetchEditor() {
  if (editorPrefetched) return;
  editorPrefetched = true;
  Promise.all([loadImageEditor(), loadBGRemover(), loadDownloadButton()]).catch(() => {
    editorPrefetched = false; // try again on the next photo
  });
}

// Once a photo is in, get the AI ready while the operator picks a size: the
// face model first (auto-align needs it straight away), then the much larger
// background-removal model. Skipped on data-saver / very slow connections and
// very low-memory devices, where it would compete with the operator's own work;
// those load on first use instead.
let aiWarmupStarted = false;
function warmUpAI() {
  if (aiWarmupStarted) return;
  aiWarmupStarted = true;
  loadFaceLandmarker()
    .catch(() => undefined)
    .then(() => {
      if (!isConstrainedDevice()) onIdle(() => warmUpBackgroundModel("auto"));
    });
}

type ClothingTemplate = "none" | "suit_male" | "suit_female" | "tuxedo";

// The exact set of fields captured in an undo/redo history entry. Having this
// as a single typed shape means the compiler catches any field that gets added
// to the editor but forgotten in a snapshot / restore path.
export interface EditorSnapshot {
  originalImage: string | null;
  processedImage: string | null;
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  temperature: number;
  rotation: number;
  bgColor: string;
  cropPosition: { x: number; y: number };
  cropScale: number;
  preset: string;
  clothingTemplate: ClothingTemplate;
  clothingScale: number;
  clothingPosition: { x: number; y: number };
  clothingRotation: number;
  showSlate: boolean;
  slateName: string;
  slateDate: string;
  showBorder: boolean;
  borderColor: string;
  borderSize: number;
  useCustomGrid: boolean;
  customGridCols: number;
  customGridRows: number;
}

// The four steps an operator walks through. "success" is shown after export
// and marks every step complete.
const WORKFLOW_STEPS: { id: ScreenState; label: string; hint: string }[] = [
  { id: "welcome", label: "Photo", hint: "Add a portrait: drop a file, paste (Ctrl+V) or use the camera" },
  { id: "presets", label: "Size", hint: "Choose the passport, visa or ID size you need" },
  { id: "adjust", label: "Edit", hint: "Check the guides: drag to move, scroll or pinch to zoom" },
  { id: "print-sheet", label: "Print", hint: "Pick paper and copies, then export the print sheet" },
];

const PHOTO_TIPS: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <FiUser className="w-4 h-4" />, title: "Face the camera", text: "Head straight, shoulders square." },
  { icon: <FiSmile className="w-4 h-4" />, title: "Neutral expression", text: "Mouth closed, no big smile." },
  { icon: <FiEye className="w-4 h-4" />, title: "Eyes open & visible", text: "No glare, hair away from eyes." },
  { icon: <BsLightbulb className="w-4 h-4" />, title: "Soft, even light", text: "No shadows on the face." },
];

function ToolButton({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="w-full py-2.5 rounded-lg flex flex-col items-center justify-center gap-1 text-text-secondary hover:text-text-primary hover:bg-card-app disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
    >
      <span className="text-text-primary">{icon}</span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="w-9 h-9 rounded-lg text-text-secondary hover:text-text-primary hover:bg-card-app disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer shrink-0"
    >
      {children}
    </button>
  );
}

export default function Home() {
  const { licenseState, isWebDemo, connection, checkStatus } = useLicense();
  const [activeScreen, setActiveScreen] = useState<ScreenState>("welcome");
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // null until mounted: the real theme was already applied to <html> by the
  // inline script in app/layout.tsx (saved choice, else the OS setting).
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Session auto-save / crash recovery
  const [recoverableSession, setRecoverableSession] = useState<any | null>(null);
  const autosaveBlockedRef = useRef(false);

  // Photo editing states
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [exposure, setExposure] = useState(100);
  const [temperature, setTemperature] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [cropPosition, setCropPosition] = useState({ x: 50, y: 50 });
  const [cropScale, setCropScale] = useState(100);
  const [preset, setPreset] = useState<string>("in");

  // Slate Overlay states (for Indian government and exam portals)
  const [showSlate, setShowSlate] = useState<boolean>(false);
  const [slateName, setSlateName] = useState<string>("");
  const [slateDate, setSlateDate] = useState<string>("");

  // Clothing Overlay states
  const [clothingTemplate, setClothingTemplate] = useState<
    "none" | "suit_male" | "suit_female" | "tuxedo"
  >("none");
  const [clothingScale, setClothingScale] = useState(100);
  const [clothingPosition, setClothingPosition] = useState({ x: 50, y: 55 });
  const [clothingRotation, setClothingRotation] = useState(0);

  // Dragging active item indicator: 'photo' | 'clothing'
  const [canvasActiveItem, setCanvasActiveItem] = useState<"photo" | "clothing">("photo");

  // Print sheet states
  const [photoCount, setPhotoCount] = useState<number>(5);
  const [spacing, setSpacing] = useState<number>(2.0); // Default 2mm gap
  const [margin, setMargin] = useState<number>(3.0); // Default 3mm margin
  const [showCropMarks, setShowCropMarks] = useState<boolean>(false); // Default OFF
  const [showSheetTitle, setShowSheetTitle] = useState<boolean>(false); // Default OFF
  const [showPresetInfo, setShowPresetInfo] = useState<boolean>(false); // Default OFF
  const [showGenDate, setShowGenDate] = useState<boolean>(false); // Default OFF
  const [showFooterNotes, setShowFooterNotes] = useState<boolean>(false); // Default OFF
  const [autoFitA4, setAutoFitA4] = useState<boolean>(false); // Default OFF
  const [skipCount, setSkipCount] = useState<number>(0);
  const [isCustomCount, setIsCustomCount] = useState<boolean>(true);
  const [customCount, setCustomCount] = useState<number>(5);
  const [skipMode, setSkipMode] = useState<string>("0");
  const [customSkip, setCustomSkip] = useState<number>(0);

  // Cyber Cafe Paper and Orientation optimizations
  const [paperSize, setPaperSize] = useState<"a4" | "4r">("a4");
  const [paperOrientation, setPaperOrientation] = useState<"portrait" | "landscape">("portrait");

  // Custom Grid Layout states
  const [useCustomGrid, setUseCustomGrid] = useState<boolean>(false);
  const [customGridCols, setCustomGridCols] = useState<number>(6);
  const [customGridRows, setCustomGridRows] = useState<number>(6);

  // Border states
  const [showBorder, setShowBorder] = useState<boolean>(true);
  const [borderColor, setBorderColor] = useState<string>("#000000");
  const [borderSize, setBorderSize] = useState<number>(0.4); // 0.4mm by default (thin black cut border)

  // Multi-Person Mode states
  const [isMultiPersonMode, setIsMultiPersonMode] = useState<boolean>(false);
  const [multiPersonImages, setMultiPersonImages] = useState<(string | null)[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // Fetch the editor code in the background once the start screen is up.
  useEffect(() => onIdle(prefetchEditor), []);

  // Start loading the AI models as soon as there is a photo to work on.
  useEffect(() => {
    if (originalImage) warmUpAI();
  }, [originalImage]);

  // Sync single image to batch when Multi-Person mode is toggled on
  useEffect(() => {
    if (isMultiPersonMode && batchItems.length === 0 && originalImage) {
      setBatchItems([
        {
          id: "single-main",
          name: "Person 1",
          originalImage: originalImage,
          processedImage: processedImage,
          croppedImage: null,
          status: processedImage ? "ready" : "pending",
          progress: processedImage ? 100 : 0,
          cropScale: cropScale,
          cropPosition: cropPosition,
          rotation: rotation,
          brightness: brightness,
          contrast: contrast,
          saturation: saturation,
          exposure: exposure,
          temperature: temperature,
          clothingTemplate: clothingTemplate,
          clothingScale: clothingScale,
          clothingPosition: clothingPosition,
          clothingRotation: clothingRotation,
        },
      ]);
    }
  }, [isMultiPersonMode, originalImage, processedImage]);

  // Sync first batch item back to single editor when Multi-Person mode is toggled off
  useEffect(() => {
    if (!isMultiPersonMode && batchItems.length > 0 && batchItems[0]) {
      const first = batchItems[0];
      setOriginalImage(first.originalImage);
      setProcessedImage(first.processedImage);
      setCropScale(first.cropScale);
      setCropPosition(first.cropPosition);
      setRotation(first.rotation);
      setBrightness(first.brightness);
      setContrast(first.contrast);
      setSaturation(first.saturation);
      setExposure(first.exposure);
      setTemperature(first.temperature);
      setClothingTemplate(first.clothingTemplate);
      setClothingScale(first.clothingScale);
      setClothingPosition(first.clothingPosition);
      setClothingRotation(first.clothingRotation);
    }
  }, [isMultiPersonMode]);

  const handleMultipleImagesUpload = (imagesData: string[]) => {
    logActivity("photo", imagesData.length);
    setIsMultiPersonMode(true);
    const newItems = imagesData.map((dataUrl, idx) => ({
      id: Math.random().toString(36).substring(7),
      name: `Person ${idx + 1}`,
      originalImage: dataUrl,
      processedImage: null,
      croppedImage: null,
      status: "pending" as const,
      progress: 0,
      cropScale: 100,
      cropPosition: { x: 50, y: 50 },
      rotation: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      exposure: 100,
      temperature: 0,
      clothingTemplate: "none" as const,
      clothingScale: 100,
      clothingPosition: { x: 50, y: 55 },
      clothingRotation: 0,
    }));
    setBatchItems(newItems);

    if (imagesData[0]) {
      setOriginalImage(imagesData[0]);
      setProcessedImage(null);
    }

    setActiveScreen("print-sheet");
  };

  // Undo / Redo history stack
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Theme: adopt what the pre-paint script chose, then persist user toggles.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  useEffect(() => trackScreenTime(), []);

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  // Load a saved project / recovered session
  const handleProjectLoad = (project: any) => {
    if (project.originalImage) setOriginalImage(project.originalImage);
    if (project.processedImage !== undefined) setProcessedImage(project.processedImage);
    if (project.brightness !== undefined) setBrightness(project.brightness);
    if (project.contrast !== undefined) setContrast(project.contrast);
    if (project.saturation !== undefined) setSaturation(project.saturation);
    if (project.exposure !== undefined) setExposure(project.exposure);
    if (project.temperature !== undefined) setTemperature(project.temperature);
    if (project.rotation !== undefined) setRotation(project.rotation);
    if (project.bgColor !== undefined) setBgColor(project.bgColor);
    if (project.cropPosition !== undefined) setCropPosition(project.cropPosition);
    if (project.cropScale !== undefined) setCropScale(project.cropScale);
    if (project.preset !== undefined) setPreset(project.preset);

    // Clothing states
    if (project.clothingTemplate !== undefined) setClothingTemplate(project.clothingTemplate);
    if (project.clothingScale !== undefined) setClothingScale(project.clothingScale);
    if (project.clothingPosition !== undefined) setClothingPosition(project.clothingPosition);
    if (project.clothingRotation !== undefined) setClothingRotation(project.clothingRotation);

    // Print setup
    if (project.photoCount !== undefined) setPhotoCount(project.photoCount);
    if (project.spacing !== undefined) setSpacing(project.spacing);
    if (project.margin !== undefined) setMargin(project.margin);
    if (project.showCropMarks !== undefined) setShowCropMarks(project.showCropMarks);
    if (project.showSheetTitle !== undefined) setShowSheetTitle(project.showSheetTitle);
    if (project.showPresetInfo !== undefined) setShowPresetInfo(project.showPresetInfo);
    if (project.showGenDate !== undefined) setShowGenDate(project.showGenDate);
    if (project.showFooterNotes !== undefined) setShowFooterNotes(project.showFooterNotes);
    if (project.autoFitA4 !== undefined) setAutoFitA4(project.autoFitA4);
    if (project.skipCount !== undefined) setSkipCount(project.skipCount);
    if (project.isCustomCount !== undefined) setIsCustomCount(project.isCustomCount);
    if (project.customCount !== undefined) setCustomCount(project.customCount);
    if (project.skipMode !== undefined) setSkipMode(project.skipMode);
    if (project.customSkip !== undefined) setCustomSkip(project.customSkip);
    if (project.useCustomGrid !== undefined) setUseCustomGrid(project.useCustomGrid);
    if (project.customGridCols !== undefined) setCustomGridCols(project.customGridCols);
    if (project.customGridRows !== undefined) setCustomGridRows(project.customGridRows);

    // Border states
    if (project.showBorder !== undefined) setShowBorder(project.showBorder);
    if (project.borderColor !== undefined) setBorderColor(project.borderColor);
    if (project.borderSize !== undefined) setBorderSize(project.borderSize);

    // Slate states
    if (project.showSlate !== undefined) setShowSlate(project.showSlate);
    if (project.slateName !== undefined) setSlateName(project.slateName);
    if (project.slateDate !== undefined) setSlateDate(project.slateDate);

    // Multi-Person states
    if (project.isMultiPersonMode !== undefined) setIsMultiPersonMode(project.isMultiPersonMode);
    if (project.multiPersonImages !== undefined) setMultiPersonImages(project.multiPersonImages);
    if (project.batchItems !== undefined) setBatchItems(project.batchItems);

    // Reset history
    const stateObj: EditorSnapshot = {
      originalImage: project.originalImage,
      processedImage: project.processedImage,
      brightness: project.brightness ?? 100,
      contrast: project.contrast ?? 100,
      saturation: project.saturation ?? 100,
      exposure: project.exposure ?? 100,
      temperature: project.temperature ?? 0,
      rotation: project.rotation ?? 0,
      bgColor: project.bgColor ?? "#FFFFFF",
      cropPosition: project.cropPosition ?? { x: 50, y: 50 },
      cropScale: project.cropScale ?? 100,
      preset: project.preset ?? "us",
      clothingTemplate: project.clothingTemplate ?? "none",
      clothingScale: project.clothingScale ?? 100,
      clothingPosition: project.clothingPosition ?? { x: 50, y: 55 },
      clothingRotation: project.clothingRotation ?? 0,
      showSlate: project.showSlate ?? false,
      slateName: project.slateName ?? "",
      slateDate: project.slateDate ?? "",
      showBorder: project.showBorder ?? true,
      borderColor: project.borderColor ?? "#000000",
      borderSize: project.borderSize ?? 0.4,
      useCustomGrid: project.useCustomGrid ?? false,
      customGridCols: project.customGridCols ?? 6,
      customGridRows: project.customGridRows ?? 6,
    };
    setHistory([stateObj]);
    setHistoryIndex(0);

    if (project.isMultiPersonMode) {
      setActiveScreen("print-sheet");
    } else {
      setActiveScreen("presets");
    }
  };

  const handleImageUpload = (imageData: string) => {
    logActivity("photo");
    setOriginalImage(imageData);
    setProcessedImage(null);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setExposure(100);
    setTemperature(0);
    setRotation(0);
    setBgColor("#FFFFFF");
    setCropPosition({ x: 50, y: 50 });
    setCropScale(100);
    setPreset("in");

    // Clothing templates reset
    setClothingTemplate("none");
    setClothingScale(100);
    setClothingPosition({ x: 50, y: 55 });
    setClothingRotation(0);
    setCanvasActiveItem("photo");

    // Reset slate
    setShowSlate(false);
    setSlateName("");
    setSlateDate("");

    // Reset border
    setShowBorder(true);
    setBorderColor("#000000");
    setBorderSize(0.4);

    // Reset print sheet setup
    setPhotoCount(5);
    setSpacing(2.0);
    setMargin(3.0);
    setShowCropMarks(false);
    setShowSheetTitle(false);
    setShowPresetInfo(false);
    setShowGenDate(false);
    setShowFooterNotes(false);
    setAutoFitA4(false);
    setSkipCount(0);
    setIsCustomCount(true);
    setCustomCount(5);
    setSkipMode("0");
    setCustomSkip(0);
    setPaperSize("a4");
    setPaperOrientation("portrait");

    setUseCustomGrid(false);
    setCustomGridCols(6);
    setCustomGridRows(6);

    // Reset Multi-Person States
    setIsMultiPersonMode(false);
    setMultiPersonImages([]);
    setBatchItems([]);

    setIsProcessing(false);

    const initialState: EditorSnapshot = {
      originalImage: imageData,
      processedImage: null,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      exposure: 100,
      temperature: 0,
      rotation: 0,
      bgColor: "#FFFFFF",
      cropPosition: { x: 50, y: 50 },
      cropScale: 100,
      preset: "in",
      clothingTemplate: "none",
      clothingScale: 100,
      clothingPosition: { x: 50, y: 55 },
      clothingRotation: 0,
      showSlate: false,
      slateName: "",
      slateDate: "",
      showBorder: true,
      borderColor: "#000000",
      borderSize: 0.4,
      useCustomGrid: false,
      customGridCols: 6,
      customGridRows: 6,
    };
    setHistory([initialState]);
    setHistoryIndex(0);
    setActiveScreen("presets");
  };

  const pushToHistory = (stateObj: EditorSnapshot) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(stateObj);
    if (nextHistory.length > 50) nextHistory.shift();
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Single source of the current editor state as a snapshot. `overrides` lets
  // callers capture values they're about to set (React state updates are async).
  const buildSnapshot = (overrides: Partial<EditorSnapshot> = {}): EditorSnapshot => ({
    originalImage,
    processedImage,
    brightness,
    contrast,
    saturation,
    exposure,
    temperature,
    rotation,
    bgColor,
    cropPosition,
    cropScale,
    preset,
    clothingTemplate,
    clothingScale,
    clothingPosition,
    clothingRotation,
    showSlate,
    slateName,
    slateDate,
    showBorder,
    borderColor,
    borderSize,
    useCustomGrid,
    customGridCols,
    customGridRows,
    ...overrides,
  });

  const captureHistorySnapshot = () => {
    pushToHistory(buildSnapshot());
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      applyHistoryState(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      applyHistoryState(history[nextIndex]);
    }
  };

  const applyHistoryState = (stateObj: Partial<EditorSnapshot>) => {
    if (stateObj.originalImage !== undefined) setOriginalImage(stateObj.originalImage);
    if (stateObj.processedImage !== undefined) setProcessedImage(stateObj.processedImage);
    if (stateObj.brightness !== undefined) setBrightness(stateObj.brightness);
    if (stateObj.contrast !== undefined) setContrast(stateObj.contrast);
    if (stateObj.saturation !== undefined) setSaturation(stateObj.saturation);
    if (stateObj.exposure !== undefined) setExposure(stateObj.exposure);
    if (stateObj.temperature !== undefined) setTemperature(stateObj.temperature);
    if (stateObj.rotation !== undefined) setRotation(stateObj.rotation);
    if (stateObj.bgColor !== undefined) setBgColor(stateObj.bgColor);
    if (stateObj.cropPosition !== undefined) setCropPosition(stateObj.cropPosition);
    if (stateObj.cropScale !== undefined) setCropScale(stateObj.cropScale);
    if (stateObj.preset !== undefined) setPreset(stateObj.preset);
    if (stateObj.clothingTemplate !== undefined) setClothingTemplate(stateObj.clothingTemplate);
    if (stateObj.clothingScale !== undefined) setClothingScale(stateObj.clothingScale);
    if (stateObj.clothingPosition !== undefined) setClothingPosition(stateObj.clothingPosition);
    if (stateObj.clothingRotation !== undefined) setClothingRotation(stateObj.clothingRotation);
    if (stateObj.showSlate !== undefined) setShowSlate(stateObj.showSlate);
    if (stateObj.slateName !== undefined) setSlateName(stateObj.slateName);
    if (stateObj.slateDate !== undefined) setSlateDate(stateObj.slateDate);
    if (stateObj.showBorder !== undefined) setShowBorder(stateObj.showBorder);
    if (stateObj.borderColor !== undefined) setBorderColor(stateObj.borderColor);
    if (stateObj.borderSize !== undefined) setBorderSize(stateObj.borderSize);
    if (stateObj.useCustomGrid !== undefined) setUseCustomGrid(stateObj.useCustomGrid);
    if (stateObj.customGridCols !== undefined) setCustomGridCols(stateObj.customGridCols);
    if (stateObj.customGridRows !== undefined) setCustomGridRows(stateObj.customGridRows);
  };

  const handleBGRemoved = (processed: string) => {
    setProcessedImage(processed);

    // Set default backdrop color based on current preset's document standard
    const defaultBgColor = getPreset(preset).bgColor;
    setBgColor(defaultBgColor);

    // No "done" toast: the new background is visible right away.
    logActivity("bg");
    pushToHistory(
      buildSnapshot({
        processedImage: processed,
        bgColor: defaultBgColor,
      }),
    );
  };

  const handleReset = () => {
    setOriginalImage(null);
    setProcessedImage(null);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setExposure(100);
    setTemperature(0);
    setRotation(0);
    setBgColor("#FFFFFF");
    setCropPosition({ x: 50, y: 50 });
    setCropScale(100);
    setPreset("in");
    setClothingTemplate("none");
    setClothingScale(100);
    setClothingPosition({ x: 50, y: 55 });
    setClothingRotation(0);
    setShowSlate(false);
    setSlateName("");
    setSlateDate("");
    setShowBorder(true);
    setBorderColor("#000000");
    setBorderSize(0.4);

    // Reset print sheet setup
    setPhotoCount(5);
    setSpacing(2.0);
    setMargin(3.0);
    setShowCropMarks(false);
    setShowSheetTitle(false);
    setShowPresetInfo(false);
    setShowGenDate(false);
    setShowFooterNotes(false);
    setAutoFitA4(false);
    setSkipCount(0);
    setIsCustomCount(true);
    setCustomCount(5);
    setSkipMode("0");
    setCustomSkip(0);
    setPaperSize("a4");
    setPaperOrientation("portrait");

    setUseCustomGrid(false);
    setCustomGridCols(6);
    setCustomGridRows(6);
    setHistory([]);
    setHistoryIndex(-1);
    setCanvasActiveItem("photo");
    setIsMultiPersonMode(false);
    setMultiPersonImages([]);
    setBatchItems([]);
    setIsProcessing(false);
    setActiveScreen("welcome");
  };

  // Full serialisable project state: shared by manual "Save Project" and the
  // background session auto-save.
  const buildProjectData = () => ({
    version: "2.0",
    originalImage,
    processedImage,
    brightness,
    contrast,
    saturation,
    exposure,
    temperature,
    rotation,
    bgColor,
    cropPosition,
    cropScale,
    preset,
    clothingTemplate,
    clothingScale,
    clothingPosition,
    clothingRotation,
    photoCount,
    spacing,
    margin,
    showCropMarks,
    showSheetTitle,
    showPresetInfo,
    showGenDate,
    showFooterNotes,
    autoFitA4,
    skipCount,
    isCustomCount,
    customCount,
    skipMode,
    customSkip,
    showSlate,
    slateName,
    slateDate,
    showBorder,
    borderColor,
    borderSize,
    useCustomGrid,
    customGridCols,
    customGridRows,
    isMultiPersonMode,
    multiPersonImages,
    batchItems,
  });

  const handleSaveProject = () => {
    const projectData = buildProjectData();
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `precision-id-studio-project-${preset}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const navigateToScreen = (screenName: ScreenState) => {
    if (screenName !== "welcome" && !originalImage) return;
    setActiveScreen(screenName);
  };

  const handlePresetChange = (newPreset: string) => {
    setPreset(newPreset);

    // Smart backdrop color auto-selection from the preset's document standard
    setBgColor(getPreset(newPreset).bgColor);

    captureHistorySnapshot();
  };

  const getImageForProcessing = () => {
    return processedImage || originalImage;
  };

  const triggerImportClick = () => {
    const inputEl = document.getElementById("toolbar-welcome-file-input");
    if (inputEl) {
      inputEl.click();
    }
  };

  const handleLeftToolbarAction = async (action: string) => {
    if (action === "import") {
      triggerImportClick();
    } else if (action === "camera") {
      if (activeScreen !== "welcome") {
        setActiveScreen("welcome");
      }
      setTimeout(() => {
        const camBtn = document.getElementById("uploader-camera-trigger");
        if (camBtn) camBtn.click();
      }, 100);
    } else if (action === "remove-bg") {
      if (!originalImage || isProcessing) return;
      setIsProcessing(true);
      try {
        const result = await removeBackground(originalImage, "auto");
        handleBGRemoved(result);
      } catch (e: any) {
        toast(e?.message || "Background removal failed. Please try again.", "error");
      } finally {
        setIsProcessing(false);
      }
    } else if (action === "auto-align") {
      const alignBtn = document.getElementById("ai-auto-align-trigger");
      if (alignBtn) alignBtn.click();
    } else if (action === "ai-enhance") {
      const enhanceBtn = document.getElementById("ai-enhance-trigger");
      if (enhanceBtn) enhanceBtn.click();
    } else if (action === "ai-retouch") {
      const retouchBtn = document.getElementById("ai-retouch-trigger");
      if (retouchBtn) retouchBtn.click();
    } else if (action === "undo") {
      handleUndo();
    } else if (action === "redo") {
      handleRedo();
    }
  };

  const AUTOSAVE_KEY = "pids-autosave-v2";

  // On first load, look for a session that was auto-saved before a crash/close.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.originalImage) setRecoverableSession(parsed);
      }
    } catch (e) {
      // ignore corrupt / unavailable storage
    }
  }, []);

  // Debounced background auto-save of the working session. Serialising the
  // photos is a multi-megabyte synchronous write, so it waits for an idle
  // moment instead of stalling a drag or slider on slower devices.
  useEffect(() => {
    if (!originalImage || autosaveBlockedRef.current) return;
    let cancelIdle: (() => void) | null = null;
    const t = setTimeout(() => {
      cancelIdle = onIdle(() => {
        try {
          localStorage.setItem(
            AUTOSAVE_KEY,
            JSON.stringify({ ...buildProjectData(), savedAt: Date.now() }),
          );
        } catch (e) {
          // Storage quota exceeded (large base64 images): stop retrying this session.
          autosaveBlockedRef.current = true;
        }
      });
    }, 1200);
    return () => {
      clearTimeout(t);
      cancelIdle?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    originalImage,
    processedImage,
    historyIndex,
    activeScreen,
    preset,
    bgColor,
    isMultiPersonMode,
    batchItems,
  ]);

  const handleRestoreSession = () => {
    if (recoverableSession) handleProjectLoad(recoverableSession);
    setRecoverableSession(null);
  };
  const handleDismissSession = () => {
    setRecoverableSession(null);
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch (e) {
      /* ignore */
    }
  };

  // Global keyboard & paste shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            importImageFile(blob)
              .then(handleImageUpload)
              .catch(() => toast("Could not read the pasted image.", "error"));
            break;
          }
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;

      // Ctrl / Cmd combinations
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((k === "z" && e.shiftKey) || k === "y") {
          e.preventDefault();
          handleRedo();
        } else if (k === "s") {
          e.preventDefault();
          if (originalImage) handleSaveProject();
        } else if (k === "o") {
          e.preventDefault();
          triggerImportClick();
        } else if (k === "e" || k === "p") {
          e.preventDefault();
          document.getElementById("download-pdf-hidden-trigger")?.click();
        }
        return;
      }

      // Single-key shortcuts (when not typing)
      if (originalImage) {
        if (e.code === "Space") {
          e.preventDefault();
          handleLeftToolbarAction("auto-align");
        } else if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          handleLeftToolbarAction("remove-bg");
        } else if (e.key === "1") {
          handlePresetChange("in");
        } else if (e.key === "2") {
          handlePresetChange("pan");
        } else if (e.key === "3") {
          handlePresetChange("upsc");
        } else if (e.key === "4") {
          handlePresetChange("neet_jee");
        } else if (e.key === "5") {
          handlePresetChange("stamp");
        }
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, historyIndex, originalImage, activeScreen]);

  const currentStepIndex =
    activeScreen === "success" ? WORKFLOW_STEPS.length : WORKFLOW_STEPS.findIndex((s) => s.id === activeScreen);
  const currentStep = WORKFLOW_STEPS[Math.min(currentStepIndex, WORKFLOW_STEPS.length - 1)];
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const goNext = () => {
    if (activeScreen === "welcome") triggerImportClick();
    else if (activeScreen === "presets") setActiveScreen("adjust");
    else if (activeScreen === "adjust") setActiveScreen("print-sheet");
    else if (activeScreen === "print-sheet") {
      const exportBtn = document.getElementById("download-pdf-hidden-trigger");
      if (exportBtn) exportBtn.click();
      else setActiveScreen("success");
    } else handleReset();
  };

  const goBack = () => {
    if (activeScreen === "presets") setActiveScreen("welcome");
    else if (activeScreen === "adjust") setActiveScreen("presets");
    else if (activeScreen === "print-sheet") setActiveScreen("adjust");
    else if (activeScreen === "success") setActiveScreen("print-sheet");
  };

  const nextLabel =
    activeScreen === "welcome"
      ? "Add photo"
      : activeScreen === "print-sheet"
        ? "Export PDF"
        : activeScreen === "success"
          ? "New photo"
          : "Next";

  const footerHint =
    activeScreen === "success" ? "Done: your print sheet PDF has been saved." : currentStep.hint;

  return (
    <main className="classic-ui h-full w-full overflow-hidden flex flex-col bg-background text-foreground font-sans antialiased select-none relative">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="h-14 w-full border-b border-card-edge bg-background/80 backdrop-blur-md px-3 sm:px-6 flex items-center gap-3 sm:gap-6 z-30 shrink-0">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <span className="w-8 h-8 btn-asym bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center shrink-0">
            <FiCamera className="w-4 h-4" />
          </span>
          <div className="hidden md:block leading-tight min-w-0 font-brand">
            <div className="text-[15px] font-medium tracking-tight truncate">Precision ID</div>
            <div className="text-[11px] text-neutral-400 truncate">Passport and ID photos</div>
          </div>
          {licenseState.type === "TRIAL" && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md whitespace-nowrap">
              <FiClock className="w-3 h-3" /> Trial: {licenseState.daysRemaining} days left
            </span>
          )}
        </div>

        {/* Stepper styled as ChaiUI Segmented control */}
        <nav aria-label="Workflow" className="flex-1 flex justify-center min-w-0">
          <ol className="inline-flex items-center p-1 rounded-lg border border-border bg-black/40 backdrop-blur-sm dark:border-orange-50/10">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isActive = idx === currentStepIndex;
              const isDone = idx < currentStepIndex;
              const reachable = step.id === "welcome" || !!originalImage;
              return (
                <li key={step.id} className="flex items-center">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => navigateToScreen(step.id)}
                    aria-current={isActive ? "step" : undefined}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
                      isActive
                        ? "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100"
                        : isDone
                          ? "text-foreground hover:text-neutral-200"
                          : "text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold">
                      {isDone ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : idx + 1}
                    </span>
                    <span className={isActive ? "inline" : "hidden sm:inline"}>{step.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {isWebDemo ? (
            <span className="hidden xl:inline text-[11px] text-text-secondary border border-border-app rounded-md px-2 py-0.5 mr-1">
              Web demo
            </span>
          ) : (
            <button
              type="button"
              onClick={checkStatus}
              className="hidden xl:inline-flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-text-primary border border-border-app rounded-md px-2 py-0.5 mr-1 cursor-pointer"
              title="Licence sync with the admin dashboard. Click to sync now."
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connection.status === "connected"
                    ? "bg-success-app"
                    : connection.status === "checking"
                      ? "bg-warning-app"
                      : "bg-danger-app"
                }`}
              />
              {connection.status === "connected"
                ? `Synced${connection.lastSyncTime ? ` · ${connection.lastSyncTime}` : ""}`
                : connection.status === "checking"
                  ? "Checking…"
                  : "Offline"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSignatureModal(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-accent-app/40 bg-accent-app/10 hover:bg-accent-app/20 text-accent-app text-[12px] font-bold transition-all cursor-pointer mr-1"
            title="Signature & Thumb Impression Studio (UPSC, SSC, IBPS, PAN, NEET)"
          >
            <FaSignature className="w-3.5 h-3.5" />
            <span>Sign Studio</span>
          </button>
          <IconButton title={theme === "dark" ? "Light theme" : "Dark theme"} onClick={toggleTheme}>
            {theme === "dark" ? <FiSun className="w-[18px] h-[18px]" /> : <FiMoon className="w-[18px] h-[18px]" />}
          </IconButton>
          <IconButton title="Save project (Ctrl+S)" onClick={handleSaveProject} disabled={!originalImage}>
            <FiSave className="w-[18px] h-[18px]" />
          </IconButton>
          <IconButton title="Your activity" onClick={() => setShowActivityModal(true)}>
            <FiActivity className="w-[18px] h-[18px]" />
          </IconButton>
          <IconButton title="Help & support" onClick={() => setShowHelpModal(true)}>
            <FiHelpCircle className="w-[18px] h-[18px]" />
          </IconButton>
        </div>
      </header>

      {/* ── Workspace ──────────────────────────────────────────── */}
      <section className="flex-1 w-full overflow-hidden relative z-10 flex min-h-0">
        {/* Tool rail (desktop). On smaller screens the same tools live in the
            Edit panel and the footer, so nothing is lost. */}
        <aside className="hidden lg:flex w-[76px] bg-panel-app border-r border-border-app flex-col items-center justify-between py-3 shrink-0 z-20">
          <div className="flex flex-col gap-1 w-full px-1.5">
            <ToolButton icon={<FiUpload className="w-5 h-5" />} label="Open" title="Open photo (Ctrl+O)" onClick={() => handleLeftToolbarAction("import")} />
            <ToolButton icon={<FiCamera className="w-5 h-5" />} label="Camera" title="Take a photo with the camera" onClick={() => handleLeftToolbarAction("camera")} />
            <ToolButton icon={<FaSignature className="w-4 h-4 text-accent-app" />} label="Sign / LTI" title="Signature & Thumb Impression Studio" onClick={() => setShowSignatureModal(true)} />
            <div className="h-px bg-border-app my-1.5 mx-3" />
            <ToolButton icon={<BsStars className="w-5 h-5" />} label="Cut-out" title="Remove background (B)" disabled={!originalImage || isProcessing} onClick={() => handleLeftToolbarAction("remove-bg")} />
            <ToolButton icon={<FaMagic className="w-[18px] h-[18px]" />} label="Align" title="Auto-align face (Space)" disabled={!originalImage} onClick={() => handleLeftToolbarAction("auto-align")} />
            <ToolButton icon={<FiSliders className="w-5 h-5" />} label="Enhance" title="Auto colour & light" disabled={!originalImage} onClick={() => handleLeftToolbarAction("ai-enhance")} />
            <ToolButton icon={<FaPaintBrush className="w-[17px] h-[17px]" />} label="Retouch" title="Soften skin" disabled={!originalImage} onClick={() => handleLeftToolbarAction("ai-retouch")} />
          </div>
          <div className="flex flex-col gap-1 w-full px-1.5">
            <ToolButton icon={<FaUndo className="w-4 h-4" />} label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => handleLeftToolbarAction("undo")} />
            <ToolButton icon={<FaRedo className="w-4 h-4" />} label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => handleLeftToolbarAction("redo")} />
          </div>
        </aside>

        <div
          key={
            activeScreen === "welcome" || activeScreen === "success"
              ? activeScreen
              : isMultiPersonMode && activeScreen === "print-sheet"
                ? "batch"
                : "editor"
          }
          className="flex-1 min-w-0 min-h-0 relative screen-enter">
          {activeScreen === "welcome" ? (
            <div className="h-full overflow-y-auto panel-scrollbar relative">
              <ChaiBackdrop />
              <div className="relative z-10 w-full max-w-2xl mx-auto px-4 py-8 sm:py-12 flex flex-col gap-6">
                <div className="text-center space-y-3 flex flex-col items-center">
                  <AnimatedBadge>On-device neural AI</AnimatedBadge>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
                    Create a passport photo
                  </h1>
                  <p className="text-sm sm:text-base text-neutral-400 max-w-xl">
                    Add a portrait to begin with <span className="highlight">on-device AI processing</span> so your photos never leave this computer.
                  </p>
                </div>

                {recoverableSession && (
                  <div className="flex flex-wrap items-center gap-3 card-chai px-4 py-3">
                    <FiClock className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[14px] font-medium text-foreground">Continue where you left off?</p>
                      <p className="text-[12px] text-neutral-400">
                        Unsaved work
                        {recoverableSession.savedAt
                          ? ` from ${new Date(recoverableSession.savedAt).toLocaleString()}`
                          : ""}{" "}
                        was recovered.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleDismissSession} className="btn-asym-mirror inline-flex h-8 items-center px-3 text-xs font-medium border border-border hover:bg-neutral-800">
                        Discard
                      </button>
                      <button onClick={handleRestoreSession} className="btn-asym inline-flex h-8 items-center px-3 text-xs font-medium bg-white text-black hover:bg-neutral-200">
                        Restore
                      </button>
                    </div>
                  </div>
                )}

                <PhotoUploader
                  onImageUpload={handleImageUpload}
                  onImagesUpload={handleMultipleImagesUpload}
                  onProjectLoad={handleProjectLoad}
                />

                <div className="card-chai p-5 sm:p-6">
                  <h2 className="text-sm sm:text-base font-medium text-foreground mb-4">Tips for an accepted photo</h2>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {PHOTO_TIPS.map((tip) => (
                      <li key={tip.title} className="flex items-start gap-2.5">
                        <span className="w-7 h-7 rounded-md border border-white/10 bg-white/5 text-neutral-300 flex items-center justify-center shrink-0">
                          {tip.icon}
                        </span>
                        <span className="leading-tight">
                          <span className="block text-[13px] font-medium text-foreground">{tip.title}</span>
                          <span className="block text-[12px] text-neutral-400">{tip.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : activeScreen === "success" ? (
            <div className="h-full overflow-y-auto panel-scrollbar">
              <div className="max-w-md mx-auto px-4 py-10 sm:py-16 text-center flex flex-col items-center gap-5">
                <span className="w-14 h-14 rounded-full bg-success-app/12 text-success-app flex items-center justify-center">
                  <FiCheckCircle className="w-8 h-8" />
                </span>
                <div className="space-y-1.5">
                  <h1 className="app-heading">Your print sheet is ready</h1>
                  <p className="text-[14px] text-text-secondary">
                    The PDF was saved to your downloads. Print it at 100% scale (no “fit to page”) so every photo
                    keeps its exact {getPreset(preset).widthMm} × {getPreset(preset).heightMm} mm size.
                  </p>
                </div>
                <div className="w-full grid gap-2.5 pt-2">
                  <button onClick={() => setActiveScreen("print-sheet")} className="btn-asym-mirror w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium border border-border hover:bg-neutral-800">
                    <FiPrinter className="w-4 h-4" /> Change layout or export again
                  </button>
                  <button onClick={handleSaveProject} disabled={!originalImage} className="btn-asym-mirror w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium border border-border hover:bg-neutral-800 disabled:opacity-40">
                    <FiSave className="w-4 h-4" /> Save project for later
                  </button>
                  <button onClick={handleReset} className="btn-asym w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium bg-white text-black hover:bg-neutral-200">
                    <FiCamera className="w-4 h-4" /> Start a new photo <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : isMultiPersonMode && activeScreen === "print-sheet" ? (
            <div className="w-full h-full">
              <BatchWorkspace
                batchItems={batchItems}
                onBatchItemsChange={setBatchItems}
                preset={preset}
                onPresetChange={setPreset}
                bgColor={bgColor}
                onBgColorChange={setBgColor}
                showBorder={showBorder}
                onShowBorderChange={setShowBorder}
                borderColor={borderColor}
                onBorderColorChange={setBorderColor}
                borderSize={borderSize}
                onBorderSizeChange={setBorderSize}
                spacing={spacing}
                onSpacingChange={setSpacing}
                margin={margin}
                onMarginChange={setMargin}
                onExportSuccess={() => {
                  logActivity("export");
                  setActiveScreen("success");
                }}
              />
            </div>
          ) : (
            <div className="w-full h-full">
              <ImageEditor
                activeScreen={activeScreen}
                setActiveScreen={setActiveScreen}
                imageData={getImageForProcessing()}
                originalImage={originalImage}
                processedImage={processedImage}
                brightness={brightness}
                contrast={contrast}
                saturation={saturation}
                exposure={exposure}
                temperature={temperature}
                rotation={rotation}
                bgColor={bgColor}
                cropPosition={cropPosition}
                cropScale={cropScale}
                preset={preset}
                photoCount={photoCount}
                spacing={spacing}
                margin={margin}
                showCropMarks={showCropMarks}
                showSheetTitle={showSheetTitle}
                showPresetInfo={showPresetInfo}
                showGenDate={showGenDate}
                showFooterNotes={showFooterNotes}
                autoFitA4={autoFitA4}
                skipCount={skipCount}
                paperSize={paperSize}
                onPaperSizeChange={setPaperSize}
                paperOrientation={paperOrientation}
                onPaperOrientationChange={setPaperOrientation}
                useCustomGrid={useCustomGrid}
                onUseCustomGridChange={setUseCustomGrid}
                customGridCols={customGridCols}
                onCustomGridColsChange={setCustomGridCols}
                customGridRows={customGridRows}
                onCustomGridRowsChange={setCustomGridRows}
                // Slate states
                showSlate={showSlate}
                onShowSlateChange={setShowSlate}
                slateName={slateName}
                onSlateNameChange={setSlateName}
                slateDate={slateDate}
                onSlateDateChange={setSlateDate}
                // Border states
                showBorder={showBorder}
                onShowBorderChange={setShowBorder}
                borderColor={borderColor}
                onBorderColorChange={setBorderColor}
                borderSize={borderSize}
                onBorderSizeChange={setBorderSize}
                // Multi-Person states
                isMultiPersonMode={isMultiPersonMode}
                multiPersonImages={multiPersonImages}
                // Clothing Template States
                clothingTemplate={clothingTemplate}
                onClothingTemplateChange={setClothingTemplate}
                clothingScale={clothingScale}
                onClothingScaleChange={setClothingScale}
                clothingPosition={clothingPosition}
                onClothingPositionChange={setClothingPosition}
                clothingRotation={clothingRotation}
                onClothingRotationChange={setClothingRotation}
                canvasActiveItem={canvasActiveItem}
                onCanvasActiveItemChange={setCanvasActiveItem}
                onBrightnessChange={setBrightness}
                onContrastChange={setContrast}
                onSaturationChange={setSaturation}
                onExposureChange={setExposure}
                onTemperatureChange={setTemperature}
                onRotationChange={setRotation}
                onBgColorChange={setBgColor}
                onCropPositionChange={setCropPosition}
                onCropScaleChange={setCropScale}
                onPresetChange={handlePresetChange}
                onBGRemove={handleBGRemoved}
                isProcessing={isProcessing}
                theme={theme ?? "light"}
                onThemeToggle={toggleTheme}
                onSnapshot={captureHistorySnapshot}
                bgRemover={
                  <BGRemover
                    imageData={originalImage || ""}
                    processedImage={processedImage}
                    onBGRemoved={handleBGRemoved}
                    isProcessing={isProcessing}
                    setIsProcessing={setIsProcessing}
                  />
                }
                downloadButton={
                  <DownloadButton
                    imageData={getImageForProcessing()}
                    brightness={brightness}
                    contrast={contrast}
                    saturation={saturation}
                    exposure={exposure}
                    temperature={temperature}
                    rotation={rotation}
                    bgColor={bgColor}
                    cropPosition={cropPosition}
                    cropScale={cropScale}
                    preset={preset}
                    // Clothing overlay
                    clothingTemplate={clothingTemplate}
                    clothingScale={clothingScale}
                    clothingPosition={clothingPosition}
                    clothingRotation={clothingRotation}
                    // Slate states
                    showSlate={showSlate}
                    slateName={slateName}
                    slateDate={slateDate}
                    // Border states
                    showBorder={showBorder}
                    onShowBorderChange={setShowBorder}
                    borderColor={borderColor}
                    onBorderColorChange={setBorderColor}
                    borderSize={borderSize}
                    onBorderSizeChange={setBorderSize}
                    photoCount={photoCount}
                    onPhotoCountChange={setPhotoCount}
                    spacing={spacing}
                    onSpacingChange={setSpacing}
                    margin={margin}
                    onMarginChange={setMargin}
                    showCropMarks={showCropMarks}
                    onShowCropMarksChange={setShowCropMarks}
                    showSheetTitle={showSheetTitle}
                    onShowSheetTitleChange={setShowSheetTitle}
                    showPresetInfo={showPresetInfo}
                    onShowPresetInfoChange={setShowPresetInfo}
                    showGenDate={showGenDate}
                    onShowGenDateChange={setShowGenDate}
                    showFooterNotes={showFooterNotes}
                    onShowFooterNotesChange={setShowFooterNotes}
                    autoFitA4={autoFitA4}
                    onAutoFitA4Change={setAutoFitA4}
                    skipCount={skipCount}
                    onSkipCountChange={setSkipCount}
                    isCustomCount={isCustomCount}
                    onIsCustomCountChange={setIsCustomCount}
                    customCount={customCount}
                    onCustomCountChange={setCustomCount}
                    skipMode={skipMode}
                    onSkipModeChange={setSkipMode}
                    customSkip={customSkip}
                    onCustomSkipChange={setCustomSkip}
                    paperSize={paperSize}
                    onPaperSizeChange={setPaperSize}
                    paperOrientation={paperOrientation}
                    onPaperOrientationChange={setPaperOrientation}
                    useCustomGrid={useCustomGrid}
                    onUseCustomGridChange={setUseCustomGrid}
                    customGridCols={customGridCols}
                    onCustomGridColsChange={setCustomGridCols}
                    customGridRows={customGridRows}
                    onCustomGridRowsChange={setCustomGridRows}
                    onSaveProject={handleSaveProject}
                    onExportSuccess={(fileData: any) => {
                      logActivity("export");
                      setActiveScreen("success");
                    }}
                    // Multi-Person Mode
                    isMultiPersonMode={isMultiPersonMode}
                    onMultiPersonModeChange={setIsMultiPersonMode}
                    multiPersonImages={multiPersonImages}
                    onMultiPersonImagesChange={setMultiPersonImages}
                  />
                }
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="h-16 w-full border-t border-orange-500/10 bg-panel-app/80 backdrop-blur-md px-2 sm:px-4 flex items-center gap-2 sm:gap-4 z-30 shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-1 shrink-0">
          {activeScreen !== "welcome" && (
            <button onClick={handleReset} className="h-9 px-2.5 sm:px-3 text-xs font-medium text-neutral-400 hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer" title="Start over">
              <FiRotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Start over</span>
            </button>
          )}
          {originalImage && (
            <div className="flex lg:hidden items-center">
              <IconButton title="Undo" onClick={handleUndo} disabled={!canUndo}>
                <FaUndo className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton title="Redo" onClick={handleRedo} disabled={!canRedo}>
                <FaRedo className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 hidden md:flex flex-col items-center justify-center text-center">
          <span className="text-[13px] text-text-secondary truncate max-w-full">{footerHint}</span>
          <span className="hidden 2xl:flex items-center gap-3 mt-0.5 text-[11px] text-text-secondary/80">
            <span><kbd className="font-sans font-semibold">Ctrl+V</kbd> paste</span>
            <span><kbd className="font-sans font-semibold">Space</kbd> auto-align</span>
            <span><kbd className="font-sans font-semibold">B</kbd> cut-out</span>
            <span><kbd className="font-sans font-semibold">1 to 5</kbd> sizes</span>
            <span><kbd className="font-sans font-semibold">Ctrl+P</kbd> export</span>
          </span>
        </div>
        <div className="flex-1 md:hidden" />

        <div className="flex items-center gap-2 shrink-0">
          {activeScreen !== "welcome" && (
            <button onClick={goBack} className="btn-asym-mirror inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 text-xs font-medium border border-border hover:bg-neutral-800 cursor-pointer">
              <FiChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <button
            onClick={goNext}
            className="btn-asym inline-flex items-center gap-2 h-9 px-4 sm:px-5 text-xs font-medium bg-white text-black hover:bg-neutral-200 cursor-pointer"
          >
            {activeScreen === "print-sheet" && <FiPrinter className="w-4 h-4" />}
            {activeScreen === "welcome" && <FiUpload className="w-4 h-4" />}
            {nextLabel}
            {(activeScreen === "presets" || activeScreen === "adjust") && <ArrowUpRight className="w-4 h-4" />}
          </button>
        </div>
      </footer>

      {/* Hidden file input shared by the toolbar, footer and Ctrl+O */}
      <input
        type="file"
        accept="image/*,.json"
        id="toolbar-welcome-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.name.toLowerCase().endsWith(".json")) {
            file
              .text()
              .then((text) => handleProjectLoad(JSON.parse(text)))
              .catch(() => toast("That project file could not be opened.", "error"));
          } else {
            importImageFile(file)
              .then(handleImageUpload)
              .catch(() => toast("That image could not be opened.", "error"));
          }
        }}
        className="hidden"
      />

      {showHelpModal && <DeveloperContactModal isOpen onClose={() => setShowHelpModal(false)} />}
      {showSignatureModal && <SignatureModal isOpen onClose={() => setShowSignatureModal(false)} />}
      {showActivityModal && <ActivityModal onClose={() => setShowActivityModal(false)} />}
    </main>
  );
}

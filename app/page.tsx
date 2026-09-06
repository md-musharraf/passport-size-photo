"use client";
import { useState, useEffect, useRef } from "react";
import PhotoUploader from "@/components/PhotoUploader";
import BGRemover, { removeBackground, warmUpBackgroundModel } from "@/components/BGRemover";
import ImageEditor from "@/components/ImageEditor";
import DownloadButton from "@/components/DownloadButton";
import BatchWorkspace, { BatchItem } from "@/components/BatchWorkspace";
import { useLicense } from "@/components/LicenseProvider";
import DeveloperContactModal from "@/components/DeveloperContactModal";
import { getPreset } from "@/lib/presets";
import {
  FiCamera,
  FiHelpCircle,
  FiSave,
  FiRotateCcw,
  FiRefreshCw,
  FiChevronRight,
  FiUpload,
  FiSliders,
  FiPrinter,
  FiCheck,
  FiMoon,
  FiSun,
  FiClock,
} from "react-icons/fi";
import { FaUndo, FaRedo, FaPaintBrush, FaMagic } from "react-icons/fa";
import { BsStars } from "react-icons/bs";

const MOCK_FACE_1 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231E2D36"/><circle cx="50" cy="40" r="18" fill="%23ED8936"/><rect x="35" y="58" width="30" height="30" rx="10" fill="%233182CE"/><circle cx="44" cy="38" r="2" fill="white"/><circle cx="56" cy="38" r="2" fill="white"/><path d="M 44 47 Q 50 50 56 47" stroke="white" stroke-width="1.5" fill="none"/></svg>`;
const MOCK_FACE_2 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231A202C"/><circle cx="50" cy="38" r="16" fill="%23F6AD55"/><rect x="38" y="54" width="24" height="32" rx="8" fill="%23E53E3E"/><circle cx="45" cy="36" r="2" fill="white"/><circle cx="55" cy="36" r="2" fill="white"/><path d="M 46 44 Q 50 46 54 44" stroke="white" stroke-width="1.5" fill="none"/></svg>`;

const MOCK_RECENT_PROJECTS = [
  {
    id: "1",
    name: "Sample_Passport_US.json",
    date: "2 hrs ago",
    preset: "us",
    image: MOCK_FACE_1,
    data: {
      originalImage: MOCK_FACE_1,
      processedImage: null,
      brightness: 105,
      contrast: 100,
      saturation: 100,
      exposure: 100,
      temperature: 0,
      rotation: 0,
      bgColor: "#FFFFFF",
      cropPosition: { x: 50, y: 50 },
      cropScale: 100,
      preset: "us",
    },
  },
  {
    id: "2",
    name: "Sample_Visa_India.json",
    date: "Yesterday",
    preset: "in",
    image: MOCK_FACE_2,
    data: {
      originalImage: MOCK_FACE_2,
      processedImage: null,
      brightness: 100,
      contrast: 105,
      saturation: 100,
      exposure: 100,
      temperature: 5,
      rotation: 0,
      bgColor: "#A1CAF1",
      cropPosition: { x: 50, y: 50 },
      cropScale: 100,
      preset: "in",
    },
  },
];

export type ScreenState = "welcome" | "presets" | "adjust" | "print-sheet" | "success";

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

export default function Home() {
  const { licenseState } = useLicense();
  const [activeScreen, setActiveScreen] = useState<ScreenState>("welcome");
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showHelpModal, setShowHelpModal] = useState(false);

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

  // Warm the AI cutout model up in the background while the operator is still
  // importing a photo, so the first "Remove Background" feels instant instead of
  // paying the one-time WASM + model load cost mid-task.
  useEffect(() => {
    const idle = (window as typeof window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const kick = () => {
      warmUpBackgroundModel("isnet_quint8");
    };
    if (idle) idle(kick);
    else setTimeout(kick, 1200);
  }, []);

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

  // Synchronize layout theme
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
        if (savedTheme) setTheme(savedTheme);
      } catch (e) {
        console.warn("LocalStorage not available:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const root = window.document.documentElement;
      if (theme === "light") {
        root.classList.add("light");
        root.classList.remove("dark");
      } else {
        root.classList.add("dark");
        root.classList.remove("light");
      }
      try {
        localStorage.setItem("theme", theme);
      } catch (e) {
        console.warn("LocalStorage not writable:", e);
      }
    }
  }, [theme]);

  // Load sample project metadata
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

    // Automatically apply AI Color & Lighting Enhancement
    setBrightness(106);
    setContrast(112);
    setSaturation(105);
    setExposure(102);

    // Set default backdrop color based on current preset's document standard
    const defaultBgColor = getPreset(preset).bgColor;
    setBgColor(defaultBgColor);

    pushToHistory(
      buildSnapshot({
        processedImage: processed,
        brightness: 106,
        contrast: 112,
        saturation: 105,
        exposure: 102,
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

  // Full serialisable project state — shared by manual "Save Project" and the
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

  // Safe navigation checks
  const navigateToScreen = (screenName: ScreenState) => {
    if (screenName !== "welcome" && !originalImage) {
      handleImageUpload(MOCK_FACE_1);
    }
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
        const result = await removeBackground(originalImage, "isnet_quint8", "cpu");
        handleBGRemoved(result);
      } catch (e) {
        alert("Background removal failed.");
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

  // Debounced background auto-save of the working session.
  useEffect(() => {
    if (!originalImage || autosaveBlockedRef.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({ ...buildProjectData(), savedAt: Date.now() }),
        );
      } catch (e) {
        // Storage quota exceeded (large base64 images) — stop retrying this session.
        autosaveBlockedRef.current = true;
      }
    }, 1200);
    return () => clearTimeout(t);
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
            const reader = new FileReader();
            reader.onload = (evt) => {
              if (evt.target?.result) {
                handleImageUpload(evt.target.result as string);
              }
            };
            reader.readAsDataURL(blob);
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
          handlePresetChange("stamp");
        } else if (e.key === "4") {
          handlePresetChange("us");
        } else if (e.key === "5") {
          handlePresetChange("oci");
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

  // Workflow steps layout
  const workflowSteps: { id: ScreenState; label: string }[] = [
    { id: "welcome", label: "Welcome" },
    { id: "presets", label: "1. Presets" },
    { id: "adjust", label: "2. Adjust & Cutout" },
    { id: "print-sheet", label: "3. Print Sheet" },
    { id: "success", label: "4. Success" },
  ];

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-bg-app text-text-primary font-sans antialiased select-none relative">
      {/* 1. Header (64px) */}
      <header className="h-[64px] w-full border-b border-border-app bg-panel-app px-6 flex justify-between items-center select-none z-30 shrink-0 relative">
        <div className="flex items-center gap-3">
          <FiCamera className="w-6 h-6 text-accent-app" />
          <span className="font-extrabold text-[22px] tracking-tight text-text-primary select-none">
            Precision ID Studio
          </span>
          <span className="text-[10px] bg-card-app border border-border-app text-accent-app px-1.5 py-0.5 rounded font-black uppercase tracking-widest">
            v2.0 PRO
          </span>
          {licenseState.type === "TRIAL" && (
            <div className="text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-500 px-3 py-1 rounded-xl font-bold flex items-center gap-1.5 select-none shrink-0 animate-pulse">
              <FiClock className="w-3.5 h-3.5" />
              <span className="font-black tracking-wider text-[9px] sm:text-[10px]">
                THIS IS TRIAL VERSION
              </span>
              <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black text-[9px]">
                {licenseState.daysRemaining}D Left
              </span>
            </div>
          )}
        </div>

        {/* Workflow Stepper */}
        <nav className="flex items-center gap-2 bg-bg-app p-1 border border-border-app rounded-xl select-none">
          {workflowSteps.map((step, idx) => {
            const isActive = activeScreen === step.id;
            const isCompleted = workflowSteps.findIndex((s) => s.id === activeScreen) > idx;
            return (
              <div
                key={step.id}
                className="flex items-center"
              >
                {idx > 0 && <span className="h-[1px] w-4 bg-border-app mx-1 shrink-0" />}
                <button
                  disabled={step.id !== "welcome" && !originalImage}
                  onClick={() => navigateToScreen(step.id)}
                  className={`px-3 py-1 rounded-lg text-[13px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? "bg-accent-app text-white shadow-lg shadow-accent-app/10"
                      : isCompleted
                        ? "text-accent-app hover:text-accent-hover font-bold"
                        : "text-neutral-500 hover:text-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${isActive ? "bg-white text-accent-app font-bold" : isCompleted ? "bg-accent-app/20 text-accent-app" : "bg-card-app text-neutral-400"}`}
                  >
                    {isCompleted ? <FiCheck className="w-2.5 h-2.5" /> : idx + 1}
                  </span>
                  <span>{step.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        {/* Right Help / Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            className="w-10 h-10 rounded-xl border border-border-app bg-card-app text-text-primary hover:bg-panel-app flex items-center justify-center transition-colors cursor-pointer select-none"
            title="Toggle Theme"
          >
            {theme === "dark" ? (
              <FiSun className="w-5 h-5 text-text-primary" />
            ) : (
              <FiMoon className="w-5 h-5 text-text-primary" />
            )}
          </button>

          <button
            onClick={handleSaveProject}
            disabled={!originalImage}
            className="w-10 h-10 rounded-xl border border-border-app bg-card-app text-text-primary hover:bg-panel-app disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer select-none"
            title="Save Project (.json)"
          >
            <FiSave className="w-5 h-5 text-text-primary" />
          </button>

          <div className="w-[1px] h-4 bg-border-app" />

          <button
            onClick={() => setShowHelpModal(true)}
            className="w-10 h-10 rounded-xl border border-border-app bg-card-app text-text-secondary hover:text-text-primary hover:bg-panel-app flex items-center justify-center transition-colors cursor-pointer select-none"
            title="Help & Support"
          >
            <FiHelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Main Workspace layout (3 columns) */}
      <section className="flex-1 w-full overflow-hidden relative z-10 flex min-h-0">
        {/* Column A: Left Toolbar (80px) */}
        <aside className="w-[80px] bg-panel-app border-r border-border-app flex flex-col items-center justify-between py-4 select-none shrink-0 z-20">
          <div className="flex flex-col gap-3 w-full px-2">
            <button
              onClick={() => handleLeftToolbarAction("import")}
              className="w-full aspect-square rounded-xl bg-card-app hover:bg-panel-app border border-border-app flex flex-col items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              title="Import Photo File"
            >
              <FiUpload className="w-5 h-5 text-accent-app" />
              <span className="text-[10px] font-bold">Import</span>
            </button>

            <button
              onClick={() => handleLeftToolbarAction("camera")}
              className="w-full aspect-square rounded-xl bg-card-app hover:bg-panel-app border border-border-app flex flex-col items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              title="Capture Webcam"
            >
              <FiCamera className="w-5 h-5 text-accent-app" />
              <span className="text-[10px] font-bold">Camera</span>
            </button>

            <div className="h-[1px] bg-border-app my-1 w-3/4 mx-auto" />

            <button
              disabled={!originalImage || isProcessing}
              onClick={() => handleLeftToolbarAction("remove-bg")}
              className="w-full aspect-square rounded-xl bg-card-app hover:bg-panel-app border border-border-app disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              title="Remove Background via AI"
            >
              <BsStars className="w-5 h-5 text-accent-app" />
              <span className="text-[10px] font-bold">Cutout</span>
            </button>

            <button
              disabled={!originalImage}
              onClick={() => handleLeftToolbarAction("auto-align")}
              className="w-full aspect-square rounded-xl bg-card-app hover:bg-panel-app border border-border-app disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              title="AI Auto Align Face"
            >
              <FaMagic className="w-5 h-5 text-emerald-400" />
              <span className="text-[10px] font-bold">Align</span>
            </button>

            <button
              disabled={!originalImage}
              onClick={() => handleLeftToolbarAction("ai-enhance")}
              className="w-full aspect-square rounded-xl bg-card-app hover:bg-panel-app border border-border-app disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              title="AI Color & Lighting Enhance"
            >
              <FiSliders className="w-5 h-5 text-accent-app" />
              <span className="text-[10px] font-bold">Enhance</span>
            </button>

            <button
              disabled={!originalImage}
              onClick={() => handleLeftToolbarAction("ai-retouch")}
              className="w-full aspect-square rounded-xl bg-card-app hover:bg-panel-app border border-border-app disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              title="AI Smooth Skin Retouch"
            >
              <FaPaintBrush className="w-5 h-5 text-pink-400" />
              <span className="text-[10px] font-bold">Retouch</span>
            </button>
          </div>

          {/* Bottom Undo/Redo */}
          <div className="flex flex-col gap-2 w-full px-2">
            <button
              onClick={() => handleLeftToolbarAction("undo")}
              disabled={historyIndex <= 0}
              className="w-full h-10 rounded-xl bg-card-app hover:bg-panel-app border border-border-app disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
              title="Undo Action"
            >
              <FaUndo className="w-4 h-4 text-text-primary" />
            </button>
            <button
              onClick={() => handleLeftToolbarAction("redo")}
              disabled={historyIndex >= history.length - 1}
              className="w-full h-10 rounded-xl bg-card-app hover:bg-panel-app border border-border-app disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer"
              title="Redo Action"
            >
              <FaRedo className="w-4 h-4 text-text-primary" />
            </button>
          </div>
        </aside>

        {/* Column B: Center Workspace (Flexible, 45-50% width) */}
        <div className="flex-1 bg-bg-app flex flex-col justify-center items-center p-6 min-h-0 relative overflow-hidden select-none">
          {activeScreen === "welcome" ? (
            <div className="w-full max-w-xl flex flex-col justify-center gap-6 z-10 h-full max-h-[500px]">
              <div className="text-center space-y-2">
                <h1 className="app-heading text-accent-app">Studio Operator Console</h1>
                <p className="app-label text-neutral-400">
                  Import a high-resolution portrait or start the webcam to begin.
                </p>
              </div>

              {recoverableSession && (
                <div className="flex items-center gap-3 bg-accent-app/10 border border-accent-app/30 rounded-xl px-4 py-3 select-none">
                  <FiClock className="w-4 h-4 text-accent-app shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-text-primary">
                      Restore your last session?
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      An unsaved session was recovered
                      {recoverableSession.savedAt
                        ? ` from ${new Date(recoverableSession.savedAt).toLocaleString()}`
                        : ""}
                      .
                    </p>
                  </div>
                  <button
                    onClick={handleRestoreSession}
                    className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-accent-app text-white hover:bg-accent-hover transition-colors cursor-pointer shrink-0"
                  >
                    Restore
                  </button>
                  <button
                    onClick={handleDismissSession}
                    className="text-[12px] font-bold px-2 py-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <PhotoUploader
                onImageUpload={handleImageUpload}
                onImagesUpload={handleMultipleImagesUpload}
                onProjectLoad={handleProjectLoad}
              />

              <div className="glass-card bg-panel-app border border-border-app rounded-xl p-4 space-y-2">
                <h4 className="text-[13px] font-black text-accent-app uppercase tracking-widest">
                  Recent Session Profiles
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {MOCK_RECENT_PROJECTS.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => handleProjectLoad(proj.data)}
                      className="p-2 rounded-xl bg-card-app border border-border-app hover:bg-panel-app transition-all text-left flex items-center gap-3 cursor-pointer group"
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-border-app bg-bg-app shrink-0">
                        <img
                          src={proj.image}
                          alt={proj.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-text-primary truncate group-hover:text-accent-hover transition-colors">
                          {proj.name}
                        </p>
                        <p className="text-[10px] text-text-secondary font-semibold mt-0.5">
                          {proj.date}
                        </p>
                      </div>
                    </button>
                  ))}
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
                onExportSuccess={() => setActiveScreen("success")}
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
                theme={theme}
                onThemeToggle={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
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

      {/* 3. Fixed Bottom Action Bar (72px) */}
      <footer className="h-[72px] w-full border-t border-border-app bg-panel-app px-6 py-2.5 flex justify-between items-center select-none z-30 shrink-0 relative">
        {/* Left Footer Action */}
        <div className="flex gap-2 w-1/4">
          {activeScreen !== "welcome" && (
            <button
              onClick={handleReset}
              className="studio-btn studio-btn-secondary"
            >
              <FiRotateCcw className="w-5 h-5 mr-2" /> Start Over
            </button>
          )}
        </div>

        {/* Center Tip Info & Keyboard Shortcut Quick Bar */}
        <div className="flex flex-col items-center justify-center text-center select-none">
          <span className="text-[13px] font-bold text-neutral-300">
            {activeScreen === "welcome" && "Passport Photo Creator Pro • Fully Offline AI Engine"}
            {activeScreen === "presets" && "Step 1: Select biometric document preset standard"}
            {activeScreen === "adjust" &&
              "Step 2: Align face with biometric overlay & adjust formal suits"}
            {activeScreen === "print-sheet" &&
              "Step 3: Configure grid layout, skipped slots, and borders"}
            {activeScreen === "success" && "Export complete! Save project or print document sheet"}
          </span>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-extrabold text-accent-app">
            <span className="bg-card-app border border-border-app px-1.5 py-0.2 rounded">
              Ctrl+V Paste
            </span>
            <span>•</span>
            <span className="bg-card-app border border-border-app px-1.5 py-0.2 rounded">
              Space Auto-Align
            </span>
            <span>•</span>
            <span className="bg-card-app border border-border-app px-1.5 py-0.2 rounded">
              1..5 Presets
            </span>
            <span>•</span>
            <span className="bg-card-app border border-border-app px-1.5 py-0.2 rounded">
              Ctrl+P Print
            </span>
          </div>
        </div>

        {/* Right Footer Contextual CTAs (Min height 48px, rounded 12px, font 16px) */}
        <div className="w-1/4 flex justify-end items-center gap-3 select-none">
          {activeScreen === "welcome" ? (
            <button
              onClick={triggerImportClick}
              className="studio-btn studio-btn-primary"
            >
              Import Portrait <FiChevronRight className="w-4 h-4 ml-1.5" />
            </button>
          ) : activeScreen === "presets" ? (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveScreen("welcome")}
                className="studio-btn studio-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={() => setActiveScreen("adjust")}
                className="studio-btn studio-btn-primary"
              >
                Next (Adjust) <FiChevronRight className="w-4 h-4 ml-1.5" />
              </button>
            </div>
          ) : activeScreen === "adjust" ? (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveScreen("presets")}
                className="studio-btn studio-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={() => setActiveScreen("print-sheet")}
                className="studio-btn studio-btn-primary"
              >
                Next (Print Sheet) <FiChevronRight className="w-4 h-4 ml-1.5" />
              </button>
            </div>
          ) : activeScreen === "print-sheet" ? (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveScreen("adjust")}
                className="studio-btn studio-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={() => {
                  const exportBtn = document.getElementById("download-pdf-hidden-trigger");
                  if (exportBtn) {
                    exportBtn.click();
                  } else {
                    setActiveScreen("success");
                  }
                }}
                className="studio-btn studio-btn-success"
              >
                Export Sheet <FiPrinter className="w-4 h-4 ml-1.5" />
              </button>
            </div>
          ) : (
            /* Success Screen CTA */
            <button
              onClick={handleReset}
              className="studio-btn studio-btn-primary"
            >
              Start New Photo <FiRefreshCw className="w-4 h-4 ml-1.5" />
            </button>
          )}
        </div>
      </footer>

      {/* Hidden file input for file uploads */}
      <input
        type="file"
        accept="image/*,.json"
        id="toolbar-welcome-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.name.endsWith(".json")) {
              const reader = new FileReader();
              reader.onload = (e) => {
                try {
                  const projectObj = JSON.parse(e.target?.result as string);
                  handleProjectLoad(projectObj);
                } catch (err) {
                  alert("Invalid project JSON.");
                }
              };
              reader.readAsText(file);
            } else {
              const reader = new FileReader();
              reader.onload = (e) => {
                handleImageUpload(e.target?.result as string);
              };
              reader.readAsDataURL(file);
            }
          }
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Developer Contact & Support Modal */}
      <DeveloperContactModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </main>
  );
}

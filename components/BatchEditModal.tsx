'use client';
import { useState, useEffect, useRef } from 'react';
import { FiX, FiCheck, FiSliders, FiSun, FiUser, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import { FaPaintBrush } from 'react-icons/fa';
import { BsStars } from 'react-icons/bs';
import { CLOTHING_TEMPLATES } from './ImageEditor';
import { BatchItem } from './BatchWorkspace';
import BGRefinerModal from './BGRefinerModal';
import { removeBackground, type BgQuality } from './BGRemover';
import { MIN_CROP_POS, MAX_CROP_POS } from '@/lib/faceAlign';
import { usePanZoom } from '@/lib/usePanZoom';

interface BatchEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BatchItem | null;
  onSave: (updatedItem: BatchItem) => void;
  presetWidthMm: number;
  presetHeightMm: number;
  bgColor: string;
}

export default function BatchEditModal({
  isOpen,
  onClose,
  item,
  onSave,
  presetWidthMm,
  presetHeightMm,
  bgColor,
}: BatchEditModalProps) {
  // Local state copy of item editing variables
  const [cropScale, setCropScale] = useState(100);
  const [cropPosition, setCropPosition] = useState({ x: 50, y: 50 });
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [exposure, setExposure] = useState(100);
  const [temperature, setTemperature] = useState(0);
  const [clothingTemplate, setClothingTemplate] = useState<'none' | 'suit_male' | 'suit_female' | 'tuxedo'>('none');
  const [clothingScale, setClothingScale] = useState(100);
  const [clothingPosition, setClothingPosition] = useState({ x: 50, y: 55 });
  const [clothingRotation, setClothingRotation] = useState(0);

  // Background removal states
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Ready to remove background');
  const [modelQuality, setModelQuality] = useState<BgQuality>('auto');
  const [isRefinerOpen, setIsRefinerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'crop' | 'cutout' | 'color' | 'suits'>('crop');
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDragTarget, setActiveDragTarget] = useState<'photo' | 'clothing'>('photo');

  // Drag / wheel / pinch on the preview (mouse, touch and pen).
  const movingClothing = activeDragTarget === 'clothing' && clothingTemplate !== 'none';
  const zoomClamp = (v: number) => Math.min(Math.max(Math.round(v), 30), 300);
  usePanZoom(containerRef, isOpen && !!item, {
    getStart: () =>
      movingClothing
        ? { x: clothingPosition.x, y: clothingPosition.y, scale: clothingScale }
        : { x: cropPosition.x, y: cropPosition.y, scale: cropScale },
    onPan: (dx, dy, start) => {
      if (movingClothing) {
        setClothingPosition({ x: Math.min(Math.max(start.x + dx, 0), 100), y: Math.min(Math.max(start.y + dy, 0), 100) });
      } else {
        setCropPosition({
          x: Math.min(Math.max(start.x - dx, MIN_CROP_POS), MAX_CROP_POS),
          y: Math.min(Math.max(start.y - dy, MIN_CROP_POS), MAX_CROP_POS),
        });
      }
    },
    onZoom: (factor, start) => {
      if (movingClothing) setClothingScale(zoomClamp(start.scale * factor));
      else setCropScale(zoomClamp(start.scale * factor));
    },
  });

  useEffect(() => {
    if (item) {
      setCropScale(item.cropScale);
      setCropPosition(item.cropPosition);
      setRotation(item.rotation);
      setBrightness(item.brightness);
      setContrast(item.contrast);
      setSaturation(item.saturation);
      setExposure(item.exposure);
      setTemperature(item.temperature);
      setClothingTemplate(item.clothingTemplate);
      setClothingScale(item.clothingScale);
      setClothingPosition(item.clothingPosition);
      setClothingRotation(item.clothingRotation);
      setProcessedImage(item.processedImage);
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  const handleBGRemove = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusText('Loading AI model...');
    setProgress(5);
    
    try {
      const processed = await removeBackground(
        item.originalImage, 
        modelQuality,
        (p) => {
          setProgress(p);
          if (p < 20) {
            setStatusText('Initializing AI model...');
          } else if (p < 60) {
            setStatusText('Scanning photo...');
          } else if (p < 90) {
            setStatusText('Detecting subject contours...');
          } else {
            setStatusText('Removing background...');
          }
        },
        (status) => {
          setStatusText(status);
        }
      );
      setProgress(100);
      setStatusText('Background removed successfully!');
      setProcessedImage(processed);
    } catch (err: any) {
      console.error('BG Removal Error:', err);
      setError(err?.message || 'Failed to remove background. Please try again.');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    onSave({
      ...item,
      processedImage,
      cropScale,
      cropPosition,
      rotation,
      brightness,
      contrast,
      saturation,
      exposure,
      temperature,
      clothingTemplate,
      clothingScale,
      clothingPosition,
      clothingRotation,
    });
    onClose();
  };

  const filterStyle = {
    filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) brightness(${exposure}%)`,
  };

  const warmthOverlayStyle = {
    backgroundColor: temperature > 0 
      ? `rgba(245, 158, 11, ${Math.abs(temperature) / 250})`
      : `rgba(59, 130, 246, ${Math.abs(temperature) / 250})`,
    mixBlendMode: 'color' as const,
  };

  const photoSrc = processedImage || item.originalImage;


  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-panel-app border border-border-app rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-app flex justify-between items-center bg-card-app/30">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Adjust Portrait: {item.name}</h2>
            <p className="text-xs text-text-secondary">Fine-tune face position, brightness, or apply professional suit clothing overlays.</p>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg bg-card-app hover:bg-border-app text-text-secondary hover:text-text-primary flex items-center justify-center cursor-pointer transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          
          {/* Interactive Preview Area */}
          <div className="flex-1 bg-bg-app p-6 flex flex-col items-center justify-center relative select-none">
            <div 
              ref={containerRef}
              className="touch-none-canvas relative aspect-square w-full max-w-[320px] border-2 border-accent-app rounded-lg overflow-hidden shadow-inner cursor-grab active:cursor-grabbing"
              style={{ 
                aspectRatio: `${presetWidthMm} / ${presetHeightMm}`,
                backgroundColor: processedImage ? bgColor : '#1E293B',
              }}
            >
              {/* Photo layer */}
              {photoSrc && (
                <div className="w-full h-full relative" style={filterStyle}>
                  <img
                    src={photoSrc}
                    alt="Adjusting"
                    className="absolute left-1/2 top-1/2 w-full h-full object-cover pointer-events-none origin-center"
                    style={{
                      transform: `translate(-50%, -50%) translate(${(cropPosition.x - 50) * -1}%, ${(cropPosition.y - 50) * -1}%) scale(${cropScale / 100}) rotate(${rotation}deg)`,
                      transition: 'none',
                    }}
                  />
                  {/* Warmth tint overlay */}
                  {temperature !== 0 && (
                    <div className="absolute inset-0 pointer-events-none" style={warmthOverlayStyle} />
                  )}
                </div>
              )}

              {/* Suit template overlay */}
              {clothingTemplate !== 'none' && (
                <img
                  src={
                    clothingTemplate === 'suit_male' ? 'clothing/suit_male.png' :
                    clothingTemplate === 'suit_female' ? 'clothing/suit_female.png' : 'clothing/tuxedo.png'
                  }
                  alt="Suit template overlay"
                  className="absolute pointer-events-none origin-center"
                  style={{
                    width: '100%',
                    height: '100%',
                    transform: `translate(-50%, -50%) translate(${(clothingPosition.x - 50)}%, ${(clothingPosition.y - 50)}%) scale(${clothingScale / 100}) rotate(${clothingRotation}deg)`,
                    left: '50%',
                    top: '50%',
                  }}
                />
              )}

              {/* Grid overlay guides */}
              <div className="absolute inset-0 pointer-events-none border border-white/20 flex flex-col justify-between">
                <div className="h-[25%] border-b border-dashed border-white/25 flex justify-between">
                  <div className="w-[25%] border-r border-dashed border-white/25" />
                  <div className="w-[25%] border-l border-dashed border-white/25" />
                </div>
                <div className="h-[25%] border-t border-dashed border-white/25 flex justify-between">
                  <div className="w-[25%] border-r border-dashed border-white/25" />
                  <div className="w-[25%] border-l border-dashed border-white/25" />
                </div>
              </div>

              {/* Active Selection Badge */}
              <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase pointer-events-none">
                Dragging: {activeDragTarget}
              </div>
            </div>

            <p className="text-[11px] text-text-secondary mt-3 font-semibold text-center max-w-[280px]">
              Drag inside the box to pan. Use mouse wheel / pinch to zoom.
            </p>
          </div>

          {/* Configuration Controls Side */}
          <div className="w-full md:w-[360px] border-t md:border-t-0 md:border-l border-border-app bg-card-app/10 flex flex-col min-h-0">
            {/* Tabs */}
            <div className="flex border-b border-border-app select-none">
              <button
                type="button"
                onClick={() => setActiveTab('crop')}
                className={`flex-1 py-3 text-center text-[10.5px] font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                  activeTab === 'crop'
                    ? 'border-accent-app text-accent-app bg-accent-app/5'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                Crop
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cutout')}
                className={`flex-1 py-3 text-center text-[10.5px] font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                  activeTab === 'cutout'
                    ? 'border-accent-app text-accent-app bg-accent-app/5'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                Cutout
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('color')}
                className={`flex-1 py-3 text-center text-[10.5px] font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                  activeTab === 'color'
                    ? 'border-accent-app text-accent-app bg-accent-app/5'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                Color
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('suits')}
                className={`flex-1 py-3 text-center text-[10.5px] font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                  activeTab === 'suits'
                    ? 'border-accent-app text-accent-app bg-accent-app/5'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                Suits
              </button>
            </div>

            {/* Tab content area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {activeTab === 'crop' && (
                <div className="space-y-4">
                  {clothingTemplate !== 'none' && (
                    <div className="bg-accent-app/10 border border-accent-app/30 p-2.5 rounded-xl flex flex-col gap-2 mb-2">
                      <span className="text-[10px] font-black text-accent-app uppercase tracking-wider">Drag Target Mode</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setActiveDragTarget('photo')}
                          className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            activeDragTarget === 'photo'
                              ? 'bg-accent-app text-white border-accent-app'
                              : 'bg-card-app border-border-app text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          Move Portrait
                        </button>
                        <button
                          onClick={() => setActiveDragTarget('clothing')}
                          className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            activeDragTarget === 'clothing'
                              ? 'bg-accent-app text-white border-accent-app'
                              : 'bg-card-app border-border-app text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          Move Suit Template
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                      <span>Zoom Scale</span>
                      <span className="text-accent-app">{cropScale}%</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="300"
                      value={cropScale}
                      onChange={(e) => setCropScale(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                      <span>Image Rotation</span>
                      <span className="text-accent-app">{rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 flex justify-between">
                    <button
                      onClick={() => {
                        setCropScale(100);
                        setCropPosition({ x: 50, y: 50 });
                        setRotation(0);
                      }}
                      className="text-xs font-bold text-accent-app hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <FiRefreshCw className="w-3.5 h-3.5" /> Reset Crop & Rotation
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'cutout' && (
                <div className="space-y-4">
                  {/* Model Quality Selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                      AI Precision Quality
                    </label>
                    <select
                      value={modelQuality}
                      onChange={(e) => setModelQuality(e.target.value as BgQuality)}
                      disabled={isProcessing}
                      className="w-full bg-card-app border border-border-app text-text-primary text-[12.5px] font-bold rounded-xl px-3 py-2 outline-none focus:border-accent-app cursor-pointer"
                    >
                      <option value="auto">Automatic (recommended)</option>
                      <option value="fast">Fast</option>
                      <option value="best">Best edges (slower)</option>
                    </select>
                  </div>

                  {/* Action Buttons */}
                  {!processedImage ? (
                    <button
                      onClick={handleBGRemove}
                      disabled={isProcessing}
                      className="w-full py-2.5 bg-accent-app hover:bg-accent-hover disabled:opacity-50 text-white font-extrabold text-sm rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Removing Background ({progress}%)</span>
                        </>
                      ) : (
                        <>
                          <BsStars className="w-4 h-4 text-white animate-pulse" />
                          <span>Remove Background</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleBGRemove}
                        disabled={isProcessing}
                        className="flex-1 py-2.5 bg-card-app border border-border-app text-text-primary hover:bg-border-app font-bold text-sm rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-accent-app" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Re-Running ({progress}%)</span>
                          </>
                        ) : (
                          <>
                            <FiRefreshCw className="w-4 h-4 text-text-primary" />
                            <span>Redo AI Cutout</span>
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={() => setIsRefinerOpen(true)}
                        disabled={isProcessing}
                        className="py-2.5 px-4 bg-accent-app/10 border border-accent-app/45 hover:bg-accent-app/20 text-accent-app font-extrabold text-sm rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <FaPaintBrush className="w-4 h-4" /> Touch Up
                      </button>
                    </div>
                  )}

                  {isProcessing && (
                    <div className="space-y-1.5 mt-2 px-1">
                      <div className="flex justify-between text-[11px] text-text-secondary font-bold">
                        <span>{statusText}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-bg-app h-1.5 rounded-full overflow-hidden border border-border-app">
                        <div 
                          className="bg-gradient-to-r from-accent-app to-accent-hover h-full rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="p-2.5 bg-danger-app/10 border border-danger-app/30 text-danger-app text-xs rounded-xl flex items-center gap-1.5">
                      <FiAlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'color' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                      <span>Brightness</span>
                      <span className="text-accent-app">{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                      <span>Contrast</span>
                      <span className="text-accent-app">{contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                      <span>Saturation</span>
                      <span className="text-accent-app">{saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                      <span>Exposure</span>
                      <span className="text-accent-app">{exposure}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={exposure}
                      onChange={(e) => setExposure(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                      <span>Color Warmth</span>
                      <span className="text-accent-app">{temperature}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={temperature}
                      onChange={(e) => setTemperature(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 flex justify-between">
                    <button
                      onClick={() => {
                        setBrightness(100);
                        setContrast(100);
                        setSaturation(100);
                        setExposure(100);
                        setTemperature(0);
                      }}
                      className="text-xs font-bold text-accent-app hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <FiRefreshCw className="w-3.5 h-3.5" /> Reset Lighting & Warmth
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'suits' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-text-primary">Select suit overlay</span>
                    <div className="grid grid-cols-2 gap-2">
                      {CLOTHING_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => {
                            setClothingTemplate(tmpl.id);
                            if (tmpl.id !== 'none') {
                              setActiveDragTarget('clothing');
                            } else {
                              setActiveDragTarget('photo');
                            }
                          }}
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-left cursor-pointer flex flex-col justify-between ${
                            clothingTemplate === tmpl.id
                              ? 'bg-accent-app/10 border-accent-app text-accent-app'
                              : 'bg-card-app border-border-app text-text-secondary hover:bg-border-app hover:text-text-primary'
                          }`}
                        >
                          <span>{tmpl.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {clothingTemplate !== 'none' && (
                    <div className="space-y-4 pt-3 border-t border-border-app/40 animate-fadeIn">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                          <span>Suit Scale</span>
                          <span className="text-accent-app">{clothingScale}%</span>
                        </div>
                        <input
                          type="range"
                          min="30"
                          max="200"
                          value={clothingScale}
                          onChange={(e) => setClothingScale(Number(e.target.value))}
                          className="w-full accent-accent-app cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs font-bold text-text-primary">
                          <span>Suit Rotation</span>
                          <span className="text-accent-app">{clothingRotation}°</span>
                        </div>
                        <input
                          type="range"
                          min="-45"
                          max="45"
                          value={clothingRotation}
                          onChange={(e) => setClothingRotation(Number(e.target.value))}
                          className="w-full accent-accent-app cursor-pointer"
                        />
                      </div>

                      <button
                        onClick={() => {
                          setClothingScale(100);
                          setClothingPosition({ x: 50, y: 55 });
                          setClothingRotation(0);
                        }}
                        className="text-xs font-bold text-accent-app hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <FiRefreshCw className="w-3.5 h-3.5" /> Reset Suit Parameters
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Save / Cancel actions */}
            <div className="p-4 border-t border-border-app bg-card-app/30 flex justify-end gap-2.5 select-none">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-border-app text-text-secondary hover:text-text-primary rounded-xl text-xs font-bold hover:bg-card-app/60 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-accent-app hover:bg-accent-hover text-white rounded-xl text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors shadow-md shadow-accent-app/10"
              >
                <FiCheck className="w-4 h-4" /> Save Changes
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Manual background touch up boundary refiner */}
      <BGRefinerModal
        isOpen={isRefinerOpen}
        onClose={() => setIsRefinerOpen(false)}
        originalImage={item.originalImage}
        aiTransparentImage={processedImage}
        onApply={(refined) => {
          setProcessedImage(refined);
          setIsRefinerOpen(false);
        }}
      />
    </div>
  );
}

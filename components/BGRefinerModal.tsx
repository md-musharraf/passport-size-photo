'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiScissors, FiSettings } from 'react-icons/fi';
import { FaEraser, FaPaintBrush, FaRegLightbulb, FaHandPaper } from 'react-icons/fa';
import { BsStars } from 'react-icons/bs';
import { ArrowUpRight } from 'lucide-react';

interface BGRefinerModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalImage: string; // Base64 or URL
  aiTransparentImage: string | null; // Base64 or URL
  onApply: (refinedImage: string) => void;
}

export default function BGRefinerModal({
  isOpen,
  onClose,
  originalImage,
  aiTransparentImage,
  onApply,
}: BGRefinerModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Brush and navigation states
  const [brushMode, setBrushMode] = useState<'restore' | 'erase' | 'pan'>('erase');
  const [brushSize, setBrushSize] = useState<number>(25);
  const [brushHardness, setBrushHardness] = useState<number>(0.5);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [previewBg, setPreviewBg] = useState<string>('checkerboard');
  
  // Edge refinement states
  const [maskFeather, setMaskFeather] = useState<number>(0);
  const [maskEdgeTrim, setMaskEdgeTrim] = useState<number>(0); // Erode (positive) / Dilate (negative)
  const [decontaminate, setDecontaminate] = useState<boolean>(true);
  const [decontaminateRadius, setDecontaminateRadius] = useState<number>(5);

  // Loading and canvas references
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      initialFitDoneRef.current = false;
    }
  }, [isOpen]);

  const rawMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const decontaminatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialFitDoneRef = useRef(false);
  
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const aiImageRef = useRef<HTMLImageElement | null>(null);
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  
  const isPaintingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isSpacePressedRef = useRef(false);

  // Spacebar keyboard listener for quick panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        isSpacePressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Initialize canvases and load images
  useEffect(() => {
    if (!isOpen) return;
    
    setIsLoaded(false);
    isPaintingRef.current = false;
    isDraggingRef.current = false;
    
    const origImg = new Image();
    origImg.crossOrigin = 'anonymous';
    origImg.onload = () => {
      originalImageRef.current = origImg;
      
      // Determine canvas sizes (cap at 1200px to maintain performance and high quality)
      const maxDim = 1200;
      let w = origImg.width;
      let h = origImg.height;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      
      // Create offscreen raw mask canvas
      const rawMask = document.createElement('canvas');
      rawMask.width = w;
      rawMask.height = h;
      const rawMaskCtx = rawMask.getContext('2d');
      
      // Create offscreen processed mask canvas
      const procMask = document.createElement('canvas');
      procMask.width = w;
      procMask.height = h;
      
      // Create offscreen original image canvas (pre-rendered for compositing)
      const origCanvas = document.createElement('canvas');
      origCanvas.width = w;
      origCanvas.height = h;
      const origCtx = origCanvas.getContext('2d');
      origCtx?.drawImage(origImg, 0, 0, w, h);
      
      rawMaskCanvasRef.current = rawMask;
      processedMaskCanvasRef.current = procMask;
      originalCanvasRef.current = origCanvas;

      const finishInitialization = () => {
        setIsLoaded(true);
        // Initial fit and mask processing will be triggered by ResizeObserver once container size is resolved
        setTimeout(() => {
          applyMaskProcessing();
        }, 50);
      };

      // If we have an AI-processed cutout, extract its transparency mask
      if (aiTransparentImage) {
        const aiImg = new Image();
        aiImg.crossOrigin = 'anonymous';
        aiImg.onload = () => {
          aiImageRef.current = aiImg;
          rawMaskCtx?.drawImage(aiImg, 0, 0, w, h);
          
          // Convert pixels to a pure alpha mask (White = Subject, Transparent = Background)
          const imgData = rawMaskCtx?.getImageData(0, 0, w, h);
          if (imgData) {
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              data[i] = 255;     // Red
              data[i + 1] = 255; // Green
              data[i + 2] = 255; // Blue
              // Alpha clean up (remove compression/fringe noise)
              const alphaVal = data[i + 3];
              if (alphaVal < 15) {
                data[i + 3] = 0;
              } else if (alphaVal > 240) {
                data[i + 3] = 255;
              }
            }
            rawMaskCtx?.putImageData(imgData, 0, 0);
          }
          finishInitialization();
        };
        aiImg.onerror = () => {
          console.error('Failed to load AI transparent image, falling back to opaque');
          rawMaskCtx?.fillRect(0, 0, w, h); // Fully opaque mask
          finishInitialization();
        };
        aiImg.src = aiTransparentImage;
      } else {
        // No AI cutout: initialize with a fully white mask (opaque)
        if (rawMaskCtx) {
          rawMaskCtx.fillStyle = '#FFFFFF';
          rawMaskCtx.fillRect(0, 0, w, h);
        }
        finishInitialization();
      }
    };
    origImg.src = originalImage;
  }, [isOpen, originalImage, aiTransparentImage]);

  // Redraw the main workspace canvas whenever mask, zoom, pan, or background changes
  useEffect(() => {
    if (isLoaded) {
      drawWorkspace();
    }
  }, [isLoaded, zoomScale, panOffset, previewBg, mousePos]);

  // Setup ResizeObserver to handle canvas resizing dynamically and trigger initial auto-fit
  useEffect(() => {
    if (!isOpen || !isLoaded) return;
    const container = containerRef.current;
    if (!container) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        const canvas = canvasRef.current;
        if (canvas) {
          const sizeChanged = canvas.width !== width || canvas.height !== height;
          canvas.width = width;
          canvas.height = height;
          
          if (!initialFitDoneRef.current && rawMaskCanvasRef.current) {
            autoFitZoom(rawMaskCanvasRef.current.width, rawMaskCanvasRef.current.height);
            initialFitDoneRef.current = true;
          } else if (sizeChanged) {
            drawWorkspace();
          }
        }
      }
    });
    
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [isOpen, isLoaded]);

  // Redraw workspace when mask filters or decontamination settings change
  useEffect(() => {
    if (isLoaded) {
      applyMaskProcessing();
    }
  }, [maskFeather, maskEdgeTrim, decontaminate, decontaminateRadius]);

  // Adjust zoom and position to center the image within screen bounds
  function autoFitZoom(w?: number, h?: number) {
    if (!canvasRef.current || !rawMaskCanvasRef.current) return;
    
    const imgW = w || rawMaskCanvasRef.current.width;
    const imgH = h || rawMaskCanvasRef.current.height;
    
    const canvas = canvasRef.current;
    
    // Resize visible canvas to fit parent dimensions
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    
    const pad = 40;
    const scaleW = (canvas.width - pad) / imgW;
    const scaleH = (canvas.height - pad) / imgH;
    const fitScale = Math.min(scaleW, scaleH);
    
    const clampedScale = Math.min(Math.max(fitScale, 0.05), 2.0);
    
    const centerX = (canvas.width - imgW * clampedScale) / 2;
    const centerY = (canvas.height - imgH * clampedScale) / 2;
    
    setZoomScale(clampedScale);
    setPanOffset({ x: centerX, y: centerY });
  }

  // Helper to remove white/light background halos around the cutout edges
  function decontaminateImage(
    origCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement,
    radius: number
  ): HTMLCanvasElement {
    const w = origCanvas.width;
    const h = origCanvas.height;
    
    const result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    const resCtx = result.getContext('2d');
    if (!resCtx) return origCanvas;
    
    // Draw original image first
    resCtx.drawImage(origCanvas, 0, 0);
    
    const origCtx = origCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!origCtx || !maskCtx) return result;
    
    try {
      const origData = origCtx.getImageData(0, 0, w, h);
      const maskData = maskCtx.getImageData(0, 0, w, h);
      const resData = resCtx.getImageData(0, 0, w, h);
      
      const origPixels = origData.data;
      const maskPixels = maskData.data;
      const resPixels = resData.data;
      
      // Build concentric search offsets within the specified radius
      const searchOffsets: { dx: number; dy: number; dist: number }[] = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const dist = dx * dx + dy * dy;
          if (dist <= radius * radius) {
            searchOffsets.push({ dx, dy, dist });
          }
        }
      }
      // Sort offsets by distance so we find the closest opaque pixel first
      searchOffsets.sort((a, b) => a.dist - b.dist);
      
      // Loop over mask pixels and decontaminate semi-transparent regions
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const alpha = maskPixels[idx + 3];
          
          // Only decontaminate edge pixels with partial transparency
          if (alpha > 0 && alpha < 255) {
            for (let i = 0; i < searchOffsets.length; i++) {
              const sx = x + searchOffsets[i].dx;
              const sy = y + searchOffsets[i].dy;
              if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                const sIdx = (sy * w + sx) * 4;
                // Look for a nearby fully opaque pixel (alpha >= 250)
                if (maskPixels[sIdx + 3] >= 250) {
                  resPixels[idx] = origPixels[sIdx];
                  resPixels[idx + 1] = origPixels[sIdx + 1];
                  resPixels[idx + 2] = origPixels[sIdx + 2];
                  break;
                }
              }
            }
          }
        }
      }
      resCtx.putImageData(resData, 0, 0);
    } catch (e) {
      console.error('Error during color decontamination:', e);
    }
    
    return result;
  }

  // Run the blur & shift threshold mask operations (Feathering and Trim)
  function applyMaskProcessing() {
    const rawMask = rawMaskCanvasRef.current;
    const procMask = processedMaskCanvasRef.current;
    if (!rawMask || !procMask) return;
    
    const w = rawMask.width;
    const h = rawMask.height;
    const procCtx = procMask.getContext('2d');
    if (!procCtx) return;
    
    procCtx.clearRect(0, 0, w, h);
    
    // Case 1: No post-processing parameters applied
    if (maskFeather === 0 && maskEdgeTrim === 0) {
      procCtx.drawImage(rawMask, 0, 0);
      
      // Update decontaminated canvas if enabled
      if (decontaminate && originalCanvasRef.current) {
        decontaminatedCanvasRef.current = decontaminateImage(
          originalCanvasRef.current,
          procMask,
          decontaminateRadius
        );
      } else {
        decontaminatedCanvasRef.current = null;
      }
      
      drawWorkspace();
      return;
    }
    
    // Case 2: Apply blurring first
    procCtx.save();
    // Blur is proportional to feather and edge trim to create a gradient boundary for thresholding
    const blurRadius = maskFeather + Math.abs(maskEdgeTrim) * 0.5;
    procCtx.filter = `blur(${Math.max(blurRadius, 0.1)}px)`;
    procCtx.drawImage(rawMask, 0, 0);
    procCtx.restore();
    
    // Read blurred mask pixels to apply thresholding shift (erosion/dilation) and sharpen/feather edges
    try {
      const imgData = procCtx.getImageData(0, 0, w, h);
      const data = imgData.data;
      
      // Shift: positive values shift transition point higher (restricts mask, eroding borders)
      // negative values shift transition point lower (expands mask, dilating borders)
      const shift = (maskEdgeTrim / 10) * 0.25;
      
      // Contrast slope: determines sharpness of the transition.
      // High contrast (low feather) makes a sharp mask; low contrast (high feather) makes a soft mask.
      const k = maskFeather === 0 ? 100 : (18 / maskFeather);
      
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        // Map blurred alpha through our sigmoid-like ramp:
        const newAlpha = Math.min(Math.max((alpha - 0.5 + shift) * k + 0.5, 0), 1);
        
        data[i] = 255; // Keep RGB white
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.round(newAlpha * 255);
      }
      procCtx.putImageData(imgData, 0, 0);
      
      // Update decontaminated canvas if enabled
      if (decontaminate && originalCanvasRef.current) {
        decontaminatedCanvasRef.current = decontaminateImage(
          originalCanvasRef.current,
          procMask,
          decontaminateRadius
        );
      } else {
        decontaminatedCanvasRef.current = null;
      }
    } catch (err) {
      console.error('Error applying pixel mask filters:', err);
    }
    
    drawWorkspace();
  }

  // Composite checkerboard or background color + masked cutout
  function drawWorkspace() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Resize visible canvas buffer dynamically to fit parent container if needed
    const container = canvas.parentElement;
    if (container) {
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    }
    
    // Clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw chosen preview background
    if (previewBg === 'checkerboard') {
      ctx.fillStyle = '#111827'; // Dark background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const size = 16;
      ctx.fillStyle = '#1f2937'; // Checker block
      for (let y = 0; y < canvas.height; y += size * 2) {
        for (let x = 0; x < canvas.width; x += size * 2) {
          ctx.fillRect(x, y, size, size);
          ctx.fillRect(x + size, y + size, size, size);
        }
      }
    } else {
      ctx.fillStyle = previewBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Use decontaminated canvas if enabled, otherwise use original canvas
    const originalCanvas = decontaminate && decontaminatedCanvasRef.current
      ? decontaminatedCanvasRef.current
      : originalCanvasRef.current;
      
    const procMaskCanvas = processedMaskCanvasRef.current;
    if (!originalCanvas || !procMaskCanvas) return;
    
    // 2. Render composite cutout offscreen to avoid flickering
    const w = originalCanvas.width;
    const h = originalCanvas.height;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      // Draw original image (or decontaminated version)
      tempCtx.drawImage(originalCanvas, 0, 0);
      
      // Mask it with the processed mask canvas
      tempCtx.globalCompositeOperation = 'destination-in';
      tempCtx.drawImage(procMaskCanvas, 0, 0);
      
      // Draw the composited cutout onto the workspace with current Zoom/Pan
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoomScale, zoomScale);
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    }
    
    // 3. Draw brush indicator circle (unless panning)
    if (brushMode !== 'pan' && mousePos && !isDraggingRef.current) {
      ctx.save();
      ctx.beginPath();
      // Draw a circle corresponding to the brush size on the screen
      ctx.arc(mousePos.x, mousePos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = brushMode === 'erase' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(16, 185, 129, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Draw a central dot
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = brushMode === 'erase' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)';
      ctx.fill();
      ctx.restore();
    }
  }

  // Core brush stroke drawing on mask
  const drawMaskStroke = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    size: number,
    hardness: number,
    mode: 'restore' | 'erase'
  ) => {
    ctx.save();
    
    // Setup drawing composite mode
    if (mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const radius = size / 2;
    
    // Draw brush strokes:
    // If hardness is 100%, we draw a simple solid line.
    // If hardness is soft, we draw overlapping radial gradient circles along the path
    if (hardness >= 0.95) {
      ctx.lineWidth = size;
      ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      // Determine spacing: draw a circle every 5% of brush diameter for a smooth continuous stroke
      const step = Math.max(1, radius * 0.1);
      const steps = Math.ceil(dist / step);
      
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const cx = x1 + (x2 - x1) * t;
        const cy = y1 + (y2 - y1) * t;
        
        // Create radial gradient for soft brush
        const grad = ctx.createRadialGradient(cx, cy, radius * hardness, cx, cy, radius);
        if (mode === 'erase') {
          // In destination-out, fully opaque color erases completely, transparent color keeps pixels
          grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
        } else {
          // In source-over, white fills the alpha mask
          grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
          grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        }
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.restore();
  };

  // Convert screen canvas coordinates back to image pixel coordinate space
  const screenToImageCoords = (screenX: number, screenY: number) => {
    return {
      x: (screenX - panOffset.x) / zoomScale,
      y: (screenY - panOffset.y) / zoomScale,
    };
  };

  const handleZoomChange = (factor: number) => {
    if (!canvasRef.current || !rawMaskCanvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Zoom centered around the middle of the screen
    const screenX = canvas.width / 2;
    const screenY = canvas.height / 2;
    
    const imgCoords = screenToImageCoords(screenX, screenY);
    const newScale = zoomScale * factor;
    const clampedScale = Math.min(Math.max(newScale, 0.05), 10.0);
    
    const newPanX = screenX - imgCoords.x * clampedScale;
    const newPanY = screenY - imgCoords.y * clampedScale;
    
    setZoomScale(clampedScale);
    setPanOffset({ x: newPanX, y: newPanY });
  };

  // Pointer handlers (mouse, touch and pen). Capturing the pointer keeps a
  // stroke going even if the finger/cursor briefly leaves the canvas.
  const handleMouseDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !rawMaskCanvasRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    if (brushMode === 'pan' || e.button === 1 || isSpacePressedRef.current) {
      // Start panning
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    } else if (e.button === 0) {
      // Start painting
      isPaintingRef.current = true;
      const imgCoords = screenToImageCoords(screenX, screenY);
      lastPaintPosRef.current = imgCoords;
      
      const rawMaskCtx = rawMaskCanvasRef.current.getContext('2d');
      if (rawMaskCtx) {
        // Adjust brush size to fit original image resolution space (minimum 1.5px to avoid invisible strokes)
        const scaledBrushSize = Math.max(brushSize / zoomScale, 1.5);
        const strokeMode: 'restore' | 'erase' = brushMode === 'restore' ? 'restore' : 'erase';
        drawMaskStroke(
          rawMaskCtx,
          imgCoords.x,
          imgCoords.y,
          imgCoords.x,
          imgCoords.y,
          scaledBrushSize,
          brushHardness,
          strokeMode
        );
        
        // Paint immediately onto the processed canvas too for visual lag-free response
        const procCtx = processedMaskCanvasRef.current?.getContext('2d');
        if (procCtx) {
          drawMaskStroke(
            procCtx,
            imgCoords.x,
            imgCoords.y,
            imgCoords.x,
            imgCoords.y,
            scaledBrushSize,
            brushHardness,
            strokeMode
          );
        }
        drawWorkspace();
      }
    }
  };

  const handleMouseMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    setMousePos({ x: screenX, y: screenY });
    
    if (isDraggingRef.current && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    } else if (isPaintingRef.current && lastPaintPosRef.current && rawMaskCanvasRef.current) {
      const imgCoords = screenToImageCoords(screenX, screenY);
      const rawMaskCtx = rawMaskCanvasRef.current.getContext('2d');
      if (rawMaskCtx) {
        const scaledBrushSize = Math.max(brushSize / zoomScale, 1.5);
        const strokeMode: 'restore' | 'erase' = brushMode === 'restore' ? 'restore' : 'erase';
        drawMaskStroke(
          rawMaskCtx,
          lastPaintPosRef.current.x,
          lastPaintPosRef.current.y,
          imgCoords.x,
          imgCoords.y,
          scaledBrushSize,
          brushHardness,
          strokeMode
        );
        
        const procCtx = processedMaskCanvasRef.current?.getContext('2d');
        if (procCtx) {
          drawMaskStroke(
            procCtx,
            lastPaintPosRef.current.x,
            lastPaintPosRef.current.y,
            imgCoords.x,
            imgCoords.y,
            scaledBrushSize,
            brushHardness,
            strokeMode
          );
        }
        drawWorkspace();
      }
      lastPaintPosRef.current = imgCoords;
    }
  };

  const handleMouseUpOrLeave = () => {
    if (isPaintingRef.current) {
      isPaintingRef.current = false;
      lastPaintPosRef.current = null;
      // When user finishes painting, apply mask refinement filters (feather, trim) on the newly updated path
      applyMaskProcessing();
    }
    isDraggingRef.current = false;
    dragStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const imgCoords = screenToImageCoords(screenX, screenY);
    
    const factor = 1.15;
    const newScale = e.deltaY < 0 ? zoomScale * factor : zoomScale / factor;
    const clampedScale = Math.min(Math.max(newScale, 0.05), 10.0);
    
    // Zoom centered around cursor position
    const newPanX = screenX - imgCoords.x * clampedScale;
    const newPanY = screenY - imgCoords.y * clampedScale;
    
    setZoomScale(clampedScale);
    setPanOffset({ x: newPanX, y: newPanY });
  };

  // Quick action handlers
  const handleResetToAI = () => {
    const rawMask = rawMaskCanvasRef.current;
    const rawCtx = rawMask?.getContext('2d');
    if (!rawMask || !rawCtx) return;
    
    rawCtx.clearRect(0, 0, rawMask.width, rawMask.height);
    
    if (aiImageRef.current) {
      rawCtx.drawImage(aiImageRef.current, 0, 0, rawMask.width, rawMask.height);
      const imgData = rawCtx.getImageData(0, 0, rawMask.width, rawMask.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
      rawCtx.putImageData(imgData, 0, 0);
    } else {
      rawCtx.fillStyle = '#FFFFFF';
      rawCtx.fillRect(0, 0, rawMask.width, rawMask.height);
    }
    
    applyMaskProcessing();
  };

  const handleRestoreAll = () => {
    const rawMask = rawMaskCanvasRef.current;
    const rawCtx = rawMask?.getContext('2d');
    if (!rawMask || !rawCtx) return;
    
    rawCtx.fillStyle = '#FFFFFF';
    rawCtx.fillRect(0, 0, rawMask.width, rawMask.height);
    
    applyMaskProcessing();
  };

  const handleEraseAll = () => {
    const rawMask = rawMaskCanvasRef.current;
    const rawCtx = rawMask?.getContext('2d');
    if (!rawMask || !rawCtx) return;
    
    rawCtx.clearRect(0, 0, rawMask.width, rawMask.height);
    
    applyMaskProcessing();
  };

  // Compile final refined image and close modal
  const handleApply = () => {
    const originalCanvas = originalCanvasRef.current;
    const procMaskCanvas = processedMaskCanvasRef.current;
    if (!originalCanvas || !procMaskCanvas) return;
    
    setIsProcessing(true);
    
    setTimeout(() => {
      try {
        const w = originalCanvas.width;
        const h = originalCanvas.height;
        
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = w;
        outputCanvas.height = h;
        const outCtx = outputCanvas.getContext('2d');
        
        if (outCtx) {
          // Use decontaminated canvas if enabled
          const sourceCanvas = decontaminate && decontaminatedCanvasRef.current
            ? decontaminatedCanvasRef.current
            : originalCanvas;
            
          outCtx.drawImage(sourceCanvas, 0, 0);
          outCtx.globalCompositeOperation = 'destination-in';
          outCtx.drawImage(procMaskCanvas, 0, 0);
          
          const dataURL = outputCanvas.toDataURL('image/png');
          onApply(dataURL);
          onClose();
        }
      } catch (err) {
        console.error('Failed to compile output cutout:', err);
        alert('An error occurred while compiling the final image.');
      } finally {
        setIsProcessing(false);
      }
    }, 100);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col md:flex-row bg-bg-app/98 backdrop-blur-xl border border-border-app overflow-hidden text-text-primary select-none animate-in fade-in duration-300">
      
      {/* Left Workspace Panel: Interactive Drawing Area */}
      <div ref={containerRef} className="flex-1 relative flex flex-col min-h-0 bg-bg-app">
        
        {/* Workspace Toolbar */}
        <div className="flex items-center justify-between border-b border-border-app bg-bg-app/70 p-4 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
              <FiScissors className="w-4 h-4 text-foreground" /> Refine cutout editor
            </h2>
            <span className="w-1.5 h-3 bg-border-app" />
            <p className="hidden sm:block text-xs text-text-secondary font-medium">
              Paint to erase or restore background details manually
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Zoom Percentage */}
            <span className="text-[11px] font-semibold text-text-secondary bg-card-app/40 px-2.5 py-1 rounded-lg border border-border-app select-none">
              {Math.round(zoomScale * 100)}%
            </span>
            
            {/* Zoom Controls */}
            <button
              onClick={() => handleZoomChange(1.25)}
              className="px-2.5 py-1 rounded-lg bg-card-app border border-border-app hover:bg-border-app text-[11.5px] font-semibold text-text-secondary hover:text-text-primary cursor-pointer active:scale-[0.97] transition-all"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={() => handleZoomChange(0.8)}
              className="px-2.5 py-1 rounded-lg bg-card-app border border-border-app hover:bg-border-app text-[11.5px] font-black text-text-secondary hover:text-text-primary cursor-pointer shadow active:scale-[0.97] transition-all"
              title="Zoom Out"
            >
              -
            </button>
            
            <span className="w-px h-4 bg-border-app mx-1" />
            
            <button
              onClick={() => {
                if (rawMaskCanvasRef.current) {
                  autoFitZoom(rawMaskCanvasRef.current.width, rawMaskCanvasRef.current.height);
                } else {
                  autoFitZoom();
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-card-app border border-border-app hover:bg-border-app text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer shadow"
              title="Reset view bounds"
            >
              Fit Screen
            </button>
            <button
              onClick={() => {
                setZoomScale(1.0);
                if (rawMaskCanvasRef.current && canvasRef.current) {
                  const x = (canvasRef.current.width - rawMaskCanvasRef.current.width) / 2;
                  const y = (canvasRef.current.height - rawMaskCanvasRef.current.height) / 2;
                  setPanOffset({ x, y });
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-card-app border border-border-app hover:bg-border-app text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer shadow"
            >
              100% Zoom
            </button>
          </div>
        </div>

        {/* Drawing canvas workspace */}
        <div className="flex-1 relative min-h-0 overflow-hidden cursor-crosshair">
          {!isLoaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <svg className="animate-spin h-8 w-8 text-accent-app" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs font-bold text-text-secondary">Loading editor workspace...</span>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onPointerDown={handleMouseDown}
              onPointerMove={handleMouseMove}
              onPointerUp={handleMouseUpOrLeave}
              onPointerCancel={handleMouseUpOrLeave}
              onPointerLeave={handleMouseUpOrLeave}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 w-full h-full block touch-none"
            />
          )}
        </div>

        {/* Tips Footer */}
        <div className="border-t border-border-app bg-panel-app/65 py-2 px-4 flex items-center justify-between text-[11px] text-text-secondary font-bold z-10 shrink-0">
          <div className="flex items-center gap-1.5">
            <FaRegLightbulb className="w-3.5 h-3.5 text-accent-hover" />
            <span>Hold Space / Middle Click to Pan</span>
          </div>
          <div>Scroll to Zoom • Left Click to Paint</div>
        </div>
      </div>

      {/* Right Controls Panel: Brushes, Tuning & Settings */}
      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border-app bg-panel-app flex flex-col shrink-0 min-h-0">
        
        <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-4">
          
          {/* Tool Selector Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-text-secondary pl-0.5">Select tool</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setBrushMode('erase')}
                className={`py-2 px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer select-none
                  ${brushMode === 'erase'
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-300 ring-1 ring-rose-500/20'
                    : 'bg-card-app/40 border-border-app text-text-secondary hover:bg-card-app hover:text-text-primary'
                  }
                `}
              >
                <FaEraser className="w-5 h-5 text-rose-350" />
                <span className="text-xs font-bold">Eraser</span>
              </button>
              
              <button
                onClick={() => setBrushMode('restore')}
                className={`py-2 px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer select-none
                  ${brushMode === 'restore'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'bg-card-app/40 border-border-app text-text-secondary hover:bg-card-app hover:text-text-primary'
                  }
                `}
              >
                <FaPaintBrush className="w-5 h-5 text-emerald-350" />
                <span className="text-xs font-bold">Restore</span>
              </button>
              
              <button
                onClick={() => setBrushMode('pan')}
                className={`py-2 px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer select-none
                  ${brushMode === 'pan'
                    ? 'bg-accent-app/10 border-accent-app/40 text-accent-app ring-1 ring-accent-app/20 shadow-[0_0_12px_rgba(194,65,12,0.25)]'
                    : 'bg-card-app/40 border-border-app text-text-secondary hover:bg-card-app hover:text-text-primary'
                  }
                `}
              >
                <FaHandPaper className="w-5 h-5 text-accent-hover" />
                <span className="text-xs font-bold">Pan View</span>
              </button>
            </div>
          </div>

          {/* Brush Settings Slider Panel */}
          {brushMode !== 'pan' && (
            <div className="card-chai rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <FiSettings className="w-4 h-4 text-text-secondary" /> Brush settings
              </h3>
              
              {/* Brush Size Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-text-secondary">
                  <span>Size</span>
                  <span>{brushSize} px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={120}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-card-app accent-accent-app"
                />
              </div>

              {/* Brush Hardness Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-text-secondary">
                  <span>Edge hardness</span>
                  <span>{Math.round(brushHardness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={brushHardness}
                  onChange={(e) => setBrushHardness(Number(e.target.value))}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-card-app accent-accent-app"
                />
              </div>
            </div>
          )}

          {/* Edge Refinements Sliders (Feathering and Trim) */}
          <div className="card-chai rounded-2xl p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <BsStars className="w-4 h-4 text-accent-app" /> Edge refinements
            </h3>
            
            {/* Edge Trim Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-text-secondary">
                <span className="flex items-center gap-1">Trim / Expand</span>
                <span>{maskEdgeTrim > 0 ? `+${maskEdgeTrim}` : maskEdgeTrim} px</span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                value={maskEdgeTrim}
                onChange={(e) => setMaskEdgeTrim(Number(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-card-app accent-accent-app"
              />
              <p className="text-[10px] text-text-secondary leading-tight">
                Trim edges inwards to remove background color halos.
              </p>
            </div>

            {/* Edge Softness Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-text-secondary">
                <span>Softness (Feather)</span>
                <span>{maskFeather} px</span>
              </div>
              <input
                type="range"
                min={0}
                max={15}
                value={maskFeather}
                onChange={(e) => setMaskFeather(Number(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-card-app accent-accent-app"
              />
              <p className="text-[10px] text-text-secondary leading-tight">
                Soften boundary edges to blend naturally with backgrounds.
              </p>
            </div>
            
            {/* Color Decontamination Settings */}
            <div className="border-t border-border-app/40 pt-3 mt-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold text-text-primary">Decontaminate Colors</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={decontaminate}
                    onChange={(e) => setDecontaminate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-card-app peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary peer-checked:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent-app"></div>
                </label>
              </div>
              <p className="text-[10px] text-text-secondary leading-tight">
                Removes light/white halos around hair and edges by bleeding subject colors.
              </p>
              
              {decontaminate && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex justify-between text-[11px] font-bold text-text-secondary">
                    <span>Decontaminate Radius</span>
                    <span>{decontaminateRadius} px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={decontaminateRadius}
                    onChange={(e) => setDecontaminateRadius(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-card-app accent-accent-app"
                  />
                </div>
              )}
            </div>
          </div>
          {/* Background Previews Selector */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-text-secondary pl-0.5">Test background</h3>
            <div className="flex gap-2">
              {[
                { name: 'Grid', value: 'checkerboard', class: 'bg-bg-app border-border-app' },
                { name: 'White', value: '#FFFFFF', class: 'bg-white border-slate-200' },
                { name: 'Royal', value: '#0A5C9E', class: 'bg-[#0A5C9E] border-blue-900/50' },
                { name: 'Gray', value: '#F2F2F2', class: 'bg-[#F2F2F2] border-slate-300' }
              ].map((bg) => {
                const isActive = previewBg === bg.value;
                return (
                  <button
                    key={bg.value}
                    onClick={() => setPreviewBg(bg.value)}
                    title={`Preview on ${bg.name}`}
                    className={`flex-1 py-1.5 text-[10px] font-extrabold rounded-lg border transition-all cursor-pointer text-center select-none
                      ${isActive
                        ? 'border-accent-app ring-2 ring-accent-app/20 text-white bg-card-app/50'
                        : 'border-border-app hover:border-text-secondary text-text-secondary hover:text-text-primary bg-card-app/10'
                      }
                    `}
                  >
                    {bg.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset Mask Operations */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-text-secondary pl-0.5">Reset operations</h3>
            <div className="grid grid-cols-2 gap-2">
              {aiTransparentImage && (
                <button
                  onClick={handleResetToAI}
                  className="py-1.5 rounded-xl border border-border-app hover:border-text-secondary bg-card-app/30 text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer select-none transition-micro text-center"
                >
                  Reset to AI
                </button>
              )}
              <button
                onClick={handleRestoreAll}
                className="py-1.5 rounded-xl border border-border-app hover:border-text-secondary bg-card-app/30 text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer select-none transition-micro text-center"
              >
                Restore All
              </button>
              <button
                onClick={handleEraseAll}
                className="py-1.5 rounded-xl border border-border-app hover:border-text-secondary bg-card-app/30 text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer select-none transition-micro col-span-2 text-center"
              >
                Erase All (Draw Mask manually)
              </button>
            </div>
          </div>
        </div>

        {/* Modal Controls: Cancel & Apply */}
        <div className="border-t border-orange-500/10 p-4 bg-bg-app/80 space-y-2 shrink-0">
          <button
            onClick={handleApply}
            disabled={isProcessing}
            className={`btn-asym w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors
              ${isProcessing
                ? 'opacity-50 cursor-wait bg-white text-black'
                : 'bg-white text-black hover:bg-neutral-200'
              }
            `}
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Processing cutout...</span>
              </>
            ) : (
              <>
                <span>Apply and save edits</span>
                <ArrowUpRight className="w-4 h-4" />
              </>
            )}
          </button>
          
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="btn-asym-mirror w-full py-2 text-xs font-medium border border-border text-neutral-400 hover:text-foreground cursor-pointer transition-colors"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

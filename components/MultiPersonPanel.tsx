'use client';
import { useState, useRef } from 'react';
import { removeBackground } from '@/lib/backgroundRemoval';
import { FiUpload, FiX, FiUser, FiUsers, FiCheckCircle } from 'react-icons/fi';
import { BsStars } from 'react-icons/bs';

interface MultiPersonPanelProps {
  isMultiPersonMode: boolean;
  onMultiPersonModeChange: (val: boolean) => void;
  multiPersonImages: (string | null)[];
  onMultiPersonImagesChange: (images: (string | null)[]) => void;
  bgColor: string;
  maxRows: number; // how many rows available on current grid
}

export default function MultiPersonPanel({
  isMultiPersonMode,
  onMultiPersonModeChange,
  multiPersonImages,
  onMultiPersonImagesChange,
  bgColor,
  maxRows,
}: MultiPersonPanelProps) {
  const [processingSlot, setProcessingSlot] = useState<number | null>(null);
  const [progressMap, setProgressMap] = useState<Record<number, number>>({});
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const slotCount = Math.min(maxRows, 6); // max 6 persons

  const handleImageUpload = async (file: File, slotIndex: number) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawImage = e.target?.result as string;
      if (!rawImage) return;

      setProcessingSlot(slotIndex);
      setProgressMap(prev => ({ ...prev, [slotIndex]: 5 }));

      try {
        // Auto-remove background
        const processed = await removeBackground(
          rawImage,
          'auto',
          (p) => setProgressMap(prev => ({ ...prev, [slotIndex]: p })),
        );

        // Apply bgColor behind the transparent image
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          }
          const finalImage = canvas.toDataURL('image/jpeg', 0.95);
          
          const newImages = [...multiPersonImages];
          // Ensure array is large enough
          while (newImages.length < slotCount) newImages.push(null);
          newImages[slotIndex] = finalImage;
          onMultiPersonImagesChange(newImages);
          setProcessingSlot(null);
        };
        img.src = processed;
      } catch (err) {
        console.error(`Failed to process person ${slotIndex + 1}:`, err);
        // Use raw image as fallback (without BG removal)
        const newImages = [...multiPersonImages];
        while (newImages.length < slotCount) newImages.push(null);
        newImages[slotIndex] = rawImage;
        onMultiPersonImagesChange(newImages);
        setProcessingSlot(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSlotClick = (index: number) => {
    if (processingSlot !== null) return;
    fileInputRefs.current[index]?.click();
  };

  const removeSlot = (index: number) => {
    const newImages = [...multiPersonImages];
    newImages[index] = null;
    onMultiPersonImagesChange(newImages);
  };

  const filledCount = multiPersonImages.filter(img => img !== null).length;

  return (
    <div className="bg-panel-app/60 border border-border-app rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor="multi-person-cb" className="app-label flex items-center gap-1.5 font-bold text-accent-app cursor-pointer">
          <FiUsers className="w-4 h-4" /> Multi-Person Mode
        </label>
        <input
          type="checkbox"
          id="multi-person-cb"
          checked={isMultiPersonMode}
          onChange={(e) => onMultiPersonModeChange(e.target.checked)}
          className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
        />
      </div>

      {isMultiPersonMode && (
        <div className="space-y-3 pt-2.5 border-t border-border-app/40 animate-fadeIn">
          <p className="text-[10px] text-accent-app font-semibold pl-0.5">
            Upload different person photos — each row on the A4 sheet will be a different person (6 photos per row).
          </p>

          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: slotCount }).map((_, idx) => {
              const personImage = multiPersonImages[idx] || null;
              const isProcessing = processingSlot === idx;
              const progress = progressMap[idx] || 0;

              return (
                <div key={idx} className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    ref={(el) => { fileInputRefs.current[idx] = el; }}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, idx);
                      e.target.value = ''; // reset
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => handleSlotClick(idx)}
                    disabled={isProcessing}
                    className={`
                      w-full aspect-square rounded-lg border-2 border-dashed transition-all cursor-pointer
                      flex flex-col items-center justify-center gap-1 overflow-hidden relative
                      ${personImage 
                        ? 'border-accent-app/50 bg-accent-app/5' 
                        : 'border-border-app hover:border-accent-app/40 bg-card-app hover:bg-panel-app'
                      }
                      ${isProcessing ? 'cursor-wait opacity-70' : ''}
                    `}
                  >
                    {personImage ? (
                      <>
                        <img 
                          src={personImage} 
                          alt={`Person ${idx + 1}`} 
                          className="absolute inset-0 w-full h-full object-cover rounded-md"
                        />
                        <div className="absolute top-0.5 right-0.5 bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                          <FiCheckCircle className="w-3 h-3" />
                        </div>
                      </>
                    ) : isProcessing ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-accent-app" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-[9px] font-bold text-accent-app">{progress}%</span>
                      </>
                    ) : (
                      <>
                        <FiUser className="w-5 h-5 text-text-secondary" />
                        <span className="text-[9px] font-bold text-text-secondary">Row {idx + 1}</span>
                      </>
                    )}
                  </button>

                  {personImage && !isProcessing && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeSlot(idx); }}
                      className="absolute -top-1 -left-1 bg-danger-app text-white rounded-full w-4 h-4 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-text-secondary font-semibold">
              {filledCount}/{slotCount} persons uploaded
            </span>
            {filledCount > 0 && (
              <button
                type="button"
                onClick={() => onMultiPersonImagesChange(Array(slotCount).fill(null))}
                className="text-[10px] text-danger-app font-bold cursor-pointer hover:underline"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

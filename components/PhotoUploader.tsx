'use client';
import { useState, useRef, useEffect } from 'react';
import { FiUploadCloud, FiFolder, FiCamera, FiX } from 'react-icons/fi';
import { importImageFile, isImageFile } from '@/lib/imageImport';
import { toast } from '@/lib/toast';

interface PhotoUploaderProps {
  onImageUpload: (imageData: string) => void;
  onImagesUpload?: (images: string[]) => void;
  onProjectLoad?: (projectData: any) => void;
}

const MAX_FILE_BYTES = 40 * 1024 * 1024;

export default function PhotoUploader({ onImageUpload, onImagesUpload, onProjectLoad }: PhotoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadProject = async (file: File) => {
    try {
      const project = JSON.parse(await file.text());
      if (project.originalImage && onProjectLoad) onProjectLoad(project);
      else toast('This file is not a saved project.', 'error');
    } catch {
      toast('That project file could not be opened.', 'error');
    }
  };

  const handleFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    const project = files.find((f) => f.name.toLowerCase().endsWith('.json'));
    if (project) {
      await loadProject(project);
      return;
    }

    const images = files.filter(isImageFile);
    if (images.length === 0) {
      toast('Please choose a photo (JPG, PNG or WEBP) or a saved project (.json).', 'warning');
      return;
    }
    const tooBig = images.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast(`“${tooBig.name}” is larger than 40 MB.`, 'warning');
      return;
    }

    setIsReading(true);
    try {
      if (images.length > 1 && onImagesUpload) {
        const urls = await Promise.all(images.map((f) => importImageFile(f)));
        onImagesUpload(urls);
      } else {
        onImageUpload(await importImageFile(images[0]));
      }
    } catch {
      toast('That photo could not be opened. Try a JPG or PNG.', 'error');
    } finally {
      setIsReading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const openPicker = () => {
    if (!isCameraActive) fileInputRef.current?.click();
  };

  // ── Camera ────────────────────────────────────────────────
  const startCamera = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('No camera is available on this device.', 'warning');
      return;
    }
    setIsCameraActive(true);
    try {
      // Ask for HD; the browser falls back to whatever the camera supports.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      console.error('Camera error:', err);
      toast('Could not open the camera. Check that camera permission is allowed.', 'error');
      setIsCameraActive(false);
    }
  };

  const stopCamera = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setIsCameraActive(false);
  };

  const capturePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // The live preview is mirrored like a mirror, but the saved photo is not:
    // official photos must show the face as others see it.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onImageUpload(canvas.toDataURL('image/jpeg', 0.95));
    stopCamera();
  };

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraStream]);

  return (
    <div
      onClick={openPicker}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      className={`relative w-full border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-colors duration-150 flex flex-col items-center justify-center min-h-[260px] ${
        isCameraActive ? 'cursor-default' : 'cursor-pointer'
      } ${
        isDragging
          ? 'border-accent-app bg-accent-app/5'
          : 'border-border-app bg-card-app hover:border-accent-app/60'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.json"
        id="welcome-file-input"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
        multiple
      />

      {isCameraActive ? (
        <div className="w-full flex flex-col items-center gap-4">
          <div className="relative w-full max-w-md aspect-[4/3] rounded-lg overflow-hidden bg-black">
            <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" playsInline muted />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-[70%] h-[70%] text-white/70">
                <ellipse cx="50" cy="45" rx="20" ry="26" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" />
                <line x1="20" y1="41" x2="80" y2="41" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" />
              </svg>
            </div>
            <p className="absolute bottom-2 inset-x-0 text-center text-[12px] text-white/90 drop-shadow">
              Fit your face inside the oval and look at the camera
            </p>
          </div>
          <div className="flex gap-2 w-full max-w-xs">
            <button type="button" onClick={stopCamera} className="studio-btn studio-btn-secondary flex-1">
              <FiX className="w-4 h-4" /> Cancel
            </button>
            <button type="button" onClick={capturePhoto} className="studio-btn studio-btn-primary flex-1">
              <FiCamera className="w-4 h-4" /> Take photo
            </button>
          </div>
        </div>
      ) : (
        <>
          <span className="w-12 h-12 mb-3 rounded-full bg-accent-app/10 text-accent-app flex items-center justify-center">
            {isReading ? (
              <span className="w-5 h-5 rounded-full border-2 border-accent-app/30 border-t-accent-app animate-spin" />
            ) : (
              <FiUploadCloud className="w-6 h-6" />
            )}
          </span>
          <h3 className="text-[16px] font-semibold text-text-primary mb-1">
            {isReading ? 'Opening photo…' : 'Drop a photo here'}
          </h3>
          <p className="text-[13px] text-text-secondary mb-5 max-w-sm">
            JPG, PNG or WEBP up to 40 MB. Select several photos to make a group sheet, or open a saved project.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 w-full max-w-sm justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
              className="studio-btn studio-btn-primary sm:flex-1"
            >
              <FiFolder className="w-4 h-4" /> Choose photo
            </button>
            <button
              id="uploader-camera-trigger"
              type="button"
              onClick={startCamera}
              className="studio-btn studio-btn-secondary sm:flex-1"
            >
              <FiCamera className="w-4 h-4" /> Use camera
            </button>
          </div>
        </>
      )}
    </div>
  );
}

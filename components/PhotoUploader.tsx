'use client';
import { useState, useRef, useEffect } from 'react';
import { FiUploadCloud, FiFolder, FiCamera, FiCheck, FiRefreshCw } from 'react-icons/fi';

interface PhotoUploaderProps {
  onImageUpload: (imageData: string) => void;
  onImagesUpload?: (images: string[]) => void;
  onProjectLoad?: (projectData: any) => void;
}

export default function PhotoUploader({ onImageUpload, onImagesUpload, onProjectLoad }: PhotoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMultipleFiles = (files: FileList) => {
    if (files.length > 1 && onImagesUpload) {
      const urls: string[] = [];
      let loaded = 0;
      const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (fileArray.length === 0) return;
      
      fileArray.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            urls.push(e.target.result as string);
          }
          loaded++;
          if (loaded === fileArray.length) {
            onImagesUpload(urls);
          }
        };
        reader.readAsDataURL(file);
      });
      return true;
    }
    return false;
  };

  const handleFile = (file: File) => {
    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const project = JSON.parse(e.target?.result as string);
          if (project.originalImage && onProjectLoad) {
            onProjectLoad(project);
          } else {
            alert('Invalid project file format.');
          }
        } catch (err) {
          alert('Error parsing project file.');
        }
      };
      reader.readAsText(file);
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, or WEBP) or a saved project (.json)');
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      alert('Image size should be less than 30MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      onImageUpload(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const handled = handleMultipleFiles(files);
      if (!handled) {
        handleFile(files[0]);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleClick = () => {
    if (!isCameraActive) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const handled = handleMultipleFiles(files);
      if (!handled) {
        handleFile(files[0]);
      }
    }
  };

  // Webcam controls
  const startCamera = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error('Webcam access error:', err);
      alert('Could not access your camera. Please check permissions.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setIsCameraActive(false);
  };

  const capturePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Mirror the camera preview locally for a natural experience
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/png');
        onImageUpload(dataUrl);
        stopCamera();
      }
    }
  };

  useEffect(() => {
    return () => {
      // Clean up camera stream on unmount
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative w-full border border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[300px] h-full
        ${isDragging 
          ? 'border-accent-app bg-panel-app/40 scale-[1.01] shadow-[0_0_20px_rgba(194,65,12,0.15)]' 
          : 'border-border-app bg-panel-app/40 hover:border-accent-app/50 hover:bg-panel-app/60 shadow-lg'
        }
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.json"
        id="welcome-file-input"
        onChange={handleFileChange}
        className="hidden"
        multiple
      />
      
      {isCameraActive ? (
        <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
          <div className="relative w-full aspect-[4/3] max-w-sm rounded-xl overflow-hidden border border-border-app bg-black">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover scale-x-[-1]" 
              playsInline 
              muted 
            />
            {/* Silhouette overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40">
              <svg viewBox="0 0 100 100" className="w-[70%] h-[70%] text-accent-app">
                <ellipse cx="50" cy="45" rx="20" ry="26" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="20" y1="41" x2="80" y2="41" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
              </svg>
            </div>
          </div>
          
          <div className="flex gap-2 w-full max-w-xs select-none">
            <button
               onClick={capturePhoto}
               className="flex-1 py-2 bg-accent-app hover:bg-accent-hover text-white font-extrabold rounded-lg text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer shadow-md flex items-center gap-1.5 justify-center"
             >
               <FiCheck className="w-3.5 h-3.5" /> Capture
             </button>
             <button
               onClick={stopCamera}
               className="px-3 py-2 bg-card-app hover:bg-border-app text-text-primary font-bold rounded-lg text-xs uppercase tracking-wider transition-all cursor-pointer border border-border-app"
             >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Upload SVG Icon */}
          <div className="w-12 h-12 mb-4 rounded-xl bg-bg-app border border-border-app flex items-center justify-center text-accent-app shadow-inner select-none">
            <FiUploadCloud className="w-6 h-6 text-accent-app" />
          </div>

          <h3 className="text-sm font-bold text-text-primary mb-1 select-none">
            Drag & Drop portrait or project here
          </h3>
          <p className="text-[11px] text-text-secondary mb-4 select-none">
            Supports PNG, JPG, WEBP, or saved project .json (Max 30MB)
          </p>

          {/* Action buttons */}
          <div className="flex gap-2 max-w-xs w-full select-none justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="px-4 py-2 bg-accent-app hover:bg-accent-hover text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-1.5 justify-center"
            >
              <FiFolder className="w-3.5 h-3.5" />
              File Upload
            </button>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-card-app border border-border-app hover:bg-border-app text-text-primary font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 justify-center"
            >
              <FiCamera className="w-3.5 h-3.5 text-accent-app" />
              Use Camera
            </button>
          </div>
        </>
      )}
    </div>
  );
}

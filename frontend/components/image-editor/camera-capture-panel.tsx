/**
 * Camera Capture Panel
 * Full-screen camera preview with capture functionality
 * Requests browser permission and shows camera feed
 */

"use client";

import { useCamera } from "@/hooks/use-camera";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Camera,
  Loader2,
  RefreshCw,
  SwitchCamera,
  X,
} from "lucide-react";
import { useCallback, useEffect } from "react";

interface CameraCapturePanelProps {
  /** Called when photo is captured with data URL */
  onCapture: (imageDataUrl: string) => void;
  /** Called when user cancels/closes the camera */
  onCancel: () => void;
  /** Additional class names */
  className?: string;
}

export function CameraCapturePanel({
  onCapture,
  onCancel,
  className,
}: CameraCapturePanelProps) {
  const {
    videoRef,
    canvasRef,
    permissionState,
    isActive,
    isLoading,
    error,
    facingMode,
    startCamera,
    stopCamera,
    toggleFacingMode,
    capturePhoto,
  } = useCamera({ autoStart: true });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Handle capture
  const handleCapture = useCallback(() => {
    const dataUrl = capturePhoto();
    if (dataUrl) {
      stopCamera();
      onCapture(dataUrl);
    }
  }, [capturePhoto, stopCamera, onCapture]);

  // Handle close
  const handleClose = useCallback(() => {
    stopCamera();
    onCancel();
  }, [stopCamera, onCancel]);

  // Render permission denied state
  if (permissionState === "denied") {
    return (
      <div
        className={cn(
          "absolute inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center p-6",
          className
        )}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Camera Access Denied
        </h3>
        <p className="text-white/60 text-center max-w-sm mb-6">
          Please allow camera access in your browser settings to take photos.
        </p>
        <button
          onClick={handleClose}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // Render error state
  if (error && !isLoading) {
    return (
      <div
        className={cn(
          "absolute inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center p-6",
          className
        )}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <AlertCircle className="w-16 h-16 text-amber-400 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Camera Error</h3>
        <p className="text-white/60 text-center max-w-sm mb-6">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => startCamera()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Render loading state
  if (isLoading || !isActive) {
    return (
      <div
        className={cn(
          "absolute inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center",
          className
        )}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
        <p className="text-white/70">
          {permissionState === "prompt"
            ? "Requesting camera permission..."
            : "Starting camera..."}
        </p>
      </div>
    );
  }

  // Render camera preview
  return (
    <div
      className={cn(
        "absolute inset-0 z-50 bg-zinc-950 flex flex-col",
        className
      )}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
        <button
          onClick={handleClose}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Switch Camera Button (only show if multiple cameras might be available) */}
        <button
          onClick={toggleFacingMode}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title={`Switch to ${facingMode === "user" ? "back" : "front"} camera`}
        >
          <SwitchCamera className="w-6 h-6" />
        </button>
      </div>

      {/* Video Preview */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="max-w-full max-h-full object-contain"
          style={{
            transform: facingMode === "user" ? "scaleX(-1)" : undefined,
          }}
        />
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Capture Button */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center p-6 bg-gradient-to-t from-black/50 to-transparent">
        <button
          onClick={handleCapture}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl"
          title="Take Photo"
        >
          <Camera className="w-8 h-8 text-zinc-900" />
        </button>
      </div>
    </div>
  );
}

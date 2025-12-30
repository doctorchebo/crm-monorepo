/**
 * useCamera Hook
 * Manages browser camera access, permissions, and photo capture
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraPermissionState = "prompt" | "granted" | "denied" | null;
export type CameraFacing = "user" | "environment";

export interface UseCameraOptions {
  /** Preferred camera facing mode */
  facingMode?: CameraFacing;
  /** Preferred resolution width */
  width?: number;
  /** Preferred resolution height */
  height?: number;
  /** Auto-start camera when hook mounts */
  autoStart?: boolean;
}

export interface UseCameraReturn {
  /** Video element ref to attach to video element */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Canvas element ref for capturing photos */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Current camera stream */
  stream: MediaStream | null;
  /** Permission state */
  permissionState: CameraPermissionState;
  /** Whether camera is currently active */
  isActive: boolean;
  /** Whether camera is initializing */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current facing mode */
  facingMode: CameraFacing;
  /** Request camera permission and start stream */
  startCamera: () => Promise<boolean>;
  /** Stop camera stream */
  stopCamera: () => void;
  /** Toggle between front/back camera */
  toggleFacingMode: () => Promise<void>;
  /** Capture current frame as data URL */
  capturePhoto: () => string | null;
  /** Capture current frame as Blob */
  capturePhotoBlob: () => Promise<Blob | null>;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const {
    facingMode: initialFacingMode = "environment",
    width = 1920,
    height = 1080,
    autoStart = false,
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionState, setPermissionState] =
    useState<CameraPermissionState>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacing>(initialFacingMode);

  // Check initial permission state
  useEffect(() => {
    const checkPermission = async () => {
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          setPermissionState(result.state as CameraPermissionState);

          // Listen for permission changes
          result.addEventListener("change", () => {
            setPermissionState(result.state as CameraPermissionState);
          });
        }
      } catch {
        // Permission API not supported, will check when requesting
        setPermissionState("prompt");
      }
    };

    checkPermission();
  }, []);

  // Stop camera when component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (): Promise<boolean> => {
    if (isLoading) return false;

    setIsLoading(true);
    setError(null);

    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setPermissionState("granted");
      setIsActive(true);

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }

      setIsLoading(false);
      return true;
    } catch (err: any) {
      setIsLoading(false);

      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setPermissionState("denied");
        setError(
          "Camera access was denied. Please allow camera access in your browser settings."
        );
      } else if (
        err.name === "NotFoundError" ||
        err.name === "DevicesNotFoundError"
      ) {
        setError("No camera found. Please connect a camera and try again.");
      } else if (
        err.name === "NotReadableError" ||
        err.name === "TrackStartError"
      ) {
        setError(
          "Camera is in use by another application. Please close other apps using the camera."
        );
      } else if (err.name === "OverconstrainedError") {
        // Try with simpler constraints
        try {
          const simpleStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });

          streamRef.current = simpleStream;
          setStream(simpleStream);
          setPermissionState("granted");
          setIsActive(true);

          if (videoRef.current) {
            videoRef.current.srcObject = simpleStream;
            await videoRef.current.play();
          }

          return true;
        } catch {
          setError("Could not access camera with the requested settings.");
        }
      } else {
        setError(`Camera error: ${err.message || "Unknown error"}`);
      }

      return false;
    }
  }, [facingMode, width, height, isLoading]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setStream(null);
    setIsActive(false);
  }, []);

  // Toggle facing mode
  const toggleFacingMode = useCallback(async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);

    if (isActive) {
      // Restart camera with new facing mode
      stopCamera();
      // Small delay to ensure stream is fully stopped
      await new Promise((resolve) => setTimeout(resolve, 100));
      await startCamera();
    }
  }, [facingMode, isActive, stopCamera, startCamera]);

  // Capture photo as data URL
  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isActive) {
      return null;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Return as data URL
    return canvas.toDataURL("image/jpeg", 0.92);
  }, [isActive]);

  // Capture photo as Blob
  const capturePhotoBlob = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isActive) {
      return null;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Return as Blob
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        0.92
      );
    });
  }, [isActive]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && !isActive && !isLoading && permissionState !== "denied") {
      startCamera();
    }
  }, [autoStart, isActive, isLoading, permissionState, startCamera]);

  return {
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
    stream,
    permissionState,
    isActive,
    isLoading,
    error,
    facingMode,
    startCamera,
    stopCamera,
    toggleFacingMode,
    capturePhoto,
    capturePhotoBlob,
  };
}

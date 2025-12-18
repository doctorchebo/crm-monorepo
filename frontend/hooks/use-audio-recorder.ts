import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  waveformData: number[];
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  hasPermission: boolean | null;
  pendingSend: boolean; // Flag indicating user wants to send after stop
}

interface UseAudioRecorderOptions {
  maxDuration?: number; // Maximum recording duration in seconds
  sampleRate?: number; // Waveform sample rate in Hz
}

const WAVEFORM_SAMPLES = 100; // Number of waveform samples to keep

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { maxDuration = 300, sampleRate = 10 } = options; // 5 min max, 10 samples/sec

  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    waveformData: [],
    audioBlob: null,
    audioUrl: null,
    error: null,
    hasPermission: null,
    pendingSend: false,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waveformDataRef = useRef<number[]>([]);
  const pendingSendRef = useRef<boolean>(false); // Track pending send across async operations
  const cancelledRef = useRef<boolean>(false); // Track if recording was cancelled

  // Cleanup function
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
  }, []);

  // Check browser support and get preferred MIME type
  const getPreferredMimeType = useCallback(() => {
    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/mpeg",
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }
    return "audio/webm"; // Fallback
  }, []);

  // Request microphone permission
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop()); // Stop immediately, just checking permission
      setState((prev) => ({ ...prev, hasPermission: true, error: null }));
      return true;
    } catch (err) {
      const error =
        err instanceof Error ? err.message : "Microphone permission denied";
      setState((prev) => ({ ...prev, hasPermission: false, error }));
      return false;
    }
  }, []);

  // Sample waveform data from analyser
  const sampleWaveform = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average amplitude
    const sum = dataArray.reduce((acc, val) => acc + val, 0);
    const average = sum / dataArray.length;
    const normalizedValue = average / 255; // Normalize to 0-1

    waveformDataRef.current = [
      ...waveformDataRef.current.slice(-(WAVEFORM_SAMPLES - 1)),
      normalizedValue,
    ];

    setState((prev) => ({
      ...prev,
      waveformData: [...waveformDataRef.current],
    }));
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      // Request permission and get stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      setState((prev) => ({ ...prev, hasPermission: true }));

      // Setup audio context for waveform visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Setup MediaRecorder
      const mimeType = getPreferredMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      waveformDataRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // If recording was cancelled, don't set the blob - just cleanup
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const shouldSend = pendingSendRef.current;
        pendingSendRef.current = false; // Reset the flag
        setState((prev) => ({
          ...prev,
          audioBlob: blob,
          audioUrl: url,
          isRecording: false,
          isPaused: false,
          pendingSend: shouldSend,
        }));
      };

      mediaRecorder.start(100); // Collect data every 100ms
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;

      // Start duration timer
      timerRef.current = setInterval(() => {
        const elapsed =
          (Date.now() - startTimeRef.current) / 1000 +
          pausedDurationRef.current;
        if (elapsed >= maxDuration) {
          stopRecording();
        } else {
          setState((prev) => ({ ...prev, duration: elapsed }));
        }
      }, 100);

      // Start waveform sampling
      waveformIntervalRef.current = setInterval(
        sampleWaveform,
        1000 / sampleRate
      );

      setState((prev) => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        duration: 0,
        waveformData: [],
        audioBlob: null,
        audioUrl: null,
        error: null,
      }));
    } catch (err) {
      const error =
        err instanceof Error ? err.message : "Failed to start recording";
      setState((prev) => ({
        ...prev,
        hasPermission: false,
        error,
        isRecording: false,
      }));
      cleanup();
    }
  }, [cleanup, getPreferredMimeType, maxDuration, sampleRate, sampleWaveform]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      pausedDurationRef.current += (Date.now() - startTimeRef.current) / 1000;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current);
        waveformIntervalRef.current = null;
      }

      setState((prev) => ({ ...prev, isPaused: true }));
    }
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startTimeRef.current = Date.now();

      // Restart timers
      timerRef.current = setInterval(() => {
        const elapsed =
          (Date.now() - startTimeRef.current) / 1000 +
          pausedDurationRef.current;
        if (elapsed >= maxDuration) {
          stopRecording();
        } else {
          setState((prev) => ({ ...prev, duration: elapsed }));
        }
      }, 100);

      waveformIntervalRef.current = setInterval(
        sampleWaveform,
        1000 / sampleRate
      );

      setState((prev) => ({ ...prev, isPaused: false }));
    }
  }, [maxDuration, sampleRate, sampleWaveform]);

  // Stop recording (finalize)
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  // Stop recording and mark for sending (blob will be ready after onstop fires)
  const stopAndSend = useCallback(() => {
    pendingSendRef.current = true;
    stopRecording();
  }, [stopRecording]);

  // Clear the pending send flag (called after actual send)
  const clearPendingSend = useCallback(() => {
    pendingSendRef.current = false;
    setState((prev) => ({ ...prev, pendingSend: false }));
  }, []);

  // Cancel recording (discard)
  const cancelRecording = useCallback(() => {
    // Set cancelled flag BEFORE stopping - this prevents onstop from setting audioBlob
    cancelledRef.current = true;
    pendingSendRef.current = false;
    stopRecording();
    chunksRef.current = [];
    waveformDataRef.current = [];

    // Revoke any existing URL
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      waveformData: [],
      audioBlob: null,
      audioUrl: null,
      error: null,
      hasPermission: state.hasPermission,
      pendingSend: false,
    });
  }, [state.audioUrl, state.hasPermission, stopRecording]);

  // Reset state (after sending)
  const resetRecording = useCallback(() => {
    pendingSendRef.current = false;
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      waveformData: [],
      audioBlob: null,
      audioUrl: null,
      error: null,
      hasPermission: state.hasPermission,
      pendingSend: false,
    });
    waveformDataRef.current = [];
  }, [state.audioUrl, state.hasPermission]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (state.audioUrl) {
        URL.revokeObjectURL(state.audioUrl);
      }
    };
  }, [cleanup, state.audioUrl]);

  return {
    ...state,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    stopAndSend,
    cancelRecording,
    resetRecording,
    requestPermission,
    clearPendingSend,
  };
}

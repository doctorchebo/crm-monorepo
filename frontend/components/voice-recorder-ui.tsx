"use client";

import { Button } from "@/components/ui/button";
import { AudioRecorderState } from "@/hooks/use-audio-recorder";
import { cn } from "@/lib/utils";
import { Mic, Pause, Play, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceRecorderUIProps {
  recorderState: AudioRecorderState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onStopAndSend: () => void;
  onCancel: () => void;
  onSend: () => void;
  className?: string;
}

// Format duration as m:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Live waveform visualization component
function LiveWaveform({
  data,
  isActive,
  className,
}: {
  data: number[];
  isActive: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (data.length === 0) {
      // Draw flat line when no data
      ctx.beginPath();
      ctx.strokeStyle = isActive ? "#22c55e" : "#6b7280";
      ctx.lineWidth = 2;
      ctx.moveTo(0, rect.height / 2);
      ctx.lineTo(rect.width, rect.height / 2);
      ctx.stroke();
      return;
    }

    const barWidth = rect.width / Math.max(data.length, 50);
    const barGap = 1;
    const maxBarHeight = rect.height * 0.8;
    const centerY = rect.height / 2;

    // Draw waveform bars
    ctx.fillStyle = isActive ? "#22c55e" : "#6b7280";

    data.forEach((value, index) => {
      const barHeight = Math.max(value * maxBarHeight, 2);
      const x = index * barWidth;
      const y = centerY - barHeight / 2;

      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(barWidth - barGap, 1), barHeight, 1);
      ctx.fill();
    });
  }, [data, isActive]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full h-8", className)}
      style={{ width: "100%", height: "32px" }}
    />
  );
}

// Static waveform for playback preview
function StaticWaveform({
  data,
  progress = 0,
  className,
}: {
  data: number[];
  progress?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    const barCount = Math.min(data.length, 50);
    const sampledData =
      data.length > barCount
        ? data.filter((_, i) => i % Math.ceil(data.length / barCount) === 0)
        : data;

    if (sampledData.length === 0) {
      // Draw dotted line when no data
      ctx.beginPath();
      ctx.strokeStyle = "#6b7280";
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 2;
      ctx.moveTo(0, rect.height / 2);
      ctx.lineTo(rect.width, rect.height / 2);
      ctx.stroke();
      return;
    }

    const barWidth = rect.width / sampledData.length;
    const barGap = 2;
    const maxBarHeight = rect.height * 0.8;
    const centerY = rect.height / 2;
    const progressX = progress * rect.width;

    sampledData.forEach((value, index) => {
      const barHeight = Math.max(value * maxBarHeight, 3);
      const x = index * barWidth + barGap / 2;
      const y = centerY - barHeight / 2;
      const barMidX = x + (barWidth - barGap) / 2;

      // Color based on progress
      ctx.fillStyle = barMidX <= progressX ? "#22c55e" : "#6b7280";

      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(barWidth - barGap, 2), barHeight, 1);
      ctx.fill();
    });

    // Draw progress indicator (ball)
    if (progress > 0) {
      ctx.beginPath();
      ctx.fillStyle = "#22c55e";
      ctx.arc(progressX, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [data, progress]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full h-8", className)}
      style={{ width: "100%", height: "32px" }}
    />
  );
}

export function VoiceRecorderUI({
  recorderState,
  onPause,
  onResume,
  onStop,
  onStopAndSend,
  onCancel,
  onSend,
  className,
}: VoiceRecorderUIProps) {
  const { isRecording, isPaused, duration, waveformData, audioBlob, audioUrl } =
    recorderState;

  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup preview audio on unmount
  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Play preview
  const playPreview = useCallback(() => {
    if (!audioUrl) return;

    if (!audioPreviewRef.current) {
      audioPreviewRef.current = new Audio(audioUrl);
      audioPreviewRef.current.onended = () => {
        setIsPlayingPreview(false);
        setPreviewProgress(0);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }

    audioPreviewRef.current.play();
    setIsPlayingPreview(true);

    const updateProgress = () => {
      if (audioPreviewRef.current) {
        const progress =
          audioPreviewRef.current.currentTime /
          audioPreviewRef.current.duration;
        setPreviewProgress(isNaN(progress) ? 0 : progress);
        if (!audioPreviewRef.current.paused) {
          animationFrameRef.current = requestAnimationFrame(updateProgress);
        }
      }
    };
    animationFrameRef.current = requestAnimationFrame(updateProgress);
  }, [audioUrl]);

  // Pause preview
  const pausePreview = useCallback(() => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    setIsPlayingPreview(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  // Has a recorded audio ready to preview/send
  const hasRecording = audioBlob !== null;

  // Recording in progress (not paused, not finished)
  const isActiveRecording = isRecording && !isPaused && !hasRecording;

  // Recording is paused (can resume or stop)
  const isRecordingPaused = isRecording && isPaused && !hasRecording;

  // Has finished recording, ready to preview/send
  const isPreviewMode = hasRecording;

  return (
    <div
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 bg-muted/50 rounded-lg",
        className
      )}
    >
      {/* Trash / Cancel button - always first */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
        onClick={() => {
          if (isPlayingPreview) {
            pausePreview();
          }
          onCancel();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* ACTIVE RECORDING: Red dot → Count → Waveform → Pause → Send */}
      {isActiveRecording && (
        <>
          {/* Red recording indicator */}
          <div className="flex-shrink-0">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          </div>

          {/* Duration */}
          <span className="text-sm font-mono text-muted-foreground min-w-[40px] flex-shrink-0">
            {formatDuration(duration)}
          </span>

          {/* Waveform */}
          <div className="flex-1 min-w-0">
            <LiveWaveform data={waveformData} isActive={true} />
          </div>

          {/* Pause button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={onPause}
          >
            <Pause className="h-4 w-4" />
          </Button>

          {/* Send button - stops recording and sends when blob is ready */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={onStopAndSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* PAUSED RECORDING: Play/Pause → Waveform → Time → Mic (resume) → Send */}
      {isRecordingPaused && (
        <>
          {/* Play/Pause preview button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={isPlayingPreview ? pausePreview : playPreview}
          >
            {isPlayingPreview ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Waveform */}
          <div className="flex-1 min-w-0">
            <StaticWaveform data={waveformData} progress={previewProgress} />
          </div>

          {/* Duration */}
          <span className="text-sm font-mono text-muted-foreground min-w-[40px] flex-shrink-0">
            {formatDuration(duration)}
          </span>

          {/* Mic button to resume recording */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-green-500 hover:text-green-600 flex-shrink-0"
            onClick={onResume}
            title="Resume recording"
          >
            <Mic className="h-4 w-4" />
          </Button>

          {/* Send button - stops recording and sends when blob is ready */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={onStopAndSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* PREVIEW MODE (after stop): Play/Pause → Waveform → Time → Send */}
      {isPreviewMode && (
        <>
          {/* Play/Pause preview button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={isPlayingPreview ? pausePreview : playPreview}
          >
            {isPlayingPreview ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Waveform */}
          <div className="flex-1 min-w-0">
            <StaticWaveform data={waveformData} progress={previewProgress} />
          </div>

          {/* Duration */}
          <span className="text-sm font-mono text-muted-foreground min-w-[40px] flex-shrink-0">
            {formatDuration(duration)}
          </span>

          {/* Send button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={onSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

export { formatDuration, LiveWaveform, StaticWaveform };

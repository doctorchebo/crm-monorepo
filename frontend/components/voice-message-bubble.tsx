"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PlaybackSpeed, useAudioItem } from "@/lib/audio-playback-context";
import { cn } from "@/lib/utils";
import { Mic, Pause, Play } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface VoiceMessageBubbleProps {
  audioId: string;
  audioUrl: string;
  duration: number; // Duration in seconds
  waveformData?: number[]; // Pre-computed waveform samples
  senderName?: string;
  senderAvatar?: string;
  isOutgoing?: boolean;
  className?: string;
}

// Format duration as m:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Generate placeholder waveform with seeded random for consistency
function generatePlaceholderWaveform(
  count: number = 40,
  seed?: string
): number[] {
  // Simple seeded random for deterministic waveform based on audioId
  const seededRandom = (s: string, index: number) => {
    const hash = s.split("").reduce((acc, char, i) => {
      return ((acc << 5) - acc + char.charCodeAt(0) + index * 17) | 0;
    }, 0);
    return (Math.abs(hash) % 1000) / 1000;
  };

  return Array.from({ length: count }, (_, i) => {
    const rand = seed ? seededRandom(seed, i) : Math.random();
    return 0.2 + rand * 0.6;
  });
}

// Waveform visualization with seek capability
function WaveformSeekBar({
  data,
  progress = 0,
  duration,
  onSeek,
  isPlaying,
  className,
}: {
  data: number[];
  progress: number;
  duration: number;
  onSeek?: (time: number) => void;
  isPlaying?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw waveform
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

    const barCount = Math.min(data.length, 40);
    const sampledData =
      data.length > barCount
        ? data.filter((_, i) => i % Math.ceil(data.length / barCount) === 0)
        : data.length < barCount
        ? [...data, ...Array(barCount - data.length).fill(0.2)]
        : data;

    const barWidth = rect.width / sampledData.length;
    const barGap = 2;
    const maxBarHeight = rect.height * 0.85;
    const centerY = rect.height / 2;
    const progressX = progress * rect.width;

    // Draw bars
    sampledData.forEach((value, index) => {
      const barHeight = Math.max(value * maxBarHeight, 4);
      const x = index * barWidth + barGap / 2;
      const y = centerY - barHeight / 2;
      const barMidX = x + (barWidth - barGap) / 2;

      // Color based on progress - green for played, gray for unplayed
      ctx.fillStyle = barMidX <= progressX ? "#25D366" : "#9ca3af";

      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(barWidth - barGap, 2), barHeight, 2);
      ctx.fill();
    });

    // Draw progress indicator (ball) on top
    ctx.beginPath();
    ctx.fillStyle = "#25D366";
    ctx.shadowColor = "rgba(37, 211, 102, 0.4)";
    ctx.shadowBlur = 4;
    ctx.arc(progressX, centerY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [data, progress]);

  // Handle click to seek
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !onSeek) return;

      const rect = containerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const seekTime = percentage * duration;
      onSeek(Math.max(0, Math.min(seekTime, duration)));
    },
    [duration, onSeek]
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative cursor-pointer", className)}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-10"
        style={{ width: "100%", height: "40px" }}
      />
    </div>
  );
}

// Speed badge component (shown when playing, replaces avatar)
function SpeedBadge({
  speed,
  onClick,
}: {
  speed: PlaybackSpeed;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center justify-center h-10 w-10 rounded-full bg-green-500 cursor-pointer hover:bg-green-600 transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span className="text-white text-xs font-bold">{speed}x</span>
    </div>
  );
}

// Sender avatar with mic badge (shown when not playing)
function SenderAvatarWithMic({
  name,
  avatarUrl,
}: {
  name?: string;
  avatarUrl?: string;
}) {
  // Generate initials from name, default to "U" for unknown
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 2) || "U"
    : "U";

  return (
    <div className="relative flex-shrink-0">
      <Avatar className="h-10 w-10">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name || "Contact"} />}
        <AvatarFallback className="text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200">
          {initials}
        </AvatarFallback>
      </Avatar>
      {/* Mic badge on avatar - bottom left */}
      <div className="absolute -bottom-0.5 -left-0.5 bg-green-500 rounded-full p-0.5 shadow-sm">
        <Mic className="h-3 w-3 text-white" />
      </div>
    </div>
  );
}

// Right side element: Avatar+Mic when not playing, Speed control when playing
function VoiceMessageRightElement({
  name,
  avatarUrl,
  speed,
  isPlaying,
  onSpeedClick,
}: {
  name?: string;
  avatarUrl?: string;
  speed: PlaybackSpeed;
  isPlaying: boolean;
  onSpeedClick: () => void;
}) {
  if (isPlaying) {
    return <SpeedBadge speed={speed} onClick={onSpeedClick} />;
  }

  return <SenderAvatarWithMic name={name} avatarUrl={avatarUrl} />;
}

export function VoiceMessageBubble({
  audioId,
  audioUrl,
  duration,
  waveformData,
  senderName,
  senderAvatar,
  isOutgoing = false,
  className,
}: VoiceMessageBubbleProps) {
  const {
    isPlaying,
    currentPosition,
    playbackSpeed,
    toggle,
    seek,
    cyclePlaybackSpeed,
    registerAudio,
  } = useAudioItem(audioId, audioUrl);

  const [audioDuration, setAudioDuration] = useState(duration);

  // Memoize waveform to prevent regeneration on every render
  // Use audioId as seed for consistent placeholder generation
  const waveform = React.useMemo(() => {
    if (waveformData) return waveformData;
    return generatePlaceholderWaveform(40, audioId);
  }, [waveformData, audioId]);

  // Register audio on mount
  useEffect(() => {
    registerAudio(audioId, duration);
  }, [audioId, duration, registerAudio]);

  // Load actual duration if not provided
  useEffect(() => {
    if (!duration && audioUrl) {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
      };
      audio.src = audioUrl;
    }
  }, [duration, audioUrl]);

  // Calculate progress
  const progress = audioDuration > 0 ? currentPosition / audioDuration : 0;
  const displayTime = isPlaying
    ? formatDuration(currentPosition)
    : formatDuration(audioDuration);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-2xl max-w-[320px] min-w-[240px]",
        !isOutgoing && "bg-muted",
        className
      )}
    >
      {/* Play/Pause Button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 rounded-full flex-shrink-0",
          "bg-green-500 hover:bg-green-600 text-white hover:text-white"
        )}
        onClick={toggle}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5 fill-current ml-0.5" />
        )}
      </Button>

      {/* Waveform and duration */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <WaveformSeekBar
          data={waveform}
          progress={progress}
          duration={audioDuration}
          onSeek={seek}
          isPlaying={isPlaying}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            {displayTime}
          </span>
        </div>
      </div>

      {/* Sender avatar with mic badge */}
      <VoiceMessageRightElement
        name={senderName}
        avatarUrl={senderAvatar}
        speed={playbackSpeed}
        isPlaying={isPlaying}
        onSpeedClick={cyclePlaybackSpeed}
      />
    </div>
  );
}

export { formatDuration, generatePlaceholderWaveform };

"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

/**
 * Context for carousel state management
 */
interface CarouselContextValue {
  currentIndex: number;
  totalItems: number;
  goToSlide: (index: number) => void;
  goToNext: () => void;
  goToPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);
  if (!context) {
    throw new Error("Carousel components must be used within a Carousel");
  }
  return context;
}

/**
 * Props for the Carousel component
 */
interface CarouselProps {
  /** The carousel items */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Initial index to show */
  defaultIndex?: number;
  /** Callback when the active index changes */
  onIndexChange?: (index: number) => void;
  /** Whether to allow infinite looping */
  loop?: boolean;
}

/**
 * Carousel root component
 * Provides context for carousel navigation state
 */
function Carousel({
  children,
  className,
  defaultIndex = 0,
  onIndexChange,
  loop = false,
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = React.useState(defaultIndex);
  const [totalItems, setTotalItems] = React.useState(0);

  const canGoNext = loop || currentIndex < totalItems - 1;
  const canGoPrev = loop || currentIndex > 0;

  const goToSlide = React.useCallback(
    (index: number) => {
      let newIndex = index;
      if (loop) {
        if (index < 0) newIndex = totalItems - 1;
        else if (index >= totalItems) newIndex = 0;
      } else {
        newIndex = Math.max(0, Math.min(index, totalItems - 1));
      }
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    },
    [totalItems, loop, onIndexChange]
  );

  const goToNext = React.useCallback(() => {
    if (canGoNext) goToSlide(currentIndex + 1);
  }, [currentIndex, canGoNext, goToSlide]);

  const goToPrev = React.useCallback(() => {
    if (canGoPrev) goToSlide(currentIndex - 1);
  }, [currentIndex, canGoPrev, goToSlide]);

  // Register total items count
  const registerItems = React.useCallback((count: number) => {
    setTotalItems(count);
  }, []);

  return (
    <CarouselContext.Provider
      value={{
        currentIndex,
        totalItems,
        goToSlide,
        goToNext,
        goToPrev,
        canGoNext,
        canGoPrev,
      }}
    >
      <CarouselInternalContext.Provider value={{ registerItems }}>
        <div className={cn("relative", className)}>{children}</div>
      </CarouselInternalContext.Provider>
    </CarouselContext.Provider>
  );
}

/**
 * Internal context for item registration
 */
interface CarouselInternalContextValue {
  registerItems: (count: number) => void;
}

const CarouselInternalContext =
  React.createContext<CarouselInternalContextValue | null>(null);

/**
 * Props for CarouselContent
 */
interface CarouselContentProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Container for carousel items
 * Handles the sliding animation
 */
function CarouselContent({ children, className }: CarouselContentProps) {
  const { currentIndex } = useCarousel();
  const internalContext = React.useContext(CarouselInternalContext);
  const childArray = React.Children.toArray(children);

  // Register items count on mount and when children change
  React.useEffect(() => {
    internalContext?.registerItems(childArray.length);
  }, [childArray.length, internalContext]);

  return (
    <div className={cn("overflow-hidden", className)}>
      <div
        className="flex transition-transform duration-300 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {childArray.map((child, index) => (
          <div key={index} className="w-full flex-shrink-0">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Props for CarouselItem
 */
interface CarouselItemProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Single carousel item/slide
 */
function CarouselItem({ children, className }: CarouselItemProps) {
  return <div className={cn("", className)}>{children}</div>;
}

/**
 * Props for navigation buttons
 */
interface CarouselNavButtonProps {
  className?: string;
  iconClassName?: string;
}

/**
 * Previous slide button
 */
function CarouselPrevious({
  className,
  iconClassName,
}: CarouselNavButtonProps) {
  const { goToPrev, canGoPrev } = useCarousel();

  if (!canGoPrev) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        goToPrev();
      }}
      className={cn(
        "absolute left-1 top-1/2 -translate-y-1/2 z-10",
        "p-1 rounded-full bg-background/80 hover:bg-background shadow-sm",
        "border border-border/50",
        "transition-opacity",
        className
      )}
      aria-label="Previous slide"
    >
      <ChevronLeft className={cn("h-4 w-4", iconClassName)} />
    </button>
  );
}

/**
 * Next slide button
 */
function CarouselNext({ className, iconClassName }: CarouselNavButtonProps) {
  const { goToNext, canGoNext } = useCarousel();

  if (!canGoNext) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        goToNext();
      }}
      className={cn(
        "absolute right-1 top-1/2 -translate-y-1/2 z-10",
        "p-1 rounded-full bg-background/80 hover:bg-background shadow-sm",
        "border border-border/50",
        "transition-opacity",
        className
      )}
      aria-label="Next slide"
    >
      <ChevronRight className={cn("h-4 w-4", iconClassName)} />
    </button>
  );
}

/**
 * Props for CarouselDots
 */
interface CarouselDotsProps {
  className?: string;
  dotClassName?: string;
  activeDotClassName?: string;
}

/**
 * Dot indicators for carousel navigation
 */
function CarouselDots({
  className,
  dotClassName,
  activeDotClassName,
}: CarouselDotsProps) {
  const { currentIndex, totalItems, goToSlide } = useCarousel();

  if (totalItems <= 1) return null;

  return (
    <div
      className={cn("flex items-center justify-center gap-1.5 mt-2", className)}
    >
      {Array.from({ length: totalItems }).map((_, index) => (
        <button
          key={index}
          onClick={(e) => {
            e.stopPropagation();
            goToSlide(index);
          }}
          className={cn(
            "w-1.5 h-1.5 rounded-full transition-all duration-200",
            "hover:scale-125",
            index === currentIndex
              ? cn("bg-primary scale-110", activeDotClassName)
              : cn("bg-muted-foreground/30", dotClassName)
          )}
          aria-label={`Go to slide ${index + 1}`}
          aria-current={index === currentIndex ? "true" : "false"}
        />
      ))}
    </div>
  );
}

export {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
};

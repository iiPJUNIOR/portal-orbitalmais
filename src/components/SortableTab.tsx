"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableTabProps {
  id: string;
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
}

export function SortableTab({ id, isActive, onClick, label, count }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-sm font-medium whitespace-nowrap transition-colors cursor-grab active:cursor-grabbing ${
        isActive 
          ? "bg-primary text-primary-foreground" 
          : "hover:bg-gray-100 bg-gray-50 text-gray-700 border"
      }`}
    >
      {label} <span className="text-xs opacity-70">({count})</span>
    </button>
  );
}
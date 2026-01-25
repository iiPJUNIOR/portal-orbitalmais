"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SortableHeaderProps {
  id: string;
  children: React.ReactNode;
}

export function SortableHeader({ id, children }: SortableHeaderProps) {
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
    zIndex: isDragging ? 10 : 1,
    cursor: 'grab',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="text-left px-2 py-2 align-top whitespace-nowrap"
    >
      <div className="flex items-center gap-1" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        {children}
      </div>
    </th>
  );
}
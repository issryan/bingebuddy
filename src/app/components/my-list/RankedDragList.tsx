"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RankedShow } from "@/core/types/show";
import { useMemo, useState } from "react";

function SortableRow({
  show,
  index,
  onPick,
}: {
  show: RankedShow;
  index: number;
  onPick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: show.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
        "bg-white/5 border-white/10",
        "touch-none", // helps avoid iOS scroll-jank while dragging
        isOver ? "border-white/30" : "",
        isDragging ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-white/60 shrink-0">#{index + 1}</span>
        <span className="font-medium truncate">{show.title}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/80">
          Rating: {show.rating}
        </div>

        {/* Drag handle */}
        <button
          type="button"
          className={[
            "rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-white/70",
            "hover:bg-white/10 hover:text-white",
            "cursor-grab active:cursor-grabbing",
            "focus:outline-none focus:ring-2 focus:ring-white/30",
          ].join(" ")}
          aria-label={`Drag to reorder ${show.title}`}
          onClick={onPick}
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
      </div>
    </li>
  );
}

export default function RankedDragList({
  ranked,
  onCommitReorder,
}: {
  ranked: RankedShow[];
  onCommitReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const ids = useMemo(() => ranked.map((s) => s.id), [ranked]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // PointerSensor covers mouse + touch nicely.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // prevents accidental drags
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeShow = useMemo(
    () => ranked.find((s) => s.id === activeId) ?? null,
    [activeId, ranked]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;
    if (active.id === over.id) return;

    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;

    // Commit to localStorage via state.ts
    onCommitReorder(fromIndex, toIndex);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="mt-4 space-y-2">
          {ranked.map((show, index) => (
            <SortableRow
              key={show.id}
              show={show}
              index={index}
              onPick={() => {
                // no-op; keeps the handle a button for accessibility
              }}
            />
          ))}
        </ol>
      </SortableContext>

      <DragOverlay>
        {activeShow ? (
          <div className="rounded-xl border border-white/25 bg-black px-4 py-3 shadow-lg">
            <div className="text-sm text-white/60">Moving</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {activeShow.title}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
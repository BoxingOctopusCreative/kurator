"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
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
import type { ReactNode } from "react";
import { HitlistEntryRow } from "@/components/HitlistEntryRow";
import type { HitlistEntry } from "@/lib/api";
import { reorderHitlistEntries } from "@/lib/api";
import { hitlistEntryCoverAndTitle, hitlistEntryDisplayMarkdown } from "@/lib/hitlistEntryDisplay";

export type HitlistEntryRowExtras = {
  belowTitle?: ReactNode;
  actions?: ReactNode;
};

type SortableRowProps = {
  entry: HitlistEntry;
  rank: number;
  showNumbers: boolean;
  canReorder: boolean;
  showItemOpenLink: boolean;
  extras: HitlistEntryRowExtras;
};

function SortableRow({ entry, rank, showNumbers, canReorder, showItemOpenLink, extras }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !canReorder,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : undefined,
  };
  const { cover, title, category } = hitlistEntryCoverAndTitle(entry);
  return (
    <li ref={setNodeRef} style={style} {...attributes}>
      <HitlistEntryRow
        asListItem={false}
        rank={rank}
        showNumbers={showNumbers}
        dragHandleProps={canReorder ? listeners : undefined}
        cover={cover}
        title={title}
        category={category}
        description={hitlistEntryDisplayMarkdown(entry)}
        itemId={showItemOpenLink ? (entry.item?.id ?? null) : null}
        belowTitle={extras.belowTitle}
        actions={extras.actions}
      />
    </li>
  );
}

type Props = {
  listId: string;
  entries: HitlistEntry[];
  setEntries: (next: HitlistEntry[] | ((prev: HitlistEntry[]) => HitlistEntry[])) => void;
  showNumbers: boolean;
  canReorder: boolean;
  /** When false, the per-row "Open" link is omitted (e.g. public slug view where item pages require sign-in). Default true. */
  showItemOpenLink?: boolean;
  listTag: "ol" | "ul";
  listClassName: string;
  getExtras: (entry: HitlistEntry) => HitlistEntryRowExtras;
};

export function HitlistEntriesSortableList({
  listId,
  entries,
  setEntries,
  showNumbers,
  canReorder,
  showItemOpenLink = true,
  listTag: ListTag,
  listClassName,
  getExtras,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((x) => x.id === active.id);
    const newIndex = entries.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const prev = entries;
    const next = arrayMove(entries, oldIndex, newIndex);
    setEntries(next);
    const ids = next.map((x) => x.id);
    try {
      await reorderHitlistEntries(listId, ids);
    } catch {
      setEntries(prev);
    }
  }

  if (!canReorder) {
    return (
      <ListTag className={listClassName}>
        {entries.map((entry, index) => {
          const { cover, title, category } = hitlistEntryCoverAndTitle(entry);
          const extras = getExtras(entry);
          return (
            <HitlistEntryRow
              key={entry.id}
              rank={index + 1}
              showNumbers={showNumbers}
              cover={cover}
              title={title}
              category={category}
              description={hitlistEntryDisplayMarkdown(entry)}
              itemId={showItemOpenLink ? (entry.item?.id ?? null) : null}
              belowTitle={extras.belowTitle}
              actions={extras.actions}
            />
          );
        })}
      </ListTag>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => void onDragEnd(ev)}>
      <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        <ListTag className={listClassName}>
          {entries.map((entry, index) => (
            <SortableRow
              key={entry.id}
              entry={entry}
              rank={index + 1}
              showNumbers={showNumbers}
              canReorder
              showItemOpenLink={showItemOpenLink}
              extras={getExtras(entry)}
            />
          ))}
        </ListTag>
      </SortableContext>
    </DndContext>
  );
}

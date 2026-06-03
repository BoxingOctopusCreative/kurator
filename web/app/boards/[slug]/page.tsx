import type { Metadata } from "next";
import { BoardDetailClient } from "./BoardDetailClient";

export const metadata: Metadata = {
  title: "Board",
};

export default function BoardDetailPage() {
  return <BoardDetailClient />;
}

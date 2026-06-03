import type { Metadata } from "next";
import { BoardsHomeClient } from "./BoardsHomeClient";

export const metadata: Metadata = {
  title: "Boards",
};

export default function BoardsPage() {
  return <BoardsHomeClient />;
}

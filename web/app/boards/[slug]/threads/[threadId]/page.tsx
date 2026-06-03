import type { Metadata } from "next";
import { BoardThreadClient } from "./BoardThreadClient";

export const metadata: Metadata = {
  title: "Thread",
};

export default function BoardThreadPage() {
  return <BoardThreadClient />;
}

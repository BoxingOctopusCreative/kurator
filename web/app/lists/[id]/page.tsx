import type { Metadata } from "next";
import { ListDetailClient } from "./ListDetailClient";

export const metadata: Metadata = {
  title: "List",
};

export default function ListDetailPage() {
  return <ListDetailClient />;
}

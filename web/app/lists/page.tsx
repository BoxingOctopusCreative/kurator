import type { Metadata } from "next";
import { ListsBrowser } from "@/components/ListsBrowser";

export const metadata: Metadata = {
  title: "Lists",
};

export default function ListsPage() {
  return <ListsBrowser />;
}

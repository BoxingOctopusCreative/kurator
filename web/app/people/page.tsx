import type { Metadata } from "next";
import { PeopleHomeClient } from "./PeopleHomeClient";

export const metadata: Metadata = {
  title: "People",
};

export default function PeoplePage() {
  return <PeopleHomeClient />;
}

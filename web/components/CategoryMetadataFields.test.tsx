import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CategoryFormSlice } from "./CategoryMetadataFields";
import { CategoryMetadataFields } from "./CategoryMetadataFields";

function MusicFormHarness() {
  const [slice, setSlice] = useState<CategoryFormSlice>({});
  return (
    <>
      <CategoryMetadataFields category="music" values={slice} onChange={setSlice} />
      <span data-testid="artist-out">{slice.artist ?? ""}</span>
    </>
  );
}

describe("CategoryMetadataFields", () => {
  it("renders music fields", () => {
    const onChange = vi.fn();
    render(<CategoryMetadataFields category="music" values={{}} onChange={onChange} />);
    expect(screen.getByPlaceholderText(/Kraftwerk/i)).toBeInTheDocument();
    expect(screen.getByText("Format")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Autobahn/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Other…$/ })).toBeInTheDocument();
  });

  it("shows custom format when music format is Other", () => {
    render(
      <CategoryMetadataFields category="music" values={{ format: "other" }} onChange={() => {}} />
    );
    expect(screen.getByPlaceholderText(/MiniDisc/i)).toBeInTheDocument();
  });

  it("updates artist when parent holds slice state", async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="music-harness-root">
        <MusicFormHarness />
      </div>
    );
    const root = screen.getByTestId("music-harness-root");
    const artist = within(root).getByPlaceholderText(/Kraftwerk/i);
    await user.type(artist, "ab");
    expect(within(root).getByTestId("artist-out")).toHaveTextContent("ab");
  });

  it("renders video format options", () => {
    render(<CategoryMetadataFields category="video" values={{}} onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "VHS" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Blu-Ray" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Movie" })).toBeInTheDocument();
  });

  it("renders game platform field", () => {
    render(<CategoryMetadataFields category="game" values={{}} onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/SNES/i)).toBeInTheDocument();
  });

  it("renders author, publisher, year, and ISBN for book", () => {
    render(<CategoryMetadataFields category="book" values={{}} onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: /author/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /publisher/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /year/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^isbn$/i })).toBeInTheDocument();
  });

  it("renders author, publisher, year, and ISBN for manga", () => {
    render(<CategoryMetadataFields category="manga" values={{}} onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: /author/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /publisher/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /year/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^isbn$/i })).toBeInTheDocument();
  });

  it("renders writer, artist, publisher, year, and single-issue controls for comic book", () => {
    render(<CategoryMetadataFields category="comic_book" values={{}} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /single issue/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^writer$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^artist$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /publisher/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /year/i })).toBeInTheDocument();
  });

  it("shows issue # when single issue is checked", () => {
    render(
      <CategoryMetadataFields category="comic_book" values={{ single_issue: true }} onChange={() => {}} />
    );
    expect(screen.getByRole("textbox", { name: /issue #/i })).toBeInTheDocument();
  });
});
